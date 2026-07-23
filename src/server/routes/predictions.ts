// Prediction markets — Polymarket Gamma API (keyless). Live crowd-priced odds on
// the geopolitical & energy events that move oil (Iran, Russia/Ukraine, OPEC,
// sanctions, chokepoints…). We pull the highest-volume open markets and keep the
// ones whose question is energy/geopolitics-relevant (word-boundary match).
import { cached, fetchJson } from '../util';
import type { PredictionMarket, PredictionsResult } from '../../types';

const REL =
  /\b(oil|opec|crude|natural gas|lng|energy|russia|ukraine|iran|israel|venezuela|saudi|nuclear|sanction|sanctions|strait|hormuz|war|ceasefire|petro|opec\+|gaza|houthi|tanker|pipeline|blockade)\b/i;

export async function handler(): Promise<PredictionsResult> {
  return cached('predictions', 30 * 60 * 1000, async () => {
    const raw = await fetchJson<any>(
      'https://gamma-api.polymarket.com/markets?closed=false&active=true&limit=250&order=volumeNum&ascending=false',
      15000,
    );
    const list: any[] = Array.isArray(raw) ? raw : raw?.data ?? [];
    const markets: PredictionMarket[] = [];
    for (const m of list) {
      const q = String(m.question ?? '');
      if (!q || !REL.test(q)) continue;
      const prices = parseArr(m.outcomePrices).map(Number);
      const outcomes = parseArr(m.outcomes);
      if (!prices.length) continue;
      let bi = 0;
      for (let i = 1; i < prices.length; i++) if (prices[i] > prices[bi]) bi = i;
      markets.push({
        question: q,
        outcome: String(outcomes[bi] ?? (bi === 0 ? 'Yes' : 'No')),
        pct: Math.round(prices[bi] * 1000) / 10,
        volume: Math.round(Number(m.volumeNum) || 0),
        url: m.slug ? `https://polymarket.com/event/${m.slug}` : undefined,
      });
    }
    markets.sort((a, b) => b.volume - a.volume);
    return { markets: markets.slice(0, 18) };
  });
}

// Gamma returns outcomePrices/outcomes as JSON-encoded strings (or arrays).
function parseArr(v: unknown): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}
