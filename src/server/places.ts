// Gazetteer for geocoding incident headlines. Three precision tiers, matched
// longest-name-first so the most specific place in a headline wins:
//   • city   — energy hubs, ports, refining/producing towns (tight, ~0.15° jitter)
//   • region — basins, seas, producing regions, US states (medium, ~0.6°)
//   • country — national centroid, last resort (wide, ~1.6°)
// `geocodeDetailed()` returns the coord *and* its precision so callers can fan
// out overlapping headlines proportionally instead of a blanket smear. This is
// the ROADMAP v0.2 "real per-article geo" step: city-level placement first,
// GDELT `sourcecountry` centroid (via COUNTRY_CENTROIDS) as the fallback.
import { COUNTRY_CENTROIDS } from './centroids';

export type Precision = 'city' | 'region' | 'country';

// Energy-relevant cities, ports and hubs worldwide — the precise tier.
const CITIES: Record<string, [number, number]> = {
  // US energy hubs
  Houston: [-95.37, 29.76],
  Midland: [-102.08, 31.99],
  Odessa: [-102.37, 31.85],
  'Corpus Christi': [-97.4, 27.8],
  'Port Arthur': [-93.94, 29.9],
  'Baton Rouge': [-91.19, 30.45],
  'New Orleans': [-90.07, 29.95],
  'Lake Charles': [-93.22, 30.23],
  Cushing: [-96.77, 35.98],
  Tulsa: [-95.99, 36.15],
  'Oklahoma City': [-97.52, 35.47],
  Denver: [-104.99, 39.74],
  Pittsburgh: [-79.99, 40.44],
  Williston: [-103.62, 48.15],
  Bakersfield: [-119.02, 35.37],
  Galveston: [-94.79, 29.3],
  Freeport: [-95.36, 28.95],
  Beaumont: [-94.13, 30.08],
  Anchorage: [-149.9, 61.22],
  // Europe
  Rotterdam: [4.48, 51.92],
  Antwerp: [4.4, 51.22],
  Aberdeen: [-2.09, 57.15],
  Stavanger: [5.73, 58.97],
  Bergen: [5.32, 60.39],
  Hamburg: [10.0, 53.55],
  Wilhelmshaven: [8.11, 53.53],
  Trieste: [13.77, 45.65],
  Sicily: [14.15, 37.6],
  Gdansk: [18.65, 54.35],
  // MENA + Caspian
  'Ras Tanura': [50.16, 26.64],
  Dhahran: [50.1, 26.29],
  Jubail: [49.66, 27.0],
  Abqaiq: [49.67, 25.93],
  'Abu Dhabi': [54.37, 24.45],
  Dubai: [55.27, 25.2],
  'Ras Laffan': [51.6, 25.9],
  Fujairah: [56.33, 25.12],
  'Kharg Island': [50.32, 29.23],
  Basra: [47.78, 30.51],
  Kirkuk: [44.39, 35.47],
  Baku: [49.87, 40.41],
  Suez: [32.55, 29.97],
  'Port Said': [32.3, 31.26],
  // Africa
  'Port Harcourt': [7.0, 4.82],
  Bonny: [7.17, 4.43],
  Warri: [5.75, 5.52],
  Luanda: [13.23, -8.84],
  // Americas (non-US)
  Alberta: [-114.0, 54.0],
  'Fort McMurray': [-111.38, 56.73],
  Edmonton: [-113.49, 53.55],
  'Vaca Muerta': [-69.4, -38.5],
  Neuquen: [-68.06, -38.95],
  Maracaibo: [-71.64, 10.65],
  'Rio de Janeiro': [-43.2, -22.9],
  Santos: [-46.33, -23.96],
  // Asia-Pacific
  Singapore: [103.82, 1.35],
  Daqing: [125.0, 46.6],
  Jamnagar: [70.06, 22.47],
  Mumbai: [72.88, 19.08],
  Karachi: [67.0, 24.86],
  Darwin: [130.84, -12.46],
  Gladstone: [151.26, -23.84],
  'Bontang': [117.5, 0.13],
};

