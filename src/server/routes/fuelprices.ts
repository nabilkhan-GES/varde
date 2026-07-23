// US retail fuel prices — EIA weekly (gated on EIA_API_KEY). Pump gasoline & diesel
// are the consumer-facing end of the oil complex; a fast mover on crude + refining
// margins. Same key/pattern as energy.ts. Empty + graceful without a key.
import { cached, fetchJson } from '../util';
import type { FuelPricesResult, MacroSeries } from '../../types';

const KEY = process.env.EIA_API_KEY;

const SERIES: Array<{ key: string; label: string; id: string }> = [
  { key: 'gasoline', label: 'US Gasoline (retail)', id: 'EMM_EPM0_PTE_NUS_DPG' },
  { key: 'diesel', label: 'US Diesel (retail)', id: 'EMD_EPD2D_PTE_NUS_DPG' },
];

let asOf: string | undefined;

export async function handler(): Promise<FuelPricesResult> {
  if (!KEY) return { available: false, series: [] };
  return cached('fuelprices', 6 * 60 * 60 * 1000, async () => {
    asOf = undefined;
    const series = await Promise.all(SERIES.map((s) => one(s)));
    return { available: true, asOf, series };
  });
}

async function one(s: { key: string; label: string; id: string }): Promise<MacroSeries> {
  const base: MacroSeries = { key: s.key, label: s.label, unit: '$/gal', latest: null, change: null, points: [] };
  try {
    const url =
      `https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=${KEY}&frequency=weekly&data[0]=value` +
      `&facets[series][]=${s.id}&sort[0][column]=period&sort[0][direction]=desc&length=40`;
    const j = await fetchJson<any>(url, 12000);
    const rows: any[] = j?.response?.data ?? [];
    if (!rows.length) return base;
    if (rows[0].period > (asOf ?? '')) asOf = String(rows[0].period);
    const values = rows.map((r) => Number(r.value)).filter((v) => Number.isFinite(v)).reverse();
    const latest = values[values.length - 1];
    const prev = values.length > 1 ? values[values.length - 2] : null;
    const change = prev != null ? Math.round((latest - prev) * 1000) / 1000 : null;
    return { ...base, latest, change, points: values };
  } catch {
    return base;
  }
}
