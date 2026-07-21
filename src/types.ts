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
  meta?: Record<string, unknown>;
}

export interface Quote {
  symbol: string;
  name: string;
  unit: string;
  price: number;
  changePct: number;
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
