# CLAUDE.md — Varde

Energy situational-awareness dashboard. Read this before editing; it captures the
architecture and conventions so changes stay consistent.

## Stack
- Vite + TypeScript (no UI framework — DOM in `src/ui.ts`).
- MapLibre GL (keyless CARTO dark raster basemap) + deck.gl `MapboxOverlay`.
- Feeds: framework-free modules in `src/server/routes/`, exposed at `/api/*` by a
  Vite dev plugin (`vite.config.ts`) and by Vercel functions in `api/*.ts`.

## Data flow
`/api/<route>` → `src/server/routes/<route>.ts:handler(searchParams)` → normalized
JSON → `src/main.ts` merges into `data` → `buildLayers()` (deck) + `renderRadar()`.
Every mappable thing is a **`GeoItem`** (`src/types.ts`): `{lon,lat,title,severity,layer,…}`.

## Conventions
- **One normalized shape.** New sources must emit `GeoItem[]` (or extend `types.ts`
  deliberately). Compute `severity` server-side via `src/severity.ts`.
- **Keyless first.** Prefer free/no-key sources; gate keyed feeds behind `process.env`
  with graceful fallback (the layer just returns `[]` if the key is missing).
- **Cache upstream.** Wrap fetches in `cached(key, ttlMs, fn)` (`src/server/util.ts`);
  set `Cache-Control: s-maxage` on the Vercel wrapper.
- **Client never holds secrets.** Browser calls same-origin `/api/*` only.
- **Severity is the currency.** Color (`severityColor`) and radius (`severityRadius`)
  derive from it; the radar sorts by it.

## Add a layer (checklist)
1. `src/server/routes/<name>.ts` — export `async handler(params)` returning
   `{ items: GeoItem[] }`, scored via `severity.ts`, wrapped in `cached()`.
2. `api/<name>.ts` — thin Vercel wrapper (copy an existing one).
3. `src/types.ts` — add the `LayerId`; `src/layers.ts` — add `LAYER_STYLES` entry +
   swatch color; `src/main.ts` — add to `data`, `visible`, and the fetch in `refresh()`.
4. `npm run typecheck && npm run build` before finishing.

## Style rules
- Dark ops aesthetic; tokens in `src/style.css` `:root`. Monospace (`--mono`) for data
  and labels, sans for prose. Semantic severity colors (`--sev-*`) are reserved for
  severity — don't reuse them decoratively. Accent `--accent` (amber) used sparingly.

## Always
Run `npm run typecheck` and `npm run build` before finishing a task, and update this
file + ROADMAP.md when you change the architecture.
