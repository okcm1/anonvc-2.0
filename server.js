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
  const response = await fetch(API + endpoint, {
    headers: { Authorization: `Bearer ${KEY}` }
  });
  if (!response.ok) throw new Error(`FACEIT API ${response.status}`);
  return response.json();
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
    const players = await Promise.all(members.map(async member => {
      let details = {};
      try { details = await faceit(`/players/${member.user_id}`); } catch (_) {}
      const cs2 = details.games?.cs2 || {};
      return {
        id: member.user_id,
        nickname: member.nickname,
        avatar: details.avatar || member.avatar || '',
        country: details.country || member.country || '',
        faceitUrl: details.faceit_url || member.faceit_url || `https://www.faceit.com/players/${encodeURIComponent(member.nickname)}`,
        skillLevel: cs2.skill_level ?? member.skill_level ?? null,
        elo: cs2.faceit_elo ?? null
      };
    }));
    res.json(players);
  } catch (e) { res.status(503).json({ error: e.message }); }
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
        const ours = sides.find(t => t.team_id === TEAM_ID);
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