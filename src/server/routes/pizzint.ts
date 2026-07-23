// The "Pentagon Pizza Index" (PizzINT) — a tongue-in-cheek OSINT indicator that
// reads Google "popular times" busyness for pizzerias near the Pentagon/CIA and
// maps the aggregate to a DEFCON 1–5 level. Keyless. We surface the feed's own
// defcon_level + overall_index as a small chip beside our real signal DEFCON.
import { cached, fetchJson } from '../util';
import type { PizzintResult } from '../../types';

const LABELS: Record<number, string> = {
  1: 'Maximum Activity',
  2: 'High Activity',
  3: 'Elevated Activity',
  4: 'Above Normal',
  5: 'Normal Activity',
};

export async function handler(): Promise<PizzintResult> {
  return cached('pizzint', 30 * 60 * 1000, async () => {
    const j = await fetchJson<any>('https://www.pizzint.watch/api/dashboard-data', 12000);
    const defcon = Math.min(5, Math.max(1, Math.round(Number(j?.defcon_level) || 5)));
    const index = Math.round(Number(j?.overall_index) || 0);
    const spikes = Number(j?.active_spikes) || 0;
    return { defcon, index, spikes, label: LABELS[defcon] ?? 'Normal Activity' };
  });
}
