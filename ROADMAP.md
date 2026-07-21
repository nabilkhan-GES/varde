# ROADMAP

## v0.1 — MVP (shipped)
- MapLibre + deck.gl overlay, dark ops shell; color-per-layer, radius-by-severity.
- Seven keyless layers: energy incidents, conflict, cyber (Google News RSS, geocoded);
  seismicity (USGS); natural hazards (NASA EONET); weather alerts (NWS); live aircraft
  (OpenSky). Energy markets ticker (Yahoo). Severity scoring + severity-sorted radar.
  Auto-refresh, layer toggles, click-to-fly popups. Vitest: severity + parseRss.

## v0.2 — Depth on the core layers
- **Precision-aware geocoding:** SHIPPED. The gazetteer now has three tiers —
  energy cities/ports → basins/seas/states → country centroids (`src/server/places.ts`),
  matched most-specific-first, with jitter scaled to precision so city-level dots
  cluster tightly and country-level dots fan out. `geocodeDetailed()` returns the tier.
- **Cross-layer story dedupe:** SHIPPED. `dedupeStories()` (`src/server/news.ts`) unions
  items sharing a canonical URL or normalized title (disjoint-set), keeping the
  highest-severity copy, so one event isn't double-plotted across incidents/conflict/cyber.
- **Weather polygons:** SHIPPED. NWS alert areas render as a filled deck `GeoJsonLayer`
  beneath the point layers (`src/layers.ts`); geometry is carried on `GeoItem.polygon`,
  coordinate-rounded in `hazards.ts` to keep the Pages snapshot lean.
- **GDELT DOC 2.0 (sourcecountry geo):** BUILT but OFF by default (`src/server/gdelt.ts`,
  gate `VARDE_GDELT=1`). Evaluated for the incidents layer; its full-text matching is too
  loose (energy terms collide with data/sales "pipelines" etc.) and it rate-limits to
  ~1 req/5s. Kept behind the flag with a relevance gate + tests; revisit with a tighter
  query or the GEO 2.0 endpoint before enabling.
- **Maritime/AIS** layer (vessel tracking) and **flights** heading/altitude styling.
- **EIA prices** (`EIA_API_KEY`): real spot-price panel + production series.
- **Rig count** parser (Baker Hughes) with a vitest test.

## v0.3 — Flagship PRO layers
- **Class VI (CCUS) permit tracker:** SHIPPED as a curated, sourced snapshot
  (`src/server/data/classvi.json`) with a map layer + tracker panel. TODO: swap in a
  live feed — EPA GSDT (udr.epa.gov) or the Clean Air Task Force national tracker —
  in `src/server/routes/classvi.ts`, and add status-change diffing over snapshots.
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
