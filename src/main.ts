import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import { createMap } from './map';
import { buildLayers, withinWindow } from './layers';
import { renderCards, renderCommandBar, renderLayerPanel, renderMapBar } from './ui';
import type {
  ClassViResult,
  FlightResult,
  GeoItem,
  HazardResult,
  LayerData,
  LayerId,
  MarketResult,
  NewsResult,
  Quote,
} from './types';

const REFRESH_MS = 60_000;
const LAYER_IDS: LayerId[] = [
  'incidents', 'conflict', 'cyber', 'quakes', 'events', 'disasters', 'storms', 'weather', 'flights', 'classvi',
];
const SIGNAL_LAYERS: LayerId[] = ['incidents', 'conflict', 'cyber'];
const HAZARD_LAYERS: LayerId[] = ['quakes', 'events', 'disasters', 'storms', 'weather'];

const data: LayerData = {
  incidents: [], conflict: [], cyber: [], quakes: [], events: [], disasters: [], storms: [], weather: [], flights: [], classvi: [],
};
const visible: Record<LayerId, boolean> = {
  incidents: true, conflict: true, cyber: true, quakes: true, events: true, disasters: true, storms: true, weather: true, flights: true, classvi: true,
};
let sinceMs = 0; // time window; 0 = All
let quotes: Quote[] = [];

const { map, overlay } = createMap(document.getElementById('map')!);
let popup: maplibregl.Popup | null = null;

const cmd = renderCommandBar(document.getElementById('cmdbar')!, () => void refresh());
renderMapBar(
  document.getElementById('mapbar')!,
  (ms) => { sinceMs = ms; draw(); },
  (dim) => map.easeTo({ pitch: dim === '3d' ? 55 : 0, duration: 600 }),
);
const layerPanel = renderLayerPanel(document.getElementById('layerpanel')!, visible, (id, on) => {
  visible[id] = on;
  draw();
});
const cards = renderCards(document.getElementById('cards')!, focusItem);

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m] as string));

function collect(ids: LayerId[]): GeoItem[] {
  const out: GeoItem[] = [];
  for (const id of ids) {
    if (!visible[id]) continue;
    out.push(...withinWindow(data[id], sinceMs));
  }
  return out.sort((a, b) => b.severity - a.severity || (b.ts ?? 0) - (a.ts ?? 0)).slice(0, 150);
}

function counts(): Record<LayerId, number> {
  return Object.fromEntries(LAYER_IDS.map((id) => [id, data[id].length])) as Record<LayerId, number>;
}

function draw() {
  overlay.setProps({ layers: buildLayers(data, visible, focusItem, sinceMs) });
  const signal = collect(SIGNAL_LAYERS);
  cards.setSignal(signal);
  cards.setHazards(collect(HAZARD_LAYERS));
  cards.setClassVI(visible.classvi ? data.classvi : []);
  layerPanel.setCounts(counts());
  cmd.setStatus(signal.length, signal[0]?.severity ?? 0);
}

function focusItem(it: GeoItem) {
  map.flyTo({ center: [it.lon, it.lat], zoom: Math.max(map.getZoom(), 5), speed: 0.8 });
  popup?.remove();
  popup = new maplibregl.Popup({ closeButton: true, offset: 12 })
    .setLngLat([it.lon, it.lat])
    .setHTML(
      `<div class="pt">${escapeHtml(it.title)}</div>` +
        `<div class="pm">${it.layer} · sev ${it.severity.toFixed(1)}${it.place ? ' · ' + escapeHtml(String(it.place)) : ''}</div>` +
        (it.url ? `<a href="${it.url}" target="_blank" rel="noopener">source ↗</a>` : ''),
    )
    .addTo(map);
}

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

// Dev + Vercel: live /api/*. Static Pages: prebuilt data/*.json snapshots.
const feedUrl = (name: string): string =>
  import.meta.env.DEV ? `/api/${name}` : `${import.meta.env.BASE_URL}data/${name}.json`;

let inFlight = false;
async function refresh() {
  if (inFlight) return;
  inFlight = true;
  cmd.setStale();
  try {
    const [news, haz, fly, mk, cv] = await Promise.all([
      getJson<NewsResult>(feedUrl('news')),
      getJson<HazardResult>(feedUrl('hazards')),
      getJson<FlightResult>(feedUrl('flights')),
      getJson<MarketResult>(feedUrl('markets')),
      getJson<ClassViResult>(feedUrl('classvi')),
    ]);
    if (news) { data.incidents = news.incidents; data.conflict = news.conflict; data.cyber = news.cyber; }
    if (haz) {
      data.quakes = haz.quakes; data.events = haz.events; data.weather = haz.weather;
      data.disasters = haz.disasters; data.storms = haz.storms;
    }
    if (fly) data.flights = fly.flights;
    if (cv) data.classvi = cv.wells;
    if (mk) {
      quotes = mk.quotes;
      cards.setMarkets(quotes);
      cards.setEnergy(quotes);
    }
    draw();
    cmd.setLive(Date.now());
  } finally {
    inFlight = false;
  }
}

void refresh();
setInterval(() => void refresh(), REFRESH_MS);
