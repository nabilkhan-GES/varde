// Build-time feed snapshot for static hosting (GitHub Pages). Runs the same
// route handlers the serverless functions use, and writes their output to
// public/data/*.json, which Vite copies into the deploy. On Vercel these run
// live per-request instead; on Pages they're refreshed by the Actions cron.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { handler as news } from '../src/server/routes/news';
import { handler as hazards } from '../src/server/routes/hazards';
import { handler as flights } from '../src/server/routes/flights';
import { handler as markets } from '../src/server/routes/markets';
import { handler as classvi } from '../src/server/routes/classvi';
import { handler as energy } from '../src/server/routes/energy';
import { handler as inventories } from '../src/server/routes/inventories';
import { handler as trackers } from '../src/server/routes/trackers';
import { handler as chokepoints } from '../src/server/routes/chokepoints';
import { handler as pizzint } from '../src/server/routes/pizzint';

const OUT = fileURLToPath(new URL('../public/data/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const jobs: Array<[string, () => Promise<unknown>, unknown]> = [
  ['news', news, { incidents: [], conflict: [], cyber: [] }],
  ['hazards', hazards, { quakes: [], events: [], weather: [] }],
  ['flights', flights, { flights: [] }],
  ['markets', markets, { quotes: [] }],
  ['classvi', classvi, { wells: [], asOf: '', note: '' }],
  ['energy', energy, { available: false, series: [] }],
  ['inventories', inventories, { available: false, series: [] }],
  ['trackers', trackers, { asOf: '', note: '', pipelines: [], storage: [], crisis: [] }],
  ['chokepoints', chokepoints, { chokepoints: [] }],
  ['pizzint', pizzint, { defcon: 5, index: 0, spikes: 0, label: 'Normal Activity' }],
];

let failures = 0;
for (const [name, fn, fallback] of jobs) {
  try {
    const data = await fn();
    writeFileSync(`${OUT}${name}.json`, JSON.stringify(data));
    console.log(`✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`✗ ${name}: ${e instanceof Error ? e.message : String(e)}`);
    writeFileSync(`${OUT}${name}.json`, JSON.stringify(fallback));
  }
}
// Don't fail the build if a single upstream is down — ship the rest + fallbacks.
console.log(`snapshot complete (${failures} feed failure(s))`);
