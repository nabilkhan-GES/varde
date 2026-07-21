export type LayerId = 'incidents' | 'quakes' | 'events';

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
  kind?: string; // sub-category (EONET category, magnitude band, …)
  meta?: Record<string, unknown>;
}

export interface Quote {
  symbol: string;
  name: string;
  unit: string;
  price: number;
  changePct: number;
}

export interface FeedResult {
  items: GeoItem[];
}

export interface HazardResult {
  quakes: GeoItem[];
  events: GeoItem[];
}

export interface MarketResult {
  quotes: Quote[];
}
