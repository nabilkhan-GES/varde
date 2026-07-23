// maplibre CSS first, then ours — so our dark popup/control overrides win.
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import maplibregl from 'maplibre-gl';
import { createMap } from './map';
import { buildLayers, withinWindow } from './layers';
import { renderCards, renderCommandBar, renderLayerPanel, renderMapBar } from './ui';
import type {
  CableLine,
  CablesResult,
  ChokepointResult,
  PipelineLine,
  PipelinesResult,
  ClassViResult,
  EnergyNewsResult,
  EnergyResult,
  FireResult,
  FlightResult,
  GasStorageResult,
  HubWeatherResult,
  TankerResult,
  GeoItem,
  HazardResult,
  InventoriesResult,
  LayerData,
  LayerId,
  MarketResult,
  NewsResult,
  PizzintResult,
  Quote,
  TrackersResult,
} from './types';

const REFRESH_MS = 60_000;
const LAYER_IDS: LayerId[] = [
  'incidents', 'conflict', 'cyber', 'quakes', 'events', 'disasters', 'storms', 'weather', 'flights', 'classvi', 'chokepoints', 'fires', 'tankers',
];
const SIGNAL_LAYERS: LayerId[] = ['incidents', 'conflict', 'cyber'];
const HAZARD_LAYERS: LayerId[] = ['quakes', 'events', 'disasters', 'storms', 'weather', 'fires'];

const data: LayerData = {
  incidents: [], conflict: [], cyber: [], quakes: [], events: [], disasters: [], storms: [], weather: [], flights: [], classvi: [], chokepoints: [], fires: [], tankers: [],
};
const visible: Record<LayerId, boolean> = {
  incidents: true, conflict: true, cyber: true, quakes: true, events: true, disasters: true, storms: true, weather: true, flights: true, classvi: true, chokepoints: true, fires: true, tankers: true,
};
let sinceMs = 0; // time window; 0 = All
let quotes: Quote[] = [];

const { map, overlay } = createMap(document.getElementById('map')!);
let popup: maplibregl.Popup | null = null;

let dayNight = false;
let showCables = false;
let cablePaths: CableLine[] = [];
let showPipes = false;
let pipeLines: PipelineLine[] = [];

const cmd = renderCommandBar(document.getElementById('cmdbar')!, () => void refresh());
renderMapBar(document.getElementById('mapbar')!, {
  onRange: (ms) => { sinceMs = ms; draw(); },
  onRadar: (on) => void setRadar(on),
  onDayNight: (on) => { dayNight = on; draw(); },
  onCables: (on) => void setCables(on),
  onPipelines: (on) => void setPipes(on),
});

// Submarine cables are static + heavy, so fetch once on first enable, then cache.
async function setCables(on: boolean) {
  showCables = on;
  if (on && cablePaths.length === 0) {
    const res = await getJson<CablesResult>(feedUrl('cables'));
    if (res) cablePaths = res.cables;
  }
  draw();
}

async function setPipes(on: boolean) {
  showPipes = on;
  if (on && pipeLines.length === 0) {
    const res = await getJson<PipelinesResult>(feedUrl('pipelines'));
    if (res) pipeLines = res.lines;
  }
  draw();
}
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

// Composite threat level (DEFCON 5 = calm → 1 = severe) from the live signal &
// hazard set. Heuristic: high-severity conflict/incidents dominate; hazard
// volume and peak severity add pressure. Percent is the raw threat score,
// capped — a rough intensity gauge, not a probability.
function computeDefcon(signal: GeoItem[]): { level: number; percent: number } {
  const haz = collect(HAZARD_LAYERS);
  const peak = Math.max(0, ...signal.map((s) => s.severity), ...haz.map((h) => h.severity));
  const severe = signal.filter((s) => s.severity >= 4).length;
  const conflictHi = (data.conflict ?? []).filter((c) => c.severity >= 6).length;
  const score = severe * 3 + conflictHi * 5 + peak * 4 + Math.min(haz.length, 20) * 0.3;
  let level = 5;
  if (score >= 90) level = 1;
  else if (score >= 60) level = 2;
  else if (score >= 35) level = 3;
  else if (score >= 15) level = 4;
  return { level, percent: Math.max(0, Math.min(100, Math.round(score))) };
}

