// Three themed, energy-scoped news layers from one endpoint.
import { cached } from '../util';
import { fetchNews } from '../news';
import type { NewsResult } from '../../types';

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

export async function handler(): Promise<NewsResult> {
  return cached('news', 5 * 60 * 1000, async () => {
    const [incidents, conflict, cyber] = await Promise.all([
      fetchNews(QUERIES.incidents, 'incidents').catch(() => []),
      fetchNews(QUERIES.conflict, 'conflict', 120).catch(() => []),
      fetchNews(QUERIES.cyber, 'cyber', 80).catch(() => []),
    ]);
    return { incidents, conflict, cyber };
  });
}
