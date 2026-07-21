// Energy markets ticker — Yahoo Finance chart endpoint (free, no key). Change is
// computed vs. previous close. Swap to EIA spot prices when EIA_API_KEY is set.
import { cached, fetchJson } from '../util';
import type { MarketResult, Quote } from '../../types';

const SYMBOLS: Array<{ sym: string; name: string; unit: string }> = [
  { sym: 'CL=F', name: 'WTI Crude', unit: '$/bbl' },
  { sym: 'BZ=F', name: 'Brent', unit: '$/bbl' },
  { sym: 'NG=F', name: 'Nat Gas', unit: '$/MMBtu' },
  { sym: 'RB=F', name: 'RBOB Gas', unit: '$/gal' },
  { sym: 'XLE', name: 'XLE Energy', unit: '$' },
];

export async function handler(): Promise<MarketResult> {
  return cached('markets', 2 * 60 * 1000, async () => {
    const results = await Promise.allSettled(SYMBOLS.map((s) => quote(s)));
    const quotes = results
      .filter((r): r is PromiseFulfilledResult<Quote> => r.status === 'fulfilled')
      .map((r) => r.value);
    return { quotes };
  });
}

async function quote(s: { sym: string; name: string; unit: string }): Promise<Quote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.sym)}`;
  const data = await fetchJson<any>(url, 9000);
  const meta = data?.chart?.result?.[0]?.meta ?? {};
  const price = Number(meta.regularMarketPrice);
  const prev = Number(meta.chartPreviousClose ?? meta.previousClose);
  if (!Number.isFinite(price)) throw new Error(`no price for ${s.sym}`);
  const changePct = Number.isFinite(prev) && prev > 0 ? ((price - prev) / prev) * 100 : 0;
  return {
    symbol: s.sym,
    name: s.name,
    unit: s.unit,
    price: Math.round(price * 100) / 100,
    changePct: Math.round(changePct * 100) / 100,
  };
}
