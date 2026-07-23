// Live tankers at energy chokepoints — AISStream timed sample (see ../ais.ts).
// Gated on AISSTREAM_API_KEY; without it returns { available:false, tankers:[] }.
// The sample window is tunable via AIS_SAMPLE_MS (default 40s) — long enough on a
// GitHub Actions snapshot build, and cached so dev/serverless only sample rarely.
import { cached } from '../util';
import { sampleTankers } from '../ais';
import type { TankerResult } from '../../types';

const KEY = process.env.AISSTREAM_API_KEY || process.env.VITE_AISSTREAM_API_KEY;
const SAMPLE_MS = Number(process.env.AIS_SAMPLE_MS) || 40000;

export async function handler(): Promise<TankerResult> {
  if (!KEY) return { available: false, tankers: [] };
  return cached('tankers', 10 * 60 * 1000, async () => {
    const tankers = await sampleTankers({ apiKey: KEY as string, durationMs: SAMPLE_MS });
    return { available: true, tankers };
  });
}
