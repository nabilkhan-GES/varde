// Lightweight gazetteer for geocoding incident headlines: countries (reused from
// centroids) plus energy-relevant U.S. states and basins/regions. `geocode()`
// scans text for the longest matching place name and returns its centroid.
// Approximate by design — precise per-article geocoding is ROADMAP v0.2.
import { COUNTRY_CENTROIDS } from './centroids';

const US_STATES: Record<string, [number, number]> = {
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

const REGIONS: Record<string, [number, number]> = {
  'Gulf of Mexico': [-90.0, 25.0],
  'Gulf Coast': [-92.5, 29.5],
  'Permian Basin': [-102.5, 31.9],
  Permian: [-102.5, 31.9],
  'Eagle Ford': [-98.5, 28.8],
  Bakken: [-103.0, 47.8],
  Marcellus: [-78.0, 40.5],
  Appalachia: [-81.0, 38.5],
  'North Sea': [3.0, 56.5],
  'Persian Gulf': [51.5, 27.0],
  'Niger Delta': [6.5, 5.3],
};

export const GAZETTEER: Record<string, [number, number]> = {
  ...COUNTRY_CENTROIDS,
  ...US_STATES,
  ...REGIONS,
};

const ENTRIES = Object.entries(GAZETTEER).sort((a, b) => b[0].length - a[0].length);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MATCHERS = ENTRIES.map(([name, coord]) => ({
  re: new RegExp(`\\b${escapeRe(name)}\\b`, 'i'),
  coord,
}));

export function geocode(text: string): [number, number] | null {
  for (const { re, coord } of MATCHERS) if (re.test(text)) return coord;
  return null;
}