function draw() {
  overlay.setProps({
    layers: buildLayers(data, visible, focusItem, {
      sinceMs,
      dayNight,
      nowMs: Date.now(),
      cables: showCables ? cablePaths : undefined,
      pipelines: showPipes ? pipeLines : undefined,
    }),
  });
  const signal = collect(SIGNAL_LAYERS);
  cards.setSignal(signal);
  cards.setHazards(collect(HAZARD_LAYERS));
  cards.setClassVI(visible.classvi ? data.classvi : []);
  cards.setChokepoints(visible.chokepoints ? data.chokepoints : []);
  layerPanel.setCounts(counts());
  cmd.setStatus(signal.length, signal[0]?.severity ?? 0);
  const dc = computeDefcon(signal);
  cmd.setDefcon(dc.level, dc.percent);
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

// ── RainViewer doppler radar — keyless animated raster tiles (worldmonitor
// pattern). Native MapLibre raster layer, not deck; refreshed every 5 min. ──
const RADAR_SRC = 'wx-radar';
const RADAR_LAYER = 'wx-radar-layer';
let radarTimer: number | null = null;

async function radarTileTemplate(): Promise<string | null> {
  try {
    const r = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    if (!r.ok) return null;
    const j: any = await r.json();
    const past = j?.radar?.past;
    const latest = Array.isArray(past) && past.length ? past[past.length - 1] : null;
    return latest ? `${j.host}${latest.path}/256/{z}/{x}/{y}/6/1_1.png` : null;
  } catch {
    return null;
  }
}

async function applyRadar() {
  const tmpl = await radarTileTemplate();
  if (!tmpl) return;
  const src = map.getSource(RADAR_SRC) as any;
  if (src) {
    // setTiles mid texture-load crashes the render frame — guard on load state.
    if (map.isSourceLoaded(RADAR_SRC)) src.setTiles([tmpl]);
    else map.once('idle', () => (map.getSource(RADAR_SRC) as any)?.setTiles([tmpl]));
    return;
  }
  map.addSource(RADAR_SRC, { type: 'raster', tiles: [tmpl], tileSize: 256, attribution: '© RainViewer' });
  map.addLayer({ id: RADAR_LAYER, type: 'raster', source: RADAR_SRC, paint: { 'raster-opacity': 0.6 } });
}

async function setRadar(on: boolean) {
  if (on) {
    const go = () => void applyRadar();
    if (map.isStyleLoaded()) go();
    else map.once('style.load', go);
    radarTimer = window.setInterval(() => void applyRadar(), 5 * 60 * 1000);
  } else {
    if (radarTimer) { clearInterval(radarTimer); radarTimer = null; }
    if (map.getLayer(RADAR_LAYER)) map.removeLayer(RADAR_LAYER);
    if (map.getSource(RADAR_SRC)) map.removeSource(RADAR_SRC);
  }
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

// If an always-on AIS relay is configured, read live classified tankers from it
// (dense, continuously updated) instead of the hourly sample; else fall back.
const AIS_RELAY = (import.meta.env.VITE_AIS_RELAY_URL as string | undefined)?.replace(/\/$/, '');
const tankersUrl = (): string => (AIS_RELAY ? `${AIS_RELAY}/tankers.json` : feedUrl('tankers'));

let inFlight = false;
async function refresh() {
  if (inFlight) return;
  inFlight = true;
  cmd.setStale();
  try {
    const [news, haz, fly, mk, cv, en, inv, trk, cp, pz, fr, gs, enews, hw, tk] = await Promise.all([
      getJson<NewsResult>(feedUrl('news')),
      getJson<HazardResult>(feedUrl('hazards')),
      getJson<FlightResult>(feedUrl('flights')),
      getJson<MarketResult>(feedUrl('markets')),
      getJson<ClassViResult>(feedUrl('classvi')),
      getJson<EnergyResult>(feedUrl('energy')),
      getJson<InventoriesResult>(feedUrl('inventories')),
      getJson<TrackersResult>(feedUrl('trackers')),
      getJson<ChokepointResult>(feedUrl('chokepoints')),
      getJson<PizzintResult>(feedUrl('pizzint')),
      getJson<FireResult>(feedUrl('fires')),
      getJson<GasStorageResult>(feedUrl('gasstorage')),
      getJson<EnergyNewsResult>(feedUrl('energynews')),
      getJson<HubWeatherResult>(feedUrl('hubweather')),
      getJson<TankerResult>(tankersUrl()),
    ]);
    if (news) { data.incidents = news.incidents; data.conflict = news.conflict; data.cyber = news.cyber; }
    if (haz) {
      data.quakes = haz.quakes; data.events = haz.events; data.weather = haz.weather;
      data.disasters = haz.disasters; data.storms = haz.storms;
    }
    if (fly) data.flights = fly.flights;
    if (cv) data.classvi = cv.wells;
    if (cp) data.chokepoints = cp.chokepoints;
    if (pz) cmd.setPizza(pz.defcon, pz.index);
    if (fr) data.fires = fr.fires;
    cards.setGasStorage(gs);
    cards.setEnergyNews(enews);
    cards.setHubWeather(hw);
    if (tk) data.tankers = tk.tankers;
    if (mk) {
      quotes = mk.quotes;
      cards.setMarkets(quotes);
    }
    cards.setEnergy(quotes, en);
    cards.setInventories(inv);
    cards.setTrackers(trk);
    draw();
    cmd.setLive(Date.now());
  } finally {
    inFlight = false;
  }
}

void refresh();
setInterval(() => void refresh(), REFRESH_MS);
