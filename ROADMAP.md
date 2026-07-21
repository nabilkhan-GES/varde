# ROADMAP

## v0.1 — MVP (shipped)
- MapLibre + deck.gl overlay, dark ops shell.
- Layers: energy incidents (GDELT GEO), seismicity (USGS), natural hazards (NASA EONET).
- Energy markets ticker (Stooq). Severity scoring + severity-sorted radar. Auto-refresh.

## v0.2 — Depth on the core layers
- **Article-level incidents:** switch/augment GDELT GEO with DOC 2.0 ArtList for clean
  titles + per-article geocoding, country-centroid fallback. Dedupe by story.
- **NWS/weather alerts layer** (`api.weather.gov`, keyless) — Gulf/onshore storm risk to
  infrastructure; render alert polygons (deck `GeoJsonLayer`).
- **EIA prices** (`EIA_API_KEY`): real prev-close change + a spot-price mini-panel.
- **Rig count** parser (Baker Hughes) with a vitest test.

## v0.3 — Flagship PRO layers
- **Class VI (CCUS) permit tracker:** `api/classvi.ts` pulling EPA UIC Class VI permit
  data, a map layer, and a panel of recent status changes. Flagship PRO feature.
- **Orphan/legacy well layer** (state RRC / EPA datasets) — ties to relief-well audience.
- **Snapshots + playback:** IndexedDB capture each refresh, 7-day retention, a timeline
  scrubber in the map bar.

## v0.4 — Product
- **AI brief:** `ANTHROPIC_API_KEY` — synthesize the current high-severity set into a
  short situational brief in the radar header.
- **Auth + PRO gating** (Clerk + Stripe): free = map + incidents; PRO = Class VI tracker,
  saved monitors, exports, alerts. Pricing page.
- **Alerting:** Vercel cron evaluates saved monitors + severity thresholds, emails via
  Resend. PRO-gated.
- **Caching:** move `cached()` to Upstash Redis; add a freshness monitor.

## Notes
- Keep every layer emitting `GeoItem` (see CLAUDE.md). Keyless-first; graceful fallback
  when a key is absent. Commit after each working session.
