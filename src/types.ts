export type LayerId =
  | 'incidents'
  | 'conflict'
  | 'cyber'
  | 'quakes'
  | 'events'
  | 'weather'
  | 'flights'
  | 'classvi'
  | 'disasters'
  | 'storms';

/** A single mappable item, normalized across every source. */
export interface GeoItem {
  id: string;
  layer: LayerId;
  lon: number;
  lat: number;
  title: string;
  place?: string;
  url?: string;
  ts?: number; // epoch ms
  severity: number; // computed score, >= 1
  kind?: string; // sub-category (EONET category, magnitude band, aircraft, …)
  /** Optional area geometry (e.g. NWS alert polygons) for a filled map layer.
   *  Point layers still use lon/lat (the geometry's centroid). */
  polygon?: GeoJsonGeometry;
  meta?: Record<string, unknown>;
}

/** Minimal GeoJSON Polygon / MultiPolygon (rings of [lon, lat]). */
export interface GeoJsonGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

export interface Quote {
  symbol: string;
  name: string;
  unit: string;
  price: number;
  changePct: number;
  spark: number[];
}

export type LayerData = Record<LayerId, GeoItem[]>;

export interface NewsResult {
  incidents: GeoItem[];
  conflict: GeoItem[];
  cyber: GeoItem[];
}
export interface HazardResult {
  quakes: GeoItem[];
  events: GeoItem[];
  weather: GeoItem[];
  disasters: GeoItem[];
  storms: GeoItem[];
}
export interface FlightResult {
  flights: GeoItem[];
}
export interface MarketResult {
  quotes: Quote[];
}
export interface ClassViResult {
  wells: GeoItem[];
  asOf: string;
  note: string;
}
export interface EnergyStat {
  key: string;
  label: string;
  unit: string;
  value: number | null;
  changePct: number | null;
  period?: string;
}
export interface EnergyResult {
  available: boolean;
  series: EnergyStat[];
  asOf?: string;
}

export interface InventoryPoint {
  period: string; // ISO date (weekly)
  value: number;
}
export interface InventorySeries {
  key: string;
  label: string;
  unit: string;
  color: string; // hex, for the chart stroke/fill
  latest: number | null;
  changePct: number | null; // week-over-week
  points: InventoryPoint[]; // oldest → newest
}
export interface InventoriesResult {
  available: boolean;
  series: InventorySeries[];
  asOf?: string;
}
