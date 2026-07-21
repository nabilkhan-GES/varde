import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import { severityRadius } from './severity';
import type { GeoItem, LayerData, LayerId } from './types';

export interface LayerStyle {
  id: LayerId;
  label: string;
  color: [number, number, number];
  hex: string;
}

// Each layer gets a distinct color (worldmonitor-style) so layers are
// distinguishable at a glance; severity is encoded by marker *radius*.
// Array order is draw order — first is bottom, last (incidents) on top.
export const LAYER_STYLES: LayerStyle[] = [
  { id: 'flights', label: 'Live aircraft', color: [148, 163, 184], hex: '#94a3b8' },
  { id: 'classvi', label: 'Class VI (CCUS)', color: [52, 211, 153], hex: '#34d399' },
  { id: 'events', label: 'Natural hazards', color: [167, 139, 250], hex: '#a78bfa' },
  { id: 'disasters', label: 'Global disasters', color: [234, 179, 8], hex: '#eab308' },
  { id: 'storms', label: 'Tropical cyclones', color: [45, 212, 191], hex: '#2dd4bf' },
  { id: 'weather', label: 'Weather alerts', color: [34, 211, 238], hex: '#22d3ee' },
  { id: 'quakes', label: 'Seismicity', color: [56, 189, 248], hex: '#38bdf8' },
  { id: 'cyber', label: 'Cyber', color: [232, 121, 249], hex: '#e879f9' },
  { id: 'conflict', label: 'Conflict', color: [239, 68, 68], hex: '#ef4444' },
  { id: 'incidents', label: 'Energy incidents', color: [249, 115, 22], hex: '#f97316' },
];

/** Keep items with no timestamp (reference data) or within the time window. */
export function withinWindow(items: GeoItem[], sinceMs: number): GeoItem[] {
  if (!sinceMs) return items;
  return items.filter((d) => !d.ts || d.ts >= sinceMs);
}

// NWS alert areas, drawn as filled polygons beneath every point layer so the
// dots stay legible on top. Cyan to match the weather layer's swatch.
const WEATHER_HEX = LAYER_STYLES.find((s) => s.id === 'weather')!.color;
function weatherPolygonLayer(
  data: LayerData,
  visible: Record<LayerId, boolean>,
  onPick: (item: GeoItem) => void,
  sinceMs: number,
): Layer | null {
  const areas = withinWindow(data.weather ?? [], sinceMs).filter((d) => d.polygon);
  if (!visible.weather || areas.length === 0) return null;
  const features = areas.map((d) => ({
    type: 'Feature' as const,
    geometry: d.polygon!,
    properties: { item: d },
  }));
  // Cast: our GeoJsonGeometry is a lean subset of GeoJSON's strict Geometry union.
  const fc = { type: 'FeatureCollection', features } as any;
  return new GeoJsonLayer({
    id: 'weather-poly',
    data: fc,
    pickable: true,
    stroked: true,
    filled: true,
    lineWidthUnits: 'pixels',
    getLineWidth: 1.2,
    getLineColor: [...WEATHER_HEX, 200] as [number, number, number, number],
    getFillColor: [...WEATHER_HEX, 40] as [number, number, number, number],
    onClick: (info) => {
      const f = info.object as { properties?: { item?: GeoItem } } | undefined;
      if (f?.properties?.item) onPick(f.properties.item);
    },
  });
}

export function buildLayers(
  data: LayerData,
  visible: Record<LayerId, boolean>,
  onPick: (item: GeoItem) => void,
  sinceMs = 0,
): Layer[] {
  const poly = weatherPolygonLayer(data, visible, onPick, sinceMs);
  const points = LAYER_STYLES.map(
    (s) =>
      new ScatterplotLayer<GeoItem>({
        id: s.id,
        data: withinWindow(data[s.id] ?? [], sinceMs),
        visible: visible[s.id],
        pickable: true,
        radiusUnits: 'pixels',
        radiusMinPixels: s.id === 'flights' ? 2 : 3,
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: 1,
        getLineColor: [10, 14, 20, 200],
        opacity: s.id === 'flights' ? 0.7 : 0.88,
        getPosition: (d: GeoItem) => [d.lon, d.lat],
        getRadius: (d: GeoItem) => (s.id === 'flights' ? 2.8 : severityRadius(d.severity)),
        getFillColor: [...s.color, 225] as [number, number, number, number],
        onClick: (info) => {
          if (info.object) onPick(info.object as GeoItem);
        },
      }),
  );
  // Polygons first (bottom), then all point layers on top.
  return poly ? [poly, ...points] : points;
}
