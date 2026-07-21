// Natural-hazard context around energy infrastructure:
//  • USGS earthquakes (induced + natural seismicity) — free, no key
//  • NASA EONET open natural events (wildfires, severe storms, volcanoes, …) — free, no key
import { cached, fetchJson } from '../util';
import { scoreMagnitude } from '../../severity';
import type { GeoItem, HazardResult } from '../../types';

const EONET_SEVERITY: Record<string, number> = {
  Volcanoes: 3,
  'Severe Storms': 2.5,
  Wildfires: 2,
  Floods: 2,
  'Sea and Lake Ice': 1.2,
  'Temperature Extremes': 1.5,
  Drought: 1.2,
};

export async function handler(): Promise<HazardResult> {
  return cached('hazards', 5 * 60 * 1000, async () => {
    const [quakes, events] = await Promise.all([loadQuakes(), loadEvents()]);
    return { quakes, events };
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
