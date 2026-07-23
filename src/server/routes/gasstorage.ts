// EU natural-gas storage — GIE AGSI+ (free key, gated on GIE_API_KEY / AGSI_API_KEY).
// Returns the EU aggregate fill % time-series (last ~90 gas-days) plus the latest
// fill %, day-over-day trend and total gas in storage. Without a key the route
// returns { available:false } and the panel shows a connect-key prompt.
import { cached, fetchJson } from '../util';
import type { GasStorageResult, InventoryPoint } from '../../types';

const KEY = process.env.GIE_API_KEY || process.env.AGSI_API_KEY;

export async function handler(): Promise<GasStorageResult> {
  if (!KEY) return { available: false, full: null, trend: null, storageTWh: null, points: [] };
  return cached('gasstorage', 6 * 60 * 60 * 1000, async () => {
    // AGSI+ v2: EU aggregate, newest-first; auth via the x-key header.
    const j = await fetchJson<{ data?: any[] }>('https://agsi.gie.eu/api?country=eu&size=90', 15000, {
      'x-key': KEY as string,
    });
    const rows = j.data ?? [];
    if (!rows.length) return { available: true, full: null, trend: null, storageTWh: null, points: [] };
    const points: InventoryPoint[] = rows
      .map((d) => ({ period: String(d.gasDayStart), value: Number(d.full) }))
      .filter((p) => Number.isFinite(p.value))
      .reverse();
    const latest = rows[0];
    return {
      available: true,
      asOf: String(latest.gasDayStart),
      full: num(latest.full),
      trend: num(latest.trend),
      storageTWh: num(latest.gasInStorage),
      points,
    };
  });
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
