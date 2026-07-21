// Energy incident radar — Google News RSS (keyless, fast, reliable), filtered to
// oil & gas / energy events and geocoded by scanning each headline against the
// place gazetteer. Headlines without a recognizable location are dropped (keeps
// the map honest). Precise per-article geocoding is ROADMAP v0.2.
import { cached, fetchText } from '../util';
import { scoreText } from '../../severity';
import { parseRss } from '../rss';
import { geocode } from '../places';
import type { FeedResult, GeoItem } from '../../types';

const QUERY =
  '(oil spill OR pipeline OR "refinery fire" OR blowout OR "well control" OR "offshore rig" OR ' +
  '"gas leak" OR wellhead OR "drilling rig" OR "LNG terminal" OR "oil rig" OR "well explosion") when:2d';

export async function handler(_params: URLSearchParams): Promise<FeedResult> {
  return cached('incidents:gnews', 5 * 60 * 1000, async () => {
    const url =
      `https://news.google.com/rss/search?q=${encodeURIComponent(QUERY)}` +
      `&hl=en-US&gl=US&ceid=US:en`;
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
      if (!coord) continue;
      const [jx, jy] = jitter(a.link || title);

      items.push({
        id: `gn:${a.link || title}`.slice(0, 200),
        layer: 'incidents',
        lon: coord[0] + jx,
        lat: coord[1] + jy,
        title,
        place: sourceOf(a.title),
        url: a.link || undefined,
        ts: a.date,
        severity: scoreText(title),
        kind: 'incident',
      });
    }

    items.sort((x, y) => y.severity - x.severity || (y.ts ?? 0) - (x.ts ?? 0));
    return { items: items.slice(0, 200) };
  });
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
