// Natural-hazard + weather context around energy infrastructure:
//  • USGS earthquakes (induced + natural seismicity) — free, no key
//  • NASA EONET open natural events (wildfires, storms, volcanoes, floods) — free, no key
//  • NWS active weather alerts (US, severe/extreme) — free, no key
import { cached, fetchJson } from '../util';
import { scoreMagnitude } from '../../severity';
import type { GeoItem, HazardResult } from '../../types';

const EONET_SEVERITY: Record<string, number> = {
  Volcanoes: 3,
  'Severe Storms': 2.5,
  Wildfires: 2,
  Floods: 2,
  'Temperature Extremes': 1.5,
  'Sea and Lake Ice': 1.2,
  Drought: 1.2,
};

const NWS_SEVERITY: Record<string, number> = { Extreme: 3, Severe: 2.2, Moderate: 1.5, Minor: 1.2 };

export async function handler(): Promise<HazardResult> {
  return cached('hazards', 5 * 60 * 1000, async () => {
    const [quakes, events, weather] = await Promise.all([
      loadQuakes().catch(() => []),
      loadEvents().catch(() => []),
      loadWeather().catch(() => []),
    ]);
    return { quakes, events, weather };
  });
}

async function loadQuakes(): Promise<GeoItem[]> {
  const gj = await fetchJson<{ features?: any[] }>(
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',
  );
  const items: GeoItem[] = [];
  for (const f of gj.features ?? []) {
    const c = f?.geometry?.coordinates;
    if (!Array.isArray(c)) continue;
    const p = f.properties ?? {};
    const mag = Number(p.mag) || 0;
    items.push({
      id: `usgs:${f.id}`,
      layer: 'quakes',
      lon: Number(c[0]),
      lat: Number(c[1]),
      title: `M${mag.toFixed(1)} — ${p.place ?? 'earthquake'}`,
      place: p.place ? String(p.place) : undefined,
      url: p.url ? String(p.url) : undefined,
      ts: Number(p.time) || undefined,
      severity: scoreMagnitude(mag),
      kind: `M${mag.toFixed(1)}`,
      meta: { mag, depthKm: c[2] },
    });
  }
  return items.sort((a, b) => b.severity - a.severity);
}

async function loadEvents(): Promise<GeoItem[]> {
  const data = await fetchJson<{ events?: any[] }>(
    'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=120',
  );
  const items: GeoItem[] = [];
  for (const e of data.events ?? []) {
    const geo = Array.isArray(e.geometry) ? e.geometry[e.geometry.length - 1] : null;
    const c = geo?.coordinates;
    if (!Array.isArray(c) || typeof c[0] !== 'number') continue;
    const cat = e.categories?.[0]?.title ?? 'Event';
    items.push({
      id: `eonet:${e.id}`,
      layer: 'events',
      lon: Number(c[0]),
      lat: Number(c[1]),
      title: String(e.title ?? cat),
      url: e.sources?.[0]?.url ?? e.link,
      ts: geo?.date ? Date.parse(geo.date) : undefined,
      severity: EONET_SEVERITY[cat] ?? 1.5,
      kind: cat,
      meta: { category: cat },
    });
  }
  return items;
}

async function loadWeather(): Promise<GeoItem[]> {
  // NWS rejects/empties several query params; the bare endpoint is the reliable
  // one. We filter to polygon-geometry alerts and keep the most severe below.
  const gj = await fetchJson<{ features?: any[] }>('https://api.weather.gov/alerts/active', 12000, {
    Accept: 'application/geo+json',
  });
  const items: GeoItem[] = [];
  const seen = new Set<string>();
  for (const f of gj.features ?? []) {
    const p = f.properties ?? {};
    const center = centroid(f.geometry);
    if (!center) continue;
    const key = `${p.event}|${p.areaDesc}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: `nws:${f.id}`,
      layer: 'weather',
      lon: center[0],
      lat: center[1],
      title: String(p.event ?? 'Weather alert'),
      place: p.areaDesc ? String(p.areaDesc).split(';')[0] : undefined,
      url: p.id ? String(p.id) : undefined,
      ts: p.sent ? Date.parse(p.sent) : undefined,
      severity: NWS_SEVERITY[String(p.severity)] ?? 1.5,
      kind: String(p.severity ?? 'Alert'),
      meta: { event: p.event },
    });
  }
  return items.sort((a, b) => b.severity - a.severity).slice(0, 120);
}

function centroid(geometry: any): [number, number] | null {
  if (!geometry) return null;
  const polys =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : null;
  if (!polys) return null;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const poly of polys) {
    for (const [x, y] of poly[0] ?? []) {
      sx += x;
      sy += y;
      n++;
    }
  }
  return n ? [sx / n, sy / n] : null;
}
