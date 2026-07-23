// Maritime energy chokepoints — IMF PortWatch (keyless public ArcGIS feature
// service). Each chokepoint carries daily vessel counts by class; we surface
// total traffic and the tanker share (the energy-relevant slice). Severity is
// scaled by traffic so the busiest straits read largest on the map.
import { cached, fetchJson } from '../util';
import type { ChokepointResult, GeoItem } from '../../types';

const URL =
  'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/' +
  'PortWatch_chokepoints_database/FeatureServer/0/query' +
  '?where=1%3D1&outFields=*&f=json&resultRecordCount=100';

export async function handler(): Promise<ChokepointResult> {
  return cached('chokepoints', 6 * 60 * 60 * 1000, async () => {
    const j = await fetchJson<{ features?: any[] }>(URL, 15000);
    const feats = j.features ?? [];
    const maxTotal = Math.max(1, ...feats.map((f) => Number(f.attributes?.vessel_count_total) || 0));
    const chokepoints: GeoItem[] = [];
    for (const f of feats) {
      const a = f.attributes ?? {};
      const lat = Number(a.lat);
      const lon = Number(a.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const total = Number(a.vessel_count_total) || 0;
      const tanker = Number(a.vessel_count_tanker) || 0;
      chokepoints.push({
        id: `cp:${a.portid ?? a.portname}`,
        layer: 'chokepoints',
        lon,
        lat,
        title: String(a.fullname || a.portname || 'Chokepoint'),
        place: a.industry_top1 ? String(a.industry_top1) : undefined,
        // 1.2 → ~4.5 by traffic so busy straits are bigger but never huge.
        severity: 1.2 + (total / maxTotal) * 3.3,
        kind: 'chokepoint',
        meta: {
          total,
          tanker,
          tankerPct: total ? Math.round((tanker / total) * 100) : 0,
          imports: a.share_country_maritime_import,
        },
      });
    }
    chokepoints.sort((x, y) => Number(y.meta?.total) - Number(x.meta?.total));
    return { chokepoints };
  });
}
