# Varde AIS relay

An always-on service that holds a persistent [AISStream](https://aisstream.io)
WebSocket, accumulates vessel positions + ship-type (static) data over time,
classifies **tankers** (IMO ship type 80–89), and serves the live snapshot at
`GET /tankers.json`.

Because it runs continuously it catches each vessel's ~6-minute static broadcast,
so **most vessels get correctly classified** — far denser than the one-shot
sample the static Pages build takes.

## Endpoints
- `GET /tankers.json` → `{ available, tankers: GeoItem[] }` (CORS `*`, 30 s cache)
- `GET /health` → `{ ok, vessels, classified }`

## Run locally
```bash
cd relay
npm install
AISSTREAM_API_KEY=your_key npm start   # → http://localhost:8080/tankers.json
```

## Deploy (pick one — free tiers exist)

**Railway** (easiest):
1. Push this repo to GitHub (already done).
2. railway.app → New Project → Deploy from GitHub → pick the repo, set **Root Directory** = `relay`.
3. Add variable `AISSTREAM_API_KEY`.
4. Railway builds the Dockerfile and gives you a public URL, e.g. `https://varde-ais.up.railway.app`.

**Fly.io**:
```bash
cd relay
fly launch --no-deploy          # generates fly.toml (internal_port 8080)
fly secrets set AISSTREAM_API_KEY=your_key
fly deploy
```

**Render**: New → Web Service → root `relay`, Docker, add `AISSTREAM_API_KEY`.

## Point the dashboard at it
Set the relay's public URL as a build-time env var for the web app, then rebuild:

- Local dev / Vercel: add to `web` env → `VITE_AIS_RELAY_URL=https://your-relay-url`
- GitHub Pages: add repo Actions **variable** (not secret) `VITE_AIS_RELAY_URL` and
  reference it in the build step, or hardcode in `.env`.

When set, the app fetches tankers from `${VITE_AIS_RELAY_URL}/tankers.json` live
instead of the hourly sample. If the relay is unreachable it falls back to the
snapshot automatically.
