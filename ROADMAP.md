# ROADMAP

## v0.1 — MVP (shipped)
- MapLibre + deck.gl overlay, dark ops shell; color-per-layer, radius-by-severity.
- Seven keyless layers: energy incidents, conflict, cyber (Google News RSS, geocoded);
  seismicity (USGS); natural hazards (NASA EONET); weather alerts (NWS); live aircraft
  (OpenSky). Energy markets ticker (Yahoo). Severity scoring + severity-sorted radar.
  Auto-refresh, layer toggles, click-to-fly popups. Vitest: severity + parseRss.

## v0.2 — Depth on the core layers
- **Article-level geocoding:** replace headline→gazetteer with real per-article geo
  (GDELT DOC 2.0 sourcecountry + place NER), dedupe by story across the news layers.
- **Weather polygons:** render NWS alert areas as deck `GeoJsonLayer` (not just centroids).
- **Maritime/AIS** layer (vessel tracking) and **flights** heading/altitude styling.
- **EIA prices** (`EIA_API_KEY`): real spot-price panel + production series.
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
