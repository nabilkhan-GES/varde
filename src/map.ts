import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';

// Free, keyless dark basemap: CARTO dark-matter raster tiles.
const style: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors © CARTO',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0a0e14' } },
    { id: 'carto', type: 'raster', source: 'carto', paint: { 'raster-opacity': 0.9 } },
  ],
};

export interface MapHandle {
  map: maplibregl.Map;
  overlay: MapboxOverlay;
}

export function createMap(container: HTMLElement): MapHandle {
  const map = new maplibregl.Map({
    container,
    style,
    center: [-95, 30], // Gulf Coast / US energy belt
    zoom: 3.4,
    minZoom: 1.5,
    maxZoom: 12,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

  const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
  map.addControl(overlay as unknown as maplibregl.IControl);

  return { map, overlay };
}
