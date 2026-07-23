// Maritime energy chokepoints — IMF PortWatch (keyless public ArcGIS feature
// service). Each chokepoint carries daily vessel counts by class; we surface
// total traffic and the tanker share (the energy-relevant slice). Severity is
// scaled by traffic so the busiest straits read largest on the map.
import { cached, fetchJson } from '../util';
import type { ChokepointResult, GeoItem } from '../../types';

const REF =
  'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/' +
  'PortWatch_chokepoints_database/FeatureServer/0/query' +
  '?where=1%3D1&outFields=*&f=json&resultRecordCount=100';
const DAILY =
  'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/' +
  'Daily_Chokepoints_Data/FeatureServer/0/query' +
  '?where=1%3D1&outFields=portid,n_tanker,n_total,date&f=json' +
  '&orderByFields=date%20DESC&resultRecordCount=1200';

export async function handler(): Promise<ChokepointResult> {
  return cached('chokepoints', 6 * 60 * 60 * 1000, async () => {
    const [ref, daily] = await Promise.all([
      fetchJson<{ features?: any[] }>(REF, 15000),
      fetchJson<{ features?: any[] }>(DAILY, 15000).catch(() => ({ features: [] as any[] })),
    ]);
    const deltas = computeDeltas(daily.features ?? []);
    const feats = ref.features ?? [];
    const maxTotal = Math.max(1, ...feats.map((f) => Number(f.attributes?.vessel_count_total) || 0));
    const chokepoints: GeoItem[] = [];
    for (const f of feats) {
      const a = f.attributes ?? {};
      const lat = Number(a.lat);
      const lon = Number(a.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const total = Number(a.vessel_count_total) || 0;
      const tanker = Number(a.vessel_count_tanker) || 0;
      const delta = deltas.get(String(a.portid)); // recent-vs-baseline tanker transit %
      chokepoints.push({
        id: `cp:${a.portid ?? a.portname}`,
        layer: 'chokepoints',
        lon,
        lat,
        title: String(a.fullname || a.portname || 'Chokepoint'),
        place: a.industry_top1 ? String(a.industry_top1) : undefined,
        // Base size by traffic; a large disruption bumps it so it stands out.
        severity: 1.2 + (total / maxTotal) * 3.3 + Math.min(1.5, Math.abs(delta ?? 0) / 25),
        kind: 'chokepoint',
        meta: {
          total,
          tanker,
          tankerPct: total ? Math.round((tanker / total) * 100) : 0,
          imports: a.share_country_maritime_import,
          delta: delta ?? null, // % change in daily tanker transits vs baseline
        },
      });
    }
    chokepoints.sort((x, y) => Number(y.meta?.total) - Number(x.meta?.total));
    return { chokepoints };
  });
}

// Per chokepoint: mean tanker transits over the latest ~7 days vs the prior ~21,
// as a % delta. Negative = traffic dropped (possible disruption/avoidance).
function computeDeltas(rows: any[]): Map<string, number> {
  const byPort = new Map<string, Array<{ date: string; n: number }>>();
  for (const f of rows) {
    const a = f.attributes ?? {};
    const id = String(a.portid ?? '');
    if (!id) continue;
    const arr = byPort.get(id) ?? [];
    arr.push({ date: String(a.date), n: Number(a.n_tanker) || 0 });
    byPort.set(id, arr);
  }
  const out = new Map<string, number>();
  for (const [id, arr] of byPort) {
    arr.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
    const recent = arr.slice(0, 7);
    const base = arr.slice(7, 28);
    if (recent.length < 3 || base.length < 5) continue;
    const rAvg = recent.reduce((s, x) => s + x.n, 0) / recent.length;
    const bAvg = base.reduce((s, x) => s + x.n, 0) / base.length;
    if (bAvg <= 0) continue;
    out.set(id, Math.round(((rAvg - bAvg) / bAvg) * 1000) / 10);
  }
  return out;
}
