// Oil & gas inventory time-series — U.S. EIA (free key). Weekly history (~1yr)
// of commercial crude stocks, the SPR, total oil (commercial + SPR), and
// Lower-48 natural-gas working storage, for the Oil Inventories chart panel.
// Gated on EIA_API_KEY: without it the route returns { available:false } and the
// panel shows a connect-key prompt. Same key + snapshot model as energy.ts.
import { cached, fetchJson } from '../util';
import type { InventoriesResult, InventoryPoint, InventorySeries } from '../../types';

const KEY = process.env.EIA_API_KEY;
const WEEKS = 53;

interface Src {
  key: string;
  label: string;
  unit: string;
  color: string;
  path: string;
  id: string;
}

const SOURCES: Src[] = [
  { key: 'commercial', label: 'Commercial Crude', unit: 'k bbl', color: '#38bdf8', path: 'petroleum/stoc/wstk', id: 'WCESTUS1' },
  { key: 'spr', label: 'SPR Crude', unit: 'k bbl', color: '#ff9838', path: 'petroleum/stoc/wstk', id: 'WCSSTUS1' },
  { key: 'natgas', label: 'Nat Gas Working Storage', unit: 'Bcf', color: '#2fe37e', path: 'natural-gas/stor/wkly', id: 'NW2_EPG0_SWO_R48_BCF' },
];

export async function handler(): Promise<InventoriesResult> {
  if (!KEY) return { available: false, series: [] };
  return cached('inventories', 6 * 60 * 60 * 1000, async () => {
    const raw = await Promise.all(SOURCES.map((s) => fetchPoints(s)));
    const series: InventorySeries[] = SOURCES.map((s, i) => toSeries(s, raw[i]));

    // Total oil = commercial + SPR, aligned by period.
    const commercial = new Map(raw[0].map((p) => [p.period, p.value]));
    const spr = new Map(raw[1].map((p) => [p.period, p.value]));
    const totalPts: InventoryPoint[] = [...commercial.keys()]
      .filter((k) => spr.has(k))
      .sort()
      .map((period) => ({ period, value: commercial.get(period)! + spr.get(period)! }));
    const total = toSeries(
      { key: 'total', label: 'US Total Oil Stocks', unit: 'k bbl', color: '#a78bfa' },
      totalPts,
    );

    const ordered = [total, ...series];
    const asOf = ordered
      .flatMap((s) => (s.points.length ? [s.points[s.points.length - 1].period] : []))
      .sort()
      .pop();
    return { available: true, series: ordered, asOf };
  });
}

async function fetchPoints(s: Src): Promise<InventoryPoint[]> {
  try {
    const url =
      `https://api.eia.gov/v2/${s.path}/data/?api_key=${KEY}&frequency=weekly&data[0]=value` +
      `&facets[series][]=${s.id}&sort[0][column]=period&sort[0][direction]=desc&length=${WEEKS}`;
    const j = await fetchJson<any>(url, 12000);
    const rows: any[] = j?.response?.data ?? [];
    return rows
      .map((r) => ({ period: String(r.period), value: Number(r.value) }))
      .filter((p) => Number.isFinite(p.value))
      .reverse(); // API returns newest-first; we want oldest → newest
  } catch {
    return [];
  }
}

function toSeries(
  s: { key: string; label: string; unit: string; color: string },
  points: InventoryPoint[],
): InventorySeries {
  const n = points.length;
  const latest = n ? points[n - 1].value : null;
  const prev = n > 1 ? points[n - 2].value : null;
  const changePct =
    latest != null && prev != null && prev !== 0
      ? Math.round(((latest - prev) / prev) * 10000) / 100
      : null;
  return { key: s.key, label: s.label, unit: s.unit, color: s.color, latest, changePct, points };
}
