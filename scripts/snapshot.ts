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

const OUT = fileURLToPath(new URL('../public/data/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const jobs: Array<[string, () => Promise<unknown>, unknown]> = [
  ['news', news, { incidents: [], conflict: [], cyber: [] }],
  ['hazards', hazards, { quakes: [], events: [], weather: [] }],
  ['flights', flights, { flights: [] }],
  ['markets', markets, { quotes: [] }],
  ['classvi', classvi, { wells: [], asOf: '', note: '' }],
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
