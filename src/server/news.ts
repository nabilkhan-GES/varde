// Shared news engine: pull a Google News RSS query (keyless, fast, reliable),
// parse it, geocode each headline against the place gazetteer (city → region →
// country precision), and score it. Powers the incidents / conflict / cyber
// layers with different queries.
import { fetchText } from './util';
import { parseRss } from './rss';
import { geocodeDetailed, precisionJitter } from './places';
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

    const geo = geocodeDetailed(title);
    if (!geo) continue; // no recognizable location → skip
    const [jx, jy] = precisionJitter(a.link || title, geo.precision);

    items.push({
      id: `${layer}:${a.link || title}`.slice(0, 200),
      layer,
      lon: geo.coord[0] + jx,
      lat: geo.coord[1] + jy,
      title,
      place: sourceOf(a.title),
      url: a.link || undefined,
      ts: a.date,
      severity: scoreText(title),
      kind: layer,
      meta: { source: 'rss', precision: geo.precision },
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

// ── Cross-source / cross-layer dedupe ─────────────────────────────────────────
// The same story frequently surfaces via RSS *and* GDELT, and a single event can
// match more than one layer's query (e.g. a refinery hit in a conflict zone lands
// in both `incidents` and `conflict`). We collapse those to one dot, keeping the
// highest-severity copy — and, on ties, the more precisely placed one.

/** Normalize a headline for fuzzy equality: lowercase, drop punctuation, collapse
 *  whitespace, and keep the leading words that carry the story's identity. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’"“”]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 8)
    .join(' ');
}

const PRECISION_RANK: Record<string, number> = { city: 0, region: 1, country: 2 };
function moreSpecific(a: GeoItem, b: GeoItem): boolean {
  const pa = PRECISION_RANK[String(a.meta?.precision)] ?? 3;
  const pb = PRECISION_RANK[String(b.meta?.precision)] ?? 3;
  return pa < pb;
}

// Tiny disjoint-set over string keys, so items that share *either* a canonical
// URL or a normalized title end up in one story group — even transitively
// (RSS-copy ↔ shared-title ↔ GDELT-copy).
class DSU {
  private parent = new Map<string, string>();
  find(x: string): string {
    let p = this.parent.get(x);
    if (p === undefined) {
      this.parent.set(x, x);
      return x;
    }
    if (p !== x) {
      p = this.find(p);
      this.parent.set(x, p);
    }
    return p;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

const canonicalUrl = (url: string) => `u:${url.split('#')[0].split('?')[0]}`;

/** Merge many layers' items, dropping duplicate stories. Two items are the same
 *  story if they share a canonical URL or a normalized title. The surviving copy
 *  is the highest-severity one (ties → more precise placement, then input order,
 *  which makes earlier layers win identical items). Returns items grouped back by
 *  layer, each re-sorted by severity then recency. */
export function dedupeStories(perLayer: GeoItem[][]): Map<LayerId, GeoItem[]> {
  const all = perLayer.flat();
  const dsu = new DSU();
  const keyOf = new Map<GeoItem, string>();

  for (const it of all) {
    const titleKey = `t:${normalizeTitle(it.title)}`;
    keyOf.set(it, titleKey);
    if (it.url) dsu.union(canonicalUrl(it.url), titleKey);
    else dsu.find(titleKey); // ensure the node exists
  }

  const groups = new Map<string, GeoItem[]>();
  for (const it of all) {
    const rep = dsu.find(keyOf.get(it)!);
    const arr = groups.get(rep) ?? [];
    arr.push(it);
    groups.set(rep, arr);
  }

  const byLayer = new Map<LayerId, GeoItem[]>();
  for (const grp of groups.values()) {
    let best = grp[0];
    for (const it of grp) {
      if (it.severity > best.severity || (it.severity === best.severity && moreSpecific(it, best))) {
        best = it;
      }
    }
    const arr = byLayer.get(best.layer) ?? [];
    arr.push(best);
    byLayer.set(best.layer, arr);
  }
  for (const arr of byLayer.values()) {
    arr.sort((x, y) => y.severity - x.severity || (y.ts ?? 0) - (x.ts ?? 0));
  }
  return byLayer;
}
