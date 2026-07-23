// Submarine communications cables — TeleGeography's public GeoJSON (keyless).
// Fetched server-side (the source is CORS-blocked for browsers) and simplified:
// coordinates rounded to 2dp and long runs decimated, to keep the Pages snapshot
// lean. Rendered as thin reference lines under the data layers.
import { cached, fetchJson } from '../util';
import type { CableLine, CablesResult } from '../../types';

const URL = 'https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';

export async function handler(): Promise<CablesResult> {
  return cached('cables', 24 * 60 * 60 * 1000, async () => {
    const gj = await fetchJson<{ features?: any[] }>(URL, 25000);
    const cables: CableLine[] = [];
    for (const f of gj.features ?? []) {
      const name = String(f?.properties?.name ?? 'cable');
      const g = f?.geometry;
      if (!g) continue;
      const parts = g.type === 'MultiLineString' ? g.coordinates : g.type === 'LineString' ? [g.coordinates] : [];
      for (const line of parts) {
        const path = simplify(line);
        if (path.length >= 2) cables.push({ name, path });
      }
    }
    return { cables };
  });
}

// Round to ~1km and keep at most every 3rd vertex (endpoints always kept).
function simplify(line: any[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < line.length; i++) {
    if (i !== 0 && i !== line.length - 1 && i % 3 !== 0) continue;
    const c = line[i];
    if (!Array.isArray(c) || typeof c[0] !== 'number') continue;
    out.push([Math.round(c[0] * 100) / 100, Math.round(c[1] * 100) / 100]);
  }
  return out;
}
