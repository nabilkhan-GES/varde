// Live aircraft over the Gulf of Mexico / U.S. energy corridor — OpenSky Network
// anonymous API (keyless, rate-limited). Server-cached 10 min to stay within the
// free anonymous credit budget; a bounded bbox keeps each call cheap.
import { cached, fetchJson } from '../util';
import type { FlightResult, GeoItem } from '../../types';

// [lamin, lomin, lamax, lomax] — Texas/Louisiana coast + Gulf offshore.
const BBOX = { lamin: 18, lomin: -98, lamax: 31, lomax: -80 };

export async function handler(): Promise<FlightResult> {
  return cached('flights', 10 * 60 * 1000, async () => {
    const url =
      `https://opensky-network.org/api/states/all?lamin=${BBOX.lamin}&lomin=${BBOX.lomin}` +
      `&lamax=${BBOX.lamax}&lomax=${BBOX.lomax}`;
    const data = await fetchJson<{ states?: any[][] }>(url, 12000).catch(() => ({ states: [] }));
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
    return { flights: flights.slice(0, 500) };
  });
}
