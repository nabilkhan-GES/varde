import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import { createMap } from './map';
import { buildLayers, type LayerData } from './layers';
import { renderLayerbar, renderMarkets, renderRadar, renderTopbar } from './ui';
import type { FeedResult, GeoItem, HazardResult, LayerId, MarketResult } from './types';

const REFRESH_MS = 60_000;

const data: LayerData = { incidents: [], quakes: [], events: [] };
const visible: Record<LayerId, boolean> = { incidents: true, quakes: true, events: true };

const { map, overlay } = createMap(document.getElementById('map')!);
let popup: maplibregl.Popup | null = null;

const topbar = renderTopbar(document.getElementById('topbar')!, () => void refresh());
const radar = renderRadar(document.getElementById('radar')!, focusItem);
const layerbar = renderLayerbar(document.getElementById('layerbar')!, visible, (id, on) => {
  visible[id] = on;
  draw();
});
const markets = renderMarkets(document.getElementById('markets')!);

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m] as string));

function mergedItems(): GeoItem[] {
  const out: GeoItem[] = [];
  (Object.keys(visible) as LayerId[]).forEach((id) => {
    if (visible[id]) out.push(...data[id]);
  });
  return out.sort((a, b) => b.severity - a.severity || (b.ts ?? 0) - (a.ts ?? 0)).slice(0, 80);
}

function draw() {
  overlay.setProps({ layers: buildLayers(data, visible, focusItem) });
  const merged = mergedItems();
  radar.update(merged);
  layerbar.setCounts({
    incidents: data.incidents.length,
    quakes: data.quakes.length,
    events: data.events.length,
  });
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
    const [inc, haz, mk] = await Promise.all([
      getJson<FeedResult>('/api/incidents'),
      getJson<HazardResult>('/api/hazards'),
      getJson<MarketResult>('/api/markets'),
    ]);
    if (inc) data.incidents = inc.items;
    if (haz) {
      data.quakes = haz.quakes;
      data.events = haz.events;
    }
    if (mk) markets.update(mk.quotes);
    draw();
    topbar.setUpdated(Date.now());
  } finally {
    inFlight = false;
  }
}

void refresh();
setInterval(() => void refresh(), REFRESH_MS);
