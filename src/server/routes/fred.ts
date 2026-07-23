// Macro drivers of energy prices — U.S. FRED (free key, gated on FRED_API_KEY).
// USD strength, rates and inflation expectations move oil as much as barrels do;
// WTI spot is included as the official reference. Without a key the route returns
// { available:false } and the panel shows a connect-key prompt.
import { cached, fetchJson } from '../util';
import type { MacroResult, MacroSeries } from '../../types';

const KEY = process.env.FRED_API_KEY;

const SERIES: Array<{ key: string; label: string; unit: string; id: string }> = [
  { key: 'usd', label: 'USD (broad)', unit: 'idx', id: 'DTWEXBGS' },
  { key: 'wti', label: 'WTI', unit: '$', id: 'DCOILWTICO' },
  { key: 'ust10', label: '10Y UST', unit: '%', id: 'DGS10' },
  { key: 'ffr', label: 'Fed Funds', unit: '%', id: 'DFF' },
  { key: 'infl', label: '10Y B/E infl', unit: '%', id: 'T10YIE' },
];

export async function handler(): Promise<MacroResult> {
  if (!KEY) return { available: false, series: [] };
  return cached('fred', 6 * 60 * 60 * 1000, async () => {
    latestDate = undefined;
    const series = await Promise.all(SERIES.map((s) => one(s)));
    return { available: true, asOf: latestDate, series };
  });
}

let latestDate: string | undefined;

async function one(s: { key: string; label: string; unit: string; id: string }): Promise<MacroSeries> {
  const base: MacroSeries = { key: s.key, label: s.label, unit: s.unit, latest: null, change: null, points: [] };
  try {
    const url =
      `https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}` +
      `&api_key=${KEY}&file_type=json&sort_order=desc&limit=60`;
    const j = await fetchJson<{ observations?: Array<{ date: string; value: string }> }>(url, 12000);
    const obs = (j.observations ?? []).filter((o) => o.value !== '.' && o.value !== '');
    if (!obs.length) return base;
    if (obs[0].date > (latestDate ?? '')) latestDate = obs[0].date;
    const values = obs.map((o) => Number(o.value)).reverse(); // oldest → newest
    const latest = values[values.length - 1];
    const prev = values.length > 1 ? values[values.length - 2] : null;
    const change = prev != null ? Math.round((latest - prev) * 1000) / 1000 : null;
    return { ...base, latest, change, points: values.slice(-40) };
  } catch {
    return base;
  }
}
