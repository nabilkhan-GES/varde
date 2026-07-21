// Energy markets ticker + sparklines — Yahoo Finance chart endpoint (free, no
// key). Change is vs. previous close; spark is ~30 daily closes for a mini chart.
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
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.sym)}` +
    `?range=1mo&interval=1d`;
  const data = await fetchJson<any>(url, 9000);
  const result = data?.chart?.result?.[0] ?? {};
  const meta = result.meta ?? {};
  const price = Number(meta.regularMarketPrice);
  if (!Number.isFinite(price)) throw new Error(`no price for ${s.sym}`);
  const closes: number[] = (result.indicators?.quote?.[0]?.close ?? [])
    .filter((v: unknown): v is number => typeof v === 'number' && Number.isFinite(v))
    .slice(-30);
  // Day change = live price vs the prior daily close (chartPreviousClose spans the
  // whole range, so it gives a monthly delta — use the series instead).
  const prev =
    closes.length >= 2 ? closes[closes.length - 2] : Number(meta.chartPreviousClose ?? meta.previousClose);
  const changePct = Number.isFinite(prev) && prev > 0 ? ((price - prev) / prev) * 100 : 0;
  return {
    symbol: s.sym,
    name: s.name,
    unit: s.unit,
    price: Math.round(price * 100) / 100,
    changePct: Math.round(changePct * 100) / 100,
    spark: closes,
  };
}
