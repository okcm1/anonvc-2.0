const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const TEAM_ID = process.env.FACEIT_TEAM_ID || 'a15fd8cf-bda5-4456-9445-86688331562e';
const API = 'https://open.faceit.com/data/v4';
const KEY = process.env.FACEIT_API_KEY;

const faceitCache = new Map();
const faceitInflight = new Map();
let faceitQueue = Promise.resolve();
let lastFaceitRequest = 0;
const FACEIT_CACHE_CACHE_TTL = 60000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function faceit(endpoint) {
  if (!KEY || KEY.includes('PASTE_YOUR')) throw new Error('FACEIT_API_KEY is not configured');
  const now = Date.now();
  const cached = faceitCache.get(endpoint);
  if (cached && now - cached.at < FACEIT_CACHE_CACHE_TTL) return cached.data;
  if (faceitInflight.has(endpoint)) return faceitInflight.get(endpoint);
  const job = faceitQueue.then(async () => {
    const gap = Date.now() - lastFaceitRequest;
    if (gap < 350) await sleep(350 - gap);
    let lastStatus = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      lastFaceitRequest = Date.now();
      const response = await fetch(API + endpoint, { headers: { Authorization: 'Bearer ' + KEY, Accept: 'application/json' } });
      if (response.ok) {
        const data = await response.json();
        faceitCache.set(endpoint, { at: Date.now(), data });
        return data;
      }
      lastStatus = response.status;
      if (response.status === 429) { await sleep(1000 * (attempt + 1)); continue; }
      throw new Error('FACEIT API ' + response.status);
    }
    throw new Error('FACEIT API ' + lastStatus);
  });
  faceitQueue = job.catch(() => {});
  faceitInflight.set(endpoint, job);
  try { return await job; } finally { faceitInflight.delete(endpoint); }
}

function faceitPlayerUrl(nickname) {
  return `https://www.faceit.com/ru/players/${encodeURIComponent(nickname)}`;
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (_req, res) => {
  res.json({ configured: Boolean(KEY && !KEY.includes('PASTE_YOUR')), teamId: TEAM_ID });
});

app.get('/api/team', async (_req, res) => {
  try { res.json(await faceit(`/teams/${TEAM_ID}`)); }
  catch (e) { res.status(503).json({ error: e.message }); }
});

app.get('/api/players', async (_req, res) => {
  try {
    const team = await faceit(`/teams/${TEAM_ID}`);
    const members = team.members || [];

    // Team membership already contains the public roster data in most cases.
    // Use it first so avatars render even when individual player calls are rate-limited.
    const players = await Promise.all(members.map(async member => {
      let details = {};
      const hasCoreData = member.avatar && (member.skill_level != null || member.faceit_elo != null);

      if (!hasCoreData) {
        try {
          details = await faceit(`/players/${member.user_id}`);
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
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});
app.get('/api/matches', async (_req, res) => {
  try {
    const team = await faceit(`/teams/${TEAM_ID}`);
    const members = team.members || [];
    const matches = new Map();
    await Promise.all(members.map(async member => {
      try {
        const history = await faceit(`/players/${member.user_id}/history?game=cs2&limit=100`);
        for (const match of history.items || []) {
          const sides = Object.values(match.teams || {});
          if (sides.some(t => t.team_id === TEAM_ID)) matches.set(match.match_id, match);
        }
      } catch (_) {}
    }));

    const output = [...matches.values()]
      .sort((a, b) => (b.finished_at || b.started_at || 0) - (a.finished_at || a.started_at || 0))
      .slice(0, 20)
      .map(match => {
        const sides = Object.values(match.teams || {});
        const opponent = sides.find(t => t.team_id !== TEAM_ID);
        const scores = match.results?.score || {};
        return {
          id: match.match_id,
          url: match.faceit_url,
          status: match.status,
          won: match.results?.winner === TEAM_ID,
          opponent: opponent?.nickname || 'UNKNOWN',
          ourScore: scores[TEAM_ID] ?? 0,
          opponentScore: opponent ? (scores[opponent.team_id] ?? 0) : 0,
          date: match.finished_at ? new Date(match.finished_at).toLocaleDateString('ru-RU') : '—',
          map: match.game_data?.map || match.game_data?.maps?.[0] || 'CS2'
        };
      });
    res.json(output);
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
