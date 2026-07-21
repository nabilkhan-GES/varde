// GDELT DOC 2.0 as a second, geo-bearing news source (ROADMAP v0.2).
//
// Google News RSS gives clean, well-scored headlines but no location metadata,
// so headlines whose text names no gazetteer place get dropped. GDELT returns a
// `sourcecountry` per article, letting us place those too: we still try the
// city/region gazetteer on the title first (precise), and fall back to the
// article's source-country centroid. Keyless and best-effort — the whole path
// is wrapped in a catch upstream, so a GDELT hiccup just means fewer dots.
import { fetchJson } from './util';
import { geocodeDetailed, precisionJitter } from './places';
import { COUNTRY_CENTROIDS } from './centroids';
import { scoreText } from '../severity';
import type { GeoItem, LayerId } from '../types';

export interface GdeltArticle {
  url?: string;
  title?: string;
  seendate?: string; // e.g. "20260721T101500Z"
  domain?: string;
  sourcecountry?: string;
}

const API = 'https://api.gdeltproject.org/api/v2/doc/doc';

export async function fetchGdelt(
  query: string,
  layer: LayerId,
  { timespan = '2d', maxrecords = 75 } = {},
): Promise<GeoItem[]> {
  const url =
    `${API}?query=${encodeURIComponent(query)}` +
    `&mode=artlist&format=json&sort=datedesc&timespan=${timespan}&maxrecords=${maxrecords}`;
  const data = await fetchJson<{ articles?: GdeltArticle[] }>(url, 15000);
  return articlesToGeoItems(data.articles ?? [], layer);
}

/** Pure: GDELT articles → geocoded, scored GeoItems. Gazetteer title match
 *  wins; else the source-country centroid; else the article is dropped. */
export function articlesToGeoItems(articles: GdeltArticle[], layer: LayerId): GeoItem[] {
  const out: GeoItem[] = [];
  for (const a of articles) {
    const title = (a.title ?? '').trim();
    if (!title) continue;

    const g = geocodeDetailed(title);
    const country = a.sourcecountry ? COUNTRY_CENTROIDS[a.sourcecountry] : undefined;
    const base = g?.coord ?? country;
    if (!base) continue; // no title place and no known source country

    const precision = g?.precision ?? 'country';
    const [jx, jy] = precisionJitter(a.url || title, precision);
    out.push({
      id: `${layer}:gdelt:${a.url || title}`.slice(0, 200),
      layer,
      lon: base[0] + jx,
      lat: base[1] + jy,
      title,
      place: a.domain || a.sourcecountry || undefined,
      url: a.url || undefined,
      ts: parseSeenDate(a.seendate),
      severity: scoreText(title),
      kind: layer,
      meta: { source: 'gdelt', precision },
    });
  }
  return out;
}

// GDELT stamps "YYYYMMDDTHHMMSSZ" — turn it into epoch ms.
export function parseSeenDate(s?: string): number | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (!m) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : undefined;
  }
  const [, y, mo, d, h, mi, se] = m;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
}
