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
import { handler as fires } from '../src/server/routes/fires';
import { handler as gasstorage } from '../src/server/routes/gasstorage';
import { handler as energynews } from '../src/server/routes/energynews';
import { handler as hubweather } from '../src/server/routes/hubweather';
import { handler as cables } from '../src/server/routes/cables';
import { handler as tankers } from '../src/server/routes/tankers';
import { handler as pipelines } from '../src/server/routes/pipelines';
import { handler as fred } from '../src/server/routes/fred';
import { handler as acled } from '../src/server/routes/acled';
import { handler as fuelprices } from '../src/server/routes/fuelprices';
import { handler as renewables } from '../src/server/routes/renewables';
import { handler as predictions } from '../src/server/routes/predictions';
import { handler as tension } from '../src/server/routes/tension';
import { handler as sanctions } from '../src/server/routes/sanctions';

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
  ['fires', fires, { available: false, fires: [] }],
  ['gasstorage', gasstorage, { available: false, full: null, trend: null, storageTWh: null, points: [] }],
  ['energynews', energynews, { items: [] }],
  ['hubweather', hubweather, { hubs: [] }],
  ['cables', cables, { cables: [] }],
  ['tankers', tankers, { available: false, tankers: [] }],
  ['pipelines', pipelines, { lines: [] }],
  ['fred', fred, { available: false, series: [] }],
  ['acled', acled, { available: false, events: [] }],
  ['fuelprices', fuelprices, { available: false, series: [] }],
  ['renewables', renewables, { world: null, countries: [] }],
  ['predictions', predictions, { markets: [] }],
  ['tension', tension, { pairs: [] }],
  ['sanctions', sanctions, { items: [] }],
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