// Basins, seas and producing regions — the medium tier.
const REGIONS: Record<string, [number, number]> = {
  'Gulf of Mexico': [-90.0, 25.0],
  'Gulf Coast': [-92.5, 29.5],
  'Permian Basin': [-102.5, 31.9],
  Permian: [-102.5, 31.9],
  'Eagle Ford': [-98.5, 28.8],
  'Bakken': [-103.0, 47.8],
  Marcellus: [-78.0, 40.5],
  Appalachia: [-81.0, 38.5],
  'North Sea': [3.0, 56.5],
  'Persian Gulf': [51.5, 27.0],
  'Strait of Hormuz': [56.5, 26.6],
  'Red Sea': [38.0, 20.0],
  'Niger Delta': [6.5, 5.3],
  'Caspian Sea': [50.5, 41.5],
  'South China Sea': [114.0, 12.0],
  'Gulf of Guinea': [3.0, 2.0],
  'Suez Canal': [32.35, 30.7],
  'Bab el-Mandeb': [43.3, 12.6],
  // US states (energy-relevant)
  Texas: [-99.3, 31.5],
  Oklahoma: [-97.5, 35.5],
  Louisiana: [-92.0, 30.9],
  'New Mexico': [-106.1, 34.4],
  'North Dakota': [-100.5, 47.5],
  Colorado: [-105.5, 39.0],
  Pennsylvania: [-77.7, 40.9],
  California: [-119.4, 36.8],
  Alaska: [-152.0, 64.2],
  Wyoming: [-107.5, 43.0],
  'West Virginia': [-80.6, 38.6],
  Ohio: [-82.8, 40.4],
  Kansas: [-98.4, 38.5],
  Utah: [-111.7, 39.3],
  Montana: [-109.6, 46.9],
  Alabama: [-86.8, 32.8],
  Mississippi: [-89.7, 32.7],
};

interface Entry {
  re: RegExp;
  coord: [number, number];
  precision: Precision;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function tier(map: Record<string, [number, number]>, precision: Precision): Entry[] {
  return Object.entries(map).map(([name, coord]) => ({
    re: new RegExp(`\\b${escapeRe(name)}\\b`, 'i'),
    coord,
    precision,
  }));
}

// Most-specific tier first (city > region > country) so a headline naming both
// a city and its country resolves to the city; within a tier, longest name wins
// so "New Mexico" beats "Mexico" and "Gulf of Mexico" beats "Gulf Coast". (The
// New-Mexico/Gulf-of-Mexico-vs-Mexico cases also fall out of tier order, since
// the more specific place sits in the higher tier.)
const PRECISION_RANK: Record<Precision, number> = { city: 0, region: 1, country: 2 };
const MATCHERS: Entry[] = [
  ...tier(CITIES, 'city'),
  ...tier(REGIONS, 'region'),
  ...tier(COUNTRY_CENTROIDS, 'country'),
].sort((a, b) => {
  const rank = PRECISION_RANK[a.precision] - PRECISION_RANK[b.precision];
  if (rank !== 0) return rank;
  return b.re.source.length - a.re.source.length;
});

// Combined lookup kept for any callers that only need a country-level centroid.
export const GAZETTEER: Record<string, [number, number]> = {
  ...COUNTRY_CENTROIDS,
  ...REGIONS,
  ...CITIES,
};

export interface GeoMatch {
  coord: [number, number];
  precision: Precision;
}

/** Longest, most-specific place name in `text` → its coord + precision tier. */
export function geocodeDetailed(text: string): GeoMatch | null {
  for (const { re, coord, precision } of MATCHERS) {
    if (re.test(text)) return { coord, precision };
  }
  return null;
}

/** Back-compat: coord only. */
export function geocode(text: string): [number, number] | null {
  return geocodeDetailed(text)?.coord ?? null;
}

// Deterministic spread, tighter for more precise placements so a cluster of
// city-level dots stays over the city while country-level dots fan out. Seeded
// by the article URL/title so a headline lands in the same spot every refresh.
const AMP: Record<Precision, number> = { city: 0.15, region: 0.6, country: 1.6 };
export function precisionJitter(seed: string, precision: Precision): [number, number] {
  const amp = AMP[precision];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = ((h >>> 0) % 2000) / 2000 - 0.5;
  const b = ((h >>> 11) % 2000) / 2000 - 0.5;
  return [a * 2 * amp, b * 2 * amp];
}
