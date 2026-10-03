# ANONVC 2.0

**Anonymous Virgins Club** — CS2 esports dashboard.

## Included
- Broadcast / underground tactical UI
- HOME dashboard
- ROSTER with all 5 operators
- MATCHES and recent form
- STATS / FACEIT status
- Server-side FACEIT Data API integration
- Render deployment config
- Responsive mobile layout

## Team
FACEIT team ID:
`a15fd8cf-bda5-4456-9445-86688331562e`

Players:
- okcm1 — AWPer
- nesternoid — Rifler / Second AWPer
- Byrga_ — Rifler
- undeadstar10 — Support
- zerox252 — Entry Fragger

## Local run
1. Copy `.env.example` to `.env`
2. Put the FACEIT server-side API key in `FACEIT_API_KEY`
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000`

## Render
Create a Node web service from this repository.
- Build command: `npm install`
- Start command: `npm start`
- Environment variable: `FACEIT_API_KEY`
- `FACEIT_TEAM_ID` is already defined in `render.yaml`

Never put the FACEIT API secret into frontend files or commit it to GitHub.

## Footer
ANONVC 2.0 // NO FACES. NO NOISE.
