// Three themed, energy-scoped news layers from one endpoint. Google News RSS
// (clean headlines, gazetteer-geocoded) is the primary source, deduped within
// and across layers.
//
// GDELT DOC 2.0 is wired as an *optional* second source for the incidents layer
// (adds `sourcecountry` geo for headlines the gazetteer misses), but off by
// default: its full-text matching is too loose (energy terms like "pipeline"
// collide with data/sales "pipelines") and it rate-limits to ~1 req/5s. Enable
// with VARDE_GDELT=1 once the query is tuned. See ROADMAP.
import { cached } from '../util';
import { fetchNews, dedupeStories } from '../news';
import { fetchGdelt } from '../gdelt';
import type { GeoItem, NewsResult } from '../../types';

const QUERIES = {
  incidents:
    '(oil spill OR pipeline OR "refinery fire" OR blowout OR "well control" OR "offshore rig" OR ' +
    '"gas leak" OR wellhead OR "drilling rig" OR "LNG terminal" OR "well explosion") when:2d',
  conflict:
    '(war OR conflict OR airstrike OR missile OR "military strike" OR offensive OR shelling OR clashes OR blockade) ' +
    '(energy OR oil OR gas OR pipeline OR port OR tanker OR refinery OR grid OR infrastructure) when:3d',
  cyber:
    '(cyberattack OR ransomware OR "data breach" OR hacked OR malware OR SCADA) ' +
    '(energy OR grid OR pipeline OR utility OR oil OR gas OR power OR infrastructure) when:5d',
};

// GDELT DOC 2.0 uses its own query grammar (space = AND, explicit OR, quoted
// phrases; no `when:` — timespan is a separate arg). GDELT rate-limits to ~1
// request / 5s, so we make a *single* call — for `incidents`, the layer that
// gains the most from GDELT's `sourcecountry` geo (RSS already covers conflict
// and cyber well). Firing all three concurrently just 429s them all; one call
// stays safely under the limit and well under a serverless timeout.
const GDELT_INCIDENTS =
  '("oil spill" OR blowout OR "refinery fire" OR "gas leak" OR pipeline OR wellhead OR "LNG terminal")';

// GDELT full-text matching is looser than Google News' curated relevance, so it
// drags in off-topic hits (a phone "leak", a "fireside" chat). Keep only titles
// that actually name the energy domain — this is the incidents layer.
const ENERGY_RELEVANT =
  /\b(oil|gas|pipeline|refiner|wellhead|drill|rig|offshore|crude|petrol|lng|fuel|energy|power (grid|plant)|electric grid|spill|blowout|frack|shale|petroleum|hydrocarbon|terminal|tanker|well control)\b/i;

const GDELT_ENABLED = process.env.VARDE_GDELT === '1';

export async function handler(): Promise<NewsResult> {
  return cached('news', 5 * 60 * 1000, async () => {
    const [incidentsRss, conflict, cyber, incidentsGdelt] = await Promise.all([
      fetchNews(QUERIES.incidents, 'incidents', 150).catch(() => [] as GeoItem[]),
      fetchNews(QUERIES.conflict, 'conflict', 120).catch(() => [] as GeoItem[]),
      fetchNews(QUERIES.cyber, 'cyber', 80).catch(() => [] as GeoItem[]),
      GDELT_ENABLED
        ? fetchGdelt(GDELT_INCIDENTS, 'incidents', { timespan: '2d' })
            .then((items) => items.filter((it) => ENERGY_RELEVANT.test(it.title)))
            .catch(() => [] as GeoItem[])
        : Promise.resolve([] as GeoItem[]),
    ]);

    // Dedupe within and across layers. Order = layer priority for identical
    // items: an incident outranks a conflict outranks a cyber placement.
    const merged = dedupeStories([[...incidentsRss, ...incidentsGdelt], conflict, cyber]);
    return {
      incidents: (merged.get('incidents') ?? []).slice(0, 150),
      conflict: (merged.get('conflict') ?? []).slice(0, 120),
      cyber: (merged.get('cyber') ?? []).slice(0, 80),
    };
  });
}
