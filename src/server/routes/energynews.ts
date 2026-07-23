// Energy headlines — a merged digest of keyless publisher RSS feeds (EIA, OilPrice,
// Rigzone). Non-geo; powers the "Energy Headlines" panel. Each feed is best-effort
// (a down feed just contributes nothing).
import { cached, fetchText } from '../util';
import { parseRss } from '../rss';
import type { EnergyHeadline, EnergyNewsResult } from '../../types';

const FEEDS: Array<{ source: string; url: string }> = [
  { source: 'EIA', url: 'https://www.eia.gov/rss/todayinenergy.xml' },
  { source: 'OilPrice', url: 'https://oilprice.com/rss/main' },
  { source: 'Rigzone', url: 'https://www.rigzone.com/news/rss/rigzone_latest.aspx' },
];

export async function handler(): Promise<EnergyNewsResult> {
  return cached('energynews', 15 * 60 * 1000, async () => {
    const lists = await Promise.all(
      FEEDS.map(async (f) => {
        try {
          const xml = await fetchText(f.url, 12000);
          return parseRss(xml).slice(0, 15).map(
            (it): EnergyHeadline => ({ title: it.title, source: f.source, url: it.link || undefined, ts: it.date }),
          );
        } catch {
          return [] as EnergyHeadline[];
        }
      }),
    );
    const seen = new Set<string>();
    const items = lists
      .flat()
      .filter((it) => {
        const k = it.title.toLowerCase().slice(0, 60);
        if (!it.title || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
      .slice(0, 40);
    return { items };
  });
}
