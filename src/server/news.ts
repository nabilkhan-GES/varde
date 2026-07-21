// Shared news engine: pull a Google News RSS query (keyless, fast, reliable),
// parse it, geocode each headline against the place gazetteer, and score it.
// Powers the incidents / conflict / cyber layers with different queries.
import { fetchText } from './util';
import { parseRss } from './rss';
import { geocode } from './places';
import { scoreText } from '../severity';
import type { GeoItem, LayerId } from '../types';

export async function fetchNews(query: string, layer: LayerId, limit = 150): Promise<GeoItem[]> {
  const url =
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` + `&hl=en-US&gl=US&ceid=US:en`;
  const xml = await fetchText(url, 15000);

  const items: GeoItem[] = [];
  const seen = new Set<string>();

  for (const a of parseRss(xml)) {
    const title = stripSource(a.title);
    if (!title) continue;
    const key = title.toLowerCase().slice(0, 70);
    if (seen.has(key)) continue;
    seen.add(key);

    const coord = geocode(title);
    if (!coord) continue; // no recognizable location → skip
    const [jx, jy] = jitter(a.link || title);

    items.push({
      id: `${layer}:${a.link || title}`.slice(0, 200),
      layer,
      lon: coord[0] + jx,
      lat: coord[1] + jy,
      title,
      place: sourceOf(a.title),
      url: a.link || undefined,
      ts: a.date,
      severity: scoreText(title),
      kind: layer,
    });
  }

  items.sort((x, y) => y.severity - x.severity || (y.ts ?? 0) - (x.ts ?? 0));
  return items.slice(0, limit);
}

// Google News titles are "Headline - Publisher"; split on the last " - ".
function stripSource(t: string): string {
  const i = t.lastIndexOf(' - ');
  return (i > 20 ? t.slice(0, i) : t).trim();
}
function sourceOf(t: string): string | undefined {
  const i = t.lastIndexOf(' - ');
  return i > 20 ? t.slice(i + 3).trim() : undefined;
}

// Deterministic ±~1.6° spread so many headlines in one place fan out.
function jitter(seed: string, amp = 1.6): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = ((h >>> 0) % 2000) / 2000 - 0.5;
  const b = ((h >>> 11) % 2000) / 2000 - 0.5;
  return [a * 2 * amp, b * 2 * amp];
}
