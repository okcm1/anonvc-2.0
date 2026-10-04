const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const TEAM_ID = process.env.FACEIT_TEAM_ID || 'a15fd8cf-bda5-4456-9445-86688331562e';
const API = 'https://open.faceit.com/data/v4';
const KEY = process.env.FACEIT_API_KEY;

async function faceit(endpoint) {
  if (!KEY || KEY.includes('PASTE_YOUR')) throw new Error('FACEIT_API_KEY is not configured');
  const response = await fetch(API + endpoint, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!response.ok) throw new Error(`FACEIT API ${response.status}`);
  return response.json();
}

function faceitPlayerUrl(nickname) {
  return `https://www.faceit.com/ru/players/${encodeURIComponent(nickname)}`;
}

function collectPlayers(value, out = []) {
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    for (const item of value) collectPlayers(item, out);
    return out;
  }
  const id = value.player_id || value.user_id || value.id;
  const nickname = value.nickname || value.nick || value.name;
  if (id || nickname) out.push({ id: id ? String(id) : '', nickname: nickname ? String(nickname) : '' });
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') collectPlayers(child, out);
  }
  return out;
}

function uniquePlayers(list) {
  const seen = new Set();
  return list.filter(p => {
    const key = p.id || p.nickname.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sidePlayers(side) {
  return uniquePlayers(collectPlayers(side));
}

function sideHasMember(side, memberIds, memberNicknames) {
  return sidePlayers(side).some(p =>
    (p.id && memberIds.has(p.id)) ||
    (p.nickname && memberNicknames.has(p.nickname.toLowerCase()))
  );
}

function findOurSide(details, memberIds, memberNicknames) {
  const candidates = [];
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(walk);
    const players = sidePlayers(value);
    const hits = players.filter(p =>
      (p.id && memberIds.has(p.id)) ||
      (p.nickname && memberNicknames.has(p.nickname.toLowerCase()))
    );
    if (hits.length) candidates.push({ value, hits });
    for (const child of Object.values(value)) if (child && typeof child === 'object') walk(child);
  }
  walk(details);
  candidates.sort((a,b) => b.hits.length - a.hits.length);
  return candidates[0]?.value || null;
}

function getScore(side, fallback = 0) {
  if (!side || typeof side !== 'object') return fallback;
  const score = side.score ?? side.points ?? side.result?.score;
  return Number.isFinite(Number(score)) ? Number(score) : fallback;
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (_req, res) => {
  res.json({ configured: Boolean(KEY && !KEY.includes('PASTE_YOUR')), teamId: TEAM_ID });
});

app.get('/api/team', async (_req, res) => {
  try { res.json(await faceit(`/teams/${TEAM_ID}`)); }
  catch (e) { res.status(503).json({ error: e.message }); }
});

app.get('/api/team-stats', async (_req, res) => {
  try { res.json(await faceit(`/teams/${TEAM_ID}/stats/cs2`)); }
  catch (e) { res.status(503).json({ error: e.message }); }
});

app.get('/api/players', async (_req, res) => {
  try {
    const team = await faceit(`/teams/${TEAM_ID}`);
    const members = team.members || [];
    const players = await Promise.all(members.map(async member => {
      let details = {};
      try { details = await faceit(`/players/${member.user_id}`); }
      catch (_) {
        try {
          const lookup = await faceit(`/players?nickname=${encodeURIComponent(member.nickname)}&game=cs2`);
          details = lookup?.items?.[0] || {};
        } catch (_) {}
      }
      const cs2 = details.games?.cs2 || {};
      const memberUrl = String(member.faceit_url || '').replace('{lang}', 'ru');
      const detailUrl = String(details.faceit_url || '').replace('{lang}', 'ru');
      return {
        id: details.player_id || member.user_id,
        nickname: details.nickname || member.nickname,
        avatar: details.avatar || member.avatar || '',
        country: details.country || member.country || '',
        faceitUrl: detailUrl || memberUrl || faceitPlayerUrl(member.nickname),
        skillLevel: cs2.skill_level ?? member.skill_level ?? null,
        elo: cs2.faceit_elo ?? member.faceit_elo ?? null
      };
    }));
    res.json(players);
  } catch (e) { res.status(503).json({ error: e.message }); }
});

app.get('/api/matches', async (_req, res) => {
  try {
    const team = await faceit(`/teams/${TEAM_ID}`);
    const members = team.members || [];
    const memberIds = new Set(members.map(m => String(m.user_id)));
    const memberNicknames = new Set(members.map(m => String(m.nickname || '').toLowerCase()));
    const candidates = new Map();

    await Promise.all(members.map(async member => {
      try {
        const history = await faceit(`/players/${member.user_id}/history?game=cs2&limit=100`);
        for (const match of history.items || []) {
          if (match.match_id) candidates.set(match.match_id, match);
        }
      } catch (_) {}
    }));

    const output = [];
    for (const historyMatch of candidates.values()) {
      let details = historyMatch;
      try { details = await faceit(`/matches/${encodeURIComponent(historyMatch.match_id)}`); }
      catch (_) {}

      const allPlayers = uniquePlayers(collectPlayers(details));
      const participants = allPlayers.filter(p =>
        (p.id && memberIds.has(p.id)) ||
        (p.nickname && memberNicknames.has(p.nickname.toLowerCase()))
      );
      const count = participants.length;
      if (count < 1) continue;

      const matchType = count === 5 ? 'TEAM' : count >= 2 ? 'STACK' : 'SOLO';
      const ourSide = findOurSide(details, memberIds, memberNicknames);
      const sides = Object.values(details.teams || historyMatch.teams || {});
      const scores = details.results?.score || historyMatch.results?.score || {};
      const opponentSide = sides.find(side => side !== ourSide) || null;
      const ourTeamId = ourSide?.team_id;
      const opponentTeamId = opponentSide?.team_id;
      const wonByTeamId = details.results?.winner || historyMatch.results?.winner;
      const ourScore = ourTeamId && scores[ourTeamId] !== undefined
        ? Number(scores[ourTeamId]) : getScore(ourSide, 0);
      const opponentScore = opponentTeamId && scores[opponentTeamId] !== undefined
        ? Number(scores[opponentTeamId]) : getScore(opponentSide, 0);
      const won = ourTeamId && wonByTeamId ? wonByTeamId === ourTeamId : ourScore > opponentScore;

      output.push({
        id: historyMatch.match_id,
        url: details.faceit_url || historyMatch.faceit_url,
        status: details.status || historyMatch.status,
        matchType,
        participantCount: count,
        participants: participants.map(p => p.nickname).filter(Boolean),
        won,
        opponent: opponentSide?.nickname || 'FACEIT MATCH',
        ourScore,
        opponentScore,
        timestamp: Number(details.finished_at || historyMatch.finished_at || details.started_at || historyMatch.started_at || 0),
        date: (details.finished_at || historyMatch.finished_at)
          ? new Date(details.finished_at || historyMatch.finished_at).toLocaleDateString('ru-RU') : '—',
        map: details.game_data?.map || details.game_data?.maps?.[0] ||
          historyMatch.game_data?.map || historyMatch.game_data?.maps?.[0] || 'CS2'
      });
    }

    output.sort((a,b) => b.timestamp - a.timestamp);
    res.json(output.slice(0, 50));
  } catch (e) { res.status(503).json({ error: e.message }); }
});

app.get('/api/match/:id', async (req, res) => {
  try {
    const id = encodeURIComponent(req.params.id);
    const [match, stats] = await Promise.all([
      faceit(`/matches/${id}`),
      faceit(`/matches/${id}/stats`).catch(() => null)
    ]);
    res.json({ match, stats });
  } catch (e) { res.status(503).json({ error: e.message }); }
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`AnonVC 2.0 listening on :${PORT}`));
