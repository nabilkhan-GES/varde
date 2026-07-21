import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import { createMap } from './map';
import { buildLayers } from './layers';
import { renderClassVI, renderLayerbar, renderMarkets, renderRadar, renderTopbar } from './ui';
import type {
  ClassViResult,
  FlightResult,
  GeoItem,
  HazardResult,
  LayerData,
  LayerId,
  MarketResult,
  NewsResult,
} from './types';

const REFRESH_MS = 60_000;
// Aircraft + Class VI are ambient/reference layers — shown on the map but kept
// out of the incident radar (Class VI has its own tracker panel).
const LAYER_IDS: LayerId[] = [
  'incidents', 'conflict', 'cyber', 'quakes', 'events', 'disasters', 'storms', 'weather', 'flights', 'classvi',
];
const RADAR_EXCLUDE: LayerId[] = ['flights', 'classvi'];

const data: LayerData = {
  incidents: [], conflict: [], cyber: [], quakes: [], events: [], disasters: [], storms: [], weather: [], flights: [], classvi: [],
};
const visible: Record<LayerId, boolean> = {
  incidents: true, conflict: true, cyber: true, quakes: true, events: true, disasters: true, storms: true, weather: true, flights: true, classvi: true,
};

const { map, overlay } = createMap(document.getElementById('map')!);
let popup: maplibregl.Popup | null = null;

const topbar = renderTopbar(document.getElementById('topbar')!, () => void refresh());
const radar = renderRadar(document.getElementById('radar')!, focusItem);
const layerbar = renderLayerbar(document.getElementById('layerbar')!, visible, (id, on) => {
  visible[id] = on;
  draw();
});
const markets = renderMarkets(document.getElementById('markets')!);
const classvi = renderClassVI(document.getElementById('classvi')!, focusItem);

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m] as string));

// Radar = the situational feed: everything visible except aircraft (which are
// ambient movement, not events), severity-sorted.
function mergedItems(): GeoItem[] {
  const out: GeoItem[] = [];
  for (const id of LAYER_IDS) {
    if (RADAR_EXCLUDE.includes(id) || !visible[id]) continue;
    out.push(...data[id]);
  }
  return out.sort((a, b) => b.severity - a.severity || (b.ts ?? 0) - (a.ts ?? 0)).slice(0, 90);
}

function counts(): Record<LayerId, number> {
  return Object.fromEntries(LAYER_IDS.map((id) => [id, data[id].length])) as Record<LayerId, number>;
}

function draw() {
  overlay.setProps({ layers: buildLayers(data, visible, focusItem) });
  const merged = mergedItems();
  radar.update(merged);
  layerbar.setCounts(counts());
  topbar.setStats(merged.length, merged[0]?.severity ?? 0);
}

function focusItem(it: GeoItem) {
  map.flyTo({ center: [it.lon, it.lat], zoom: Math.max(map.getZoom(), 5), speed: 0.8 });
  popup?.remove();
  popup = new maplibregl.Popup({ closeButton: true, offset: 12 })
    .setLngLat([it.lon, it.lat])
    .setHTML(
      `<div class="pt">${escapeHtml(it.title)}</div>` +
        `<div class="pm">${it.layer} · sev ${it.severity.toFixed(1)}${it.place ? ' · ' + escapeHtml(it.place) : ''}</div>` +
        (it.url ? `<a href="${it.url}" target="_blank" rel="noopener">source ↗</a>` : ''),
    )
    .addTo(map);
}

// Dev + Vercel: live serverless /api/*. Static hosting (GitHub Pages): prebuilt
// data/*.json snapshots written by the Actions cron. import.meta.env picks the path.
const feedUrl = (name: string): string =>
  import.meta.env.DEV ? `/api/${name}` : `${import.meta.env.BASE_URL}data/${name}.json`;

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } catch (err) {
    console.warn(`[varde] ${url} failed:`, err);
    return null;
  }
}

let inFlight = false;
async function refresh() {
  if (inFlight) return;
  inFlight = true;
  topbar.setStale();
  try {
    const [news, haz, fly, mk, cv] = await Promise.all([
      getJson<NewsResult>(feedUrl('news')),
      getJson<HazardResult>(feedUrl('hazards')),
      getJson<FlightResult>(feedUrl('flights')),
      getJson<MarketResult>(feedUrl('markets')),
      getJson<ClassViResult>(feedUrl('classvi')),
    ]);
    if (news) {
      data.incidents = news.incidents;
      data.conflict = news.conflict;
      data.cyber = news.cyber;
    }
    if (haz) {
      data.quakes = haz.quakes;
      data.events = haz.events;
      data.weather = haz.weather;
      data.disasters = haz.disasters;
      data.storms = haz.storms;
    }
    if (fly) data.flights = fly.flights;
    if (mk) markets.update(mk.quotes);
    if (cv) {
      data.classvi = cv.wells;
      classvi.update(cv.wells, cv.note, cv.asOf);
    }
    draw();
    topbar.setUpdated(Date.now());
  } finally {
    inFlight = false;
  }
}

void refresh();
setInterval(() => void refresh(), REFRESH_MS);
