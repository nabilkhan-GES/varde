// NASA FIRMS active-fire detections (VIIRS). Free key, gated on NASA_FIRMS_API_KEY
// (alias FIRMS_MAP_KEY / FIRMS_API_KEY). Without a key the route returns
// { available:false, fires:[] } and the layer is simply empty. Sized by fire
// radiative power, colored client-side; useful for wildfire risk near energy
// infrastructure. Free tier is ~10 req/min — one bbox call here stays well under.
import { cached, fetchText } from '../util';
import type { FireResult, GeoItem } from '../../types';

const KEY = process.env.NASA_FIRMS_API_KEY || process.env.FIRMS_MAP_KEY || process.env.FIRMS_API_KEY;
const SRC = 'VIIRS_SNPP_NRT';
const MAX = 900;

export async function handler(): Promise<FireResult> {
  if (!KEY) return { available: false, fires: [] };
  return cached('fires', 60 * 60 * 1000, async () => {
    // area/csv/<key>/<source>/<west,south,east,north>/<days>. FIRMS generates the
    // global file on a cold request (can take ~30-60s) then serves it cached, so
    // allow a generous timeout.
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${KEY}/${SRC}/-180,-90,180,90/1`;
    const csv = await fetchText(url, 90000);
    const fires = parseFires(csv);
    return { available: true, fires };
  });
}

export function parseFires(csv: string): GeoItem[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const cols = lines[0].split(',').map((c) => c.trim());
  const iLat = cols.indexOf('latitude');
  const iLon = cols.indexOf('longitude');
  const iFrp = cols.indexOf('frp');
  const iBright = cols.indexOf('bright_ti4');
  const iConf = cols.indexOf('confidence');
  const iDate = cols.indexOf('acq_date');
  if (iLat < 0 || iLon < 0) return [];

  const fires: GeoItem[] = [];
  for (let r = 1; r < lines.length; r++) {
    const f = lines[r].split(',');
    const lat = Number(f[iLat]);
    const lon = Number(f[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const frp = iFrp >= 0 ? Number(f[iFrp]) || 0 : 0;
    fires.push({
      id: `firms:${lat.toFixed(3)},${lon.toFixed(3)}:${r}`,
      layer: 'fires',
      lon,
      lat,
      title: `Fire · ${frp ? `${frp.toFixed(0)} MW` : 'detected'}`,
      place: iConf >= 0 ? `confidence ${f[iConf]}` : undefined,
      ts: iDate >= 0 ? Date.parse(f[iDate]) || undefined : undefined,
      // FRP → severity (roughly 1.2 … 6); big fires read larger + hotter.
      severity: Math.min(6, 1.2 + Math.sqrt(frp) / 3),
      kind: 'fire',
      meta: { frp, brightness: iBright >= 0 ? Number(f[iBright]) : undefined },
    });
  }
  fires.sort((a, b) => Number(b.meta?.frp) - Number(a.meta?.frp));
  return fires.slice(0, MAX);
}
