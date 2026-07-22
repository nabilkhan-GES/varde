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
- **Weather polygons + storm rings:** SHIPPED. NWS alert areas render as a filled deck
  `GeoJsonLayer` beneath the point layers (`src/layers.ts`); geometry is carried on
  `GeoItem.polygon`, coordinate-rounded in `hazards.ts` to keep the Pages snapshot lean.
  Cyclones get a generated impact ring scaled by real NHC sustained wind (a wind-field
  footprint — the official forecast cone is shapefile/KMZ-only, so not the true cone).
- **Oil Inventories panel:** SHIPPED (`src/server/routes/inventories.ts`, EIA, key-gated).
  ~53-week history of commercial crude, SPR, total oil (commercial+SPR) and Lower-48
  nat-gas working storage, rendered as filled area charts with WoW deltas.
- **Curated trackers:** SHIPPED (`src/server/data/trackers.json`, `routes/trackers.ts`).
  Oil & gas pipeline status, strategic storage atlas, and an energy-supply crisis registry
  as sourced, dated snapshots (same model as Class VI — NOT live). Swap for live feeds later.
- **Dense tables:** Signal & Hazards drill-downs are now columnar tables (Event/Type/Sev/Age).
- **3-column tile grid:** right rail is a 3→2→1 responsive grid; Markets is a full-width ticker.
- **Doppler radar:** SHIPPED. RainViewer keyless raster overlay (native MapLibre raster
  layer, 5-min refresh, isSourceLoaded guard) — map-bar "Radar" toggle.
- **Aircraft icons:** SHIPPED. Flights render as a deck `IconLayer` (inline plane SVG,
  mask+tint), rotated by heading and colored by altitude, pixel-clamped.
- **Clean markers:** all scatter radii clamped in pixels (min 3 / max ~11) so nothing
  balloons; storm rings softened to faint outlines.
- **Day/night terminator:** SHIPPED. Client-computed subsolar terminator as a deck
  `PolygonLayer` (keyless) — map-bar "Day/Night" toggle.
- **Popup legibility fix:** maplibre CSS now loads before ours, so the dark popup wins.
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
