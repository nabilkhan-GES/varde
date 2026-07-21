// Energy Complex fundamentals — U.S. EIA (free key). Weekly crude stocks, SPR,
// and Lower-48 natural-gas working storage, with week-over-week change. Gated on
// EIA_API_KEY: without it the route returns { available:false } and the card shows
// live prices only. On GitHub Pages, set EIA_API_KEY as an Actions secret so the
// snapshot bakes these numbers in (client stays keyless).
import { cached, fetchJson } from '../util';
import type { EnergyResult, EnergyStat } from '../../types';

const KEY = process.env.EIA_API_KEY;

const SERIES: Array<{ key: string; label: string; unit: string; path: string; id: string }> = [
  { key: 'crude', label: 'US Crude Stocks', unit: 'k bbl', path: 'petroleum/stoc/wstk', id: 'WCESTUS1' },
  { key: 'spr', label: 'SPR Crude', unit: 'k bbl', path: 'petroleum/stoc/wstk', id: 'WCSSTUS1' },
  { key: 'natgas', label: 'US Nat Gas Storage', unit: 'Bcf', path: 'natural-gas/stor/wkly', id: 'NW2_EPG0_SWO_R48_BCF' },
];

export async function handler(): Promise<EnergyResult> {
  if (!KEY) return { available: false, series: [] };
  return cached('energy', 6 * 60 * 60 * 1000, async () => {
    const series = await Promise.all(SERIES.map((s) => one(s)));
    const asOf = series
      .map((x) => x.period)
      .filter((p): p is string => Boolean(p))
      .sort()
      .pop();
    return { available: true, series, asOf };
  });
}

async function one(s: { key: string; label: string; unit: string; path: string; id: string }): Promise<EnergyStat> {
  const base: EnergyStat = { key: s.key, label: s.label, unit: s.unit, value: null, changePct: null };
  try {
    const url =
      `https://api.eia.gov/v2/${s.path}/data/?api_key=${KEY}&frequency=weekly&data[0]=value` +
      `&facets[series][]=${s.id}&sort[0][column]=period&sort[0][direction]=desc&length=6`;
    const j = await fetchJson<any>(url, 12000);
    const rows: any[] = j?.response?.data ?? [];
    if (!rows.length) return base;
    const value = Number(rows[0].value);
    const prev = rows[1] != null ? Number(rows[1].value) : null;
    const changePct = prev && prev !== 0 ? Math.round(((value - prev) / prev) * 10000) / 100 : null;
    return { ...base, value, changePct, period: String(rows[0].period) };
  } catch {
    return base;
  }
}
