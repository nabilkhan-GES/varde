// Sanctions & export-control watch — energy-scoped headlines via Google News RSS
// (keyless, reuses the shared RSS parser). Sanctions are a first-order energy-price
// driver (Russia price cap, Iran/Venezuela crude, OPEC+…); this is the news signal.
import { cached, fetchText } from '../util';
import { parseRss } from '../rss';
import type { EnergyHeadline, EnergyNewsResult } from '../../types';

const Q =
  '(sanctions OR "export controls" OR "price cap" OR embargo OR "secondary sanctions" OR OFAC) ' +
  '(oil OR gas OR energy OR Russia OR Iran OR Venezuela OR OPEC OR LNG OR crude OR tanker OR "shadow fleet") when:10d';

export async function handler(): Promise<EnergyNewsResult> {
  return cached('sanctions', 30 * 60 * 1000, async () => {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(Q)}&hl=en-US&gl=US&ceid=US:en`;
    const xml = await fetchText(url, 15000);
    const seen = new Set<string>();
    const items: EnergyHeadline[] = [];
    for (const a of parseRss(xml)) {
      const i = a.title.lastIndexOf(' - ');
      const title = (i > 20 ? a.title.slice(0, i) : a.title).trim();
      const source = i > 20 ? a.title.slice(i + 3).trim() : '';
      const key = title.toLowerCase().slice(0, 60);
      if (!title || seen.has(key)) continue;
      seen.add(key);
      items.push({ title, source, url: a.link || undefined, ts: a.date });
    }
    items.sort((x, y) => (y.ts ?? 0) - (x.ts ?? 0));
    return { items: items.slice(0, 30) };
  });
}
