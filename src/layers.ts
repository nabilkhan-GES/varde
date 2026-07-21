import { ScatterplotLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import { severityColor, severityRadius } from './severity';
import type { GeoItem, LayerId } from './types';

export interface LayerData {
  incidents: GeoItem[];
  quakes: GeoItem[];
  events: GeoItem[];
}

export interface LayerStyle {
  id: LayerId;
  label: string;
  color: string; // legend swatch (hex)
}

// Fixed swatch per layer for the legend; on the map, incident/quake severity
// drives the actual dot color so hotspots read at a glance.
export const LAYER_STYLES: LayerStyle[] = [
  { id: 'incidents', label: 'Energy incidents', color: '#f97316' },
  { id: 'quakes', label: 'Seismicity (USGS)', color: '#38bdf8' },
  { id: 'events', label: 'Natural hazards', color: '#a78bfa' },
];

const FIXED_RGB: Record<LayerId, [number, number, number]> = {
  incidents: [249, 115, 22],
  quakes: [56, 189, 248],
  events: [167, 139, 250],
};

export function buildLayers(
  data: LayerData,
  visible: Record<LayerId, boolean>,
  onPick: (item: GeoItem) => void,
): Layer[] {
  const layers: Layer[] = [];

  const make = (id: LayerId, items: GeoItem[], severityColored: boolean) =>
    new ScatterplotLayer<GeoItem>({
      id,
      data: items,
      visible: visible[id],
      pickable: true,
      radiusUnits: 'pixels',
      radiusMinPixels: 3,
      stroked: true,
      lineWidthUnits: 'pixels',
      getLineWidth: 1,
      getLineColor: [10, 14, 20, 220],
      opacity: 0.85,
      getPosition: (d: GeoItem) => [d.lon, d.lat],
      getRadius: (d: GeoItem) => severityRadius(d.severity),
      getFillColor: (d: GeoItem) =>
        severityColored ? [...severityColor(d.severity), 235] : [...FIXED_RGB[id], 220],
      updateTriggers: {
        getFillColor: [severityColored],
      },
      onClick: (info) => {
        if (info.object) onPick(info.object as GeoItem);
      },
    });

  // Draw order: hazards/quakes beneath, incidents on top (highest interest).
  layers.push(make('events', data.events, false));
  layers.push(make('quakes', data.quakes, true));
  layers.push(make('incidents', data.incidents, true));
  return layers;
}
