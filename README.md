# Varde

Real-time **energy situational-awareness** dashboard — oil & gas incidents, natural
hazards, seismicity and energy markets on one live map. A focused, energy-tuned
take on the worldmonitor pattern (MapLibre + deck.gl + serverless feeds).

![layers: incidents · seismicity · hazards · markets](https://img.shields.io/badge/layers-4-orange)

## Quick start

```bash
npm install
npm run dev            # http://localhost:5173 — live data, no keys required
```

Every MVP layer uses a **free, keyless** source, so it works immediately. Optional
feeds (EIA prices, NASA FIRMS fires) read keys from `.env` — copy `.env.example`.

```bash
npm run typecheck      # tsc --noEmit
npm run build          # typecheck + production build → dist/
npm test               # vitest
```

## What's on the map

Seven live layers, all **keyless**:

| Layer | Source | Key? |
|---|---|---|
| **Energy incidents** | Google News RSS (spill/blowout/refinery/offshore…), gazetteer-geocoded | no |
| **Conflict** | Google News RSS (war/strike/blockade scoped to energy & infrastructure) | no |
| **Cyber** | Google News RSS (ransomware/breach/SCADA scoped to energy & grid) | no |
| **Seismicity** | USGS earthquakes (M2.5+, past day) | no |
| **Natural hazards** | NASA EONET (wildfires, severe storms, volcanoes, floods) | no |
| **Weather alerts** | NWS active alerts (tornado/severe, US) | no |
| **Live aircraft** | OpenSky Network (Gulf / US energy corridor) | no |
| **Energy markets** | Yahoo (WTI, Brent, Henry Hub, RBOB, XLE) | no |

News layers are scored for **severity** (blowout / fatality / offshore / fire / spill /
missile / ransomware keyword multipliers); each layer has its own color and the radar
panel merges everything (except aircraft), sorted by severity.

## Architecture

- **Client:** Vite + TypeScript, MapLibre GL basemap, deck.gl `ScatterplotLayer`
  overlay. UI is plain DOM (no framework) — `src/ui.ts`.
- **Feeds:** `src/server/routes/*.ts` are framework-free fetch+normalize modules.
  In dev, `vite.config.ts` serves them at `/api/*`; in prod they're the Vercel
  functions in `api/*.ts`. Same code both places.
- **No secrets in the client** — the browser only ever calls same-origin `/api/*`.

See **CLAUDE.md** for conventions and how to add a layer, **ROADMAP.md** for what's next.

## Deploy

**GitHub Pages (no server, no keys) — default.** `.github/workflows/deploy.yml` runs
`npm run snapshot` (fetches every feed server-side → `public/data/*.json`), builds with
`BASE_PATH=/varde/`, and publishes to Pages. A cron refreshes the snapshots **hourly**,
so the live site shows real — if hourly-batched — data with zero backend. Enable once:
repo **Settings → Pages → Source: GitHub Actions**, then push (or run the workflow).
Live at `https://<user>.github.io/varde/`.

**Vercel (live, per-request) — when you want real-time.** Import at vercel.com (auto-detects
Vite); the `/api/*` functions run live so data is current on every refresh. Optional keys
(`EIA_API_KEY`, …) in Project → Settings → Environment Variables.

The client auto-selects the data path: `/api/*` in dev & on Vercel, `data/*.json` on Pages.
Aircraft are the one layer that's only meaningful live (Vercel/dev) — hourly snapshots go stale.

## License

AGPL-3.0-only. Commercial/non-AGPL licensing available separately.
