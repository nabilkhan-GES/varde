// Geopolitical tension — GDELT-derived risk per country pair (keyless, via the
// pizzint.watch GDELT batch proxy, same source worldmonitor uses). Higher score =
// more conflictual coverage. The pairs are the ones that move energy markets.
import { cached, fetchJson } from '../util';
import type { TensionPair, TensionResult } from '../../types';

const PAIRS: Array<{ id: string; label: string }> = [
  { id: 'russia_ukraine', label: 'Russia · Ukraine' },
  { id: 'usa_russia', label: 'US · Russia' },
  { id: 'usa_iran', label: 'US · Iran' },
  { id: 'israel_iran', label: 'Israel · Iran' },
  { id: 'usa_china', label: 'US · China' },
  { id: 'china_taiwan', label: 'China · Taiwan' },
  { id: 'usa_venezuela', label: 'US · Venezuela' },
];

export async function handler(): Promise<TensionResult> {
  return cached('tension', 60 * 60 * 1000, async () => {
    const now = Date.now();
    const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
    const url =
      `https://www.pizzint.watch/api/gdelt/batch?pairs=${PAIRS.map((p) => p.id).join(',')}` +
      `&method=gpr&dateStart=${fmt(now - 21 * 86400000)}&dateEnd=${fmt(now)}`;
    const data = await fetchJson<Record<string, any[]>>(url, 20000);
    const pairs: TensionPair[] = [];
    for (const p of PAIRS) {
      const arr = data[p.id];
      if (!Array.isArray(arr) || !arr.length) continue;
      const last = arr[arr.length - 1];
      const first = arr[0];
      pairs.push({
        label: p.label,
        score: Math.round((Number(last.v) || 0) * 100) / 100,
        trend: Math.round(((Number(last.v) || 0) - (Number(first.v) || 0)) * 100) / 100,
        articles: Number(last.totalArticles) || 0,
      });
    }
    pairs.sort((a, b) => b.score - a.score);
    return { pairs };
  });
}
