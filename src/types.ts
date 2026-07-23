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
  | 'storms'
  | 'chokepoints'
  | 'fires'
  | 'tankers';

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
export interface ChokepointResult {
  chokepoints: GeoItem[];
}
export interface FireResult {
  available: boolean;
  fires: GeoItem[];
}
export interface TankerResult {
  available: boolean;
  tankers: GeoItem[];
}
export interface PizzintResult {
  defcon: number; // 1 (max) … 5 (normal)
  index: number; // aggregate activity %
  spikes: number;
  label: string;
}
export interface GasStorageResult {
  available: boolean;
  asOf?: string;
  full: number | null; // latest EU fill %
  trend: number | null; // daily change (percentage points)
  storageTWh: number | null;
  points: InventoryPoint[]; // fill % over time (oldest → newest)
}

export interface EnergyHeadline {
  title: string;
  source: string;
  url?: string;
  ts?: number;
}
export interface EnergyNewsResult {
  items: EnergyHeadline[];
}

export interface HubWeather {
  name: string;
  region: string;
  tempC: number | null;
  maxC: number | null;
  minC: number | null;
  windKph: number | null;
}
export interface HubWeatherResult {
  hubs: HubWeather[];
}

export interface CableLine {
  name: string;
  path: number[][]; // [lon,lat] vertices
}
export interface CablesResult {
  cables: CableLine[];
}
export interface PipelineLine {
  name: string;
  status: string;
  path: number[][];
}
export interface PipelinesResult {
  lines: PipelineLine[];
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

export interface PipelineRow {
  name: string;
  from: string;
  to: string;
  capacity: number | null;
  unit: string;
  status: string; // operating | reduced | idle | offline | closed
  operator?: string;
  note?: string;
}
export interface StorageRow {
  name: string;
  country: string;
  type: string; // SPR | commercial | products | crude | export
  capacity: number | null;
  unit: string;
  status: string;
  operator?: string;
  note?: string;
}
export interface CrisisRow {
  country: string;
  product: string;
  since: string;
  severity: string; // high | medium | low
  note?: string;
}
export interface TrackersResult {
  asOf: string;
  note: string;
  pipelines: PipelineRow[];
  storage: StorageRow[];
  crisis: CrisisRow[];
}
