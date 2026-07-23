// Live aircraft worldwide — OpenSky Network anonymous API (keyless, rate-limited).
// Server-cached 10 min to stay within the free anonymous credit budget. The
// global `states/all` call is heavier than a bbox but gives worldwide coverage;
// on GitHub Pages the hourly snapshot makes only 24 calls/day, well within budget.
import { cached, fetchJson } from '../util';
import type { FlightResult, GeoItem } from '../../types';

const MAX = 1200;

export async function handler(): Promise<FlightResult> {
  return cached('flights', 10 * 60 * 1000, async () => {
    const data = await fetchJson<{ states?: any[][] }>(
      'https://opensky-network.org/api/states/all',
      15000,
    ).catch(() => ({ states: [] }));
    const flights: GeoItem[] = [];
    for (const s of data.states ?? []) {
      const lon = s[5];
      const lat = s[6];
      const onGround = s[8];
      if (onGround || typeof lon !== 'number' || typeof lat !== 'number') continue;
      const callsign = String(s[1] ?? '').trim();
      flights.push({
        id: `os:${s[0]}`,
        layer: 'flights',
        lon,
        lat,
        title: callsign || String(s[0]),
        place: s[2] ? String(s[2]) : undefined,
        severity: 1,
        kind: 'aircraft',
        meta: { altM: s[7], velMs: s[9], trackDeg: s[10] },
      });
    }
    // Prefer higher-altitude en-route traffic when trimming to the cap.
    flights.sort((a, b) => (Number(b.meta?.altM) || 0) - (Number(a.meta?.altM) || 0));
    return { flights: flights.slice(0, MAX) };
  });
}
