import { ArcLayer, GeoJsonLayer, IconLayer, PathLayer, PolygonLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import { severityRadius } from './severity';
import type { CableLine, GeoItem, LayerData, LayerId, PipelineLine } from './types';

// Pipeline status → color (matches the tracker panel semantics).
const PIPE_COLOR: Record<string, [number, number, number]> = {
  operating: [46, 204, 113],
  reduced: [243, 156, 18],
  idle: [200, 160, 60],
  offline: [231, 76, 60],
  closed: [231, 76, 60],
};

// A crisp airplane silhouette (points north), white so deck.gl's getColor can
// tint it via mask:true — one icon recolored per aircraft by altitude.
const PLANE_ICON =
  'data:image/svg+xml;base64,' +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
      '<path d="M16 2 L17.4 13 L29 20 L29 22.4 L17.4 18.6 L17.4 26 L21 29 L21 30.6 L16 29 L11 30.6 L11 29 L14.6 26 L14.6 18.6 L3 22.4 L3 20 L14.6 13 Z" fill="white"/>' +
      '</svg>',
  );

// Altitude (ft) → color: low warm grey/amber → high cool cyan/violet.
const ALT_STOPS: Array<[number, [number, number, number]]> = [
  [0, [148, 163, 184]],
  [10000, [234, 179, 8]],
  [25000, [56, 189, 248]],
  [40000, [139, 92, 246]],
];
function altitudeToColor(ft: number): [number, number, number] {
  if (!Number.isFinite(ft)) return [148, 163, 184];
  for (let i = 1; i < ALT_STOPS.length; i++) {
    const [hi, chi] = ALT_STOPS[i];
    if (ft <= hi) {
      const [lo, clo] = ALT_STOPS[i - 1];
      const t = (ft - lo) / (hi - lo || 1);
      return [0, 1, 2].map((k) => Math.round(clo[k] + (chi[k] - clo[k]) * t)) as [number, number, number];
    }
  }
  return ALT_STOPS[ALT_STOPS.length - 1][1];
}

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
  { id: 'chokepoints', label: 'Maritime chokepoints', color: [96, 165, 250], hex: '#60a5fa' },
  { id: 'tankers', label: 'Tankers (AIS)', color: [0, 209, 255], hex: '#00d1ff' },
  { id: 'events', label: 'Natural hazards', color: [167, 139, 250], hex: '#a78bfa' },
  { id: 'disasters', label: 'Global disasters', color: [234, 179, 8], hex: '#eab308' },
  { id: 'storms', label: 'Tropical cyclones', color: [45, 212, 191], hex: '#2dd4bf' },
  { id: 'weather', label: 'Weather alerts', color: [34, 211, 238], hex: '#22d3ee' },
  { id: 'fires', label: 'Wildfire hotspots', color: [251, 146, 60], hex: '#fb923c' },
  { id: 'quakes', label: 'Seismicity', color: [56, 189, 248], hex: '#38bdf8' },
  { id: 'cyber', label: 'Cyber', color: [232, 121, 249], hex: '#e879f9' },
  { id: 'acled', label: 'Conflict events (ACLED)', color: [220, 38, 38], hex: '#dc2626' },
  { id: 'conflict', label: 'Conflict (news)', color: [239, 68, 68], hex: '#ef4444' },
  { id: 'incidents', label: 'Energy incidents', color: [249, 115, 22], hex: '#f97316' },
];

// Curated bypass routes drawn when a chokepoint is disrupted — the real-world
// alternatives shippers take. Great-circle arcs (source → target).
export const BYPASS_ROUTES: Array<{ label: string; from: [number, number]; to: [number, number] }> = [
  { label: 'Suez → Cape of Good Hope', from: [32.35, 30.6], to: [20.0, -34.8] },
  { label: 'Bab-el-Mandeb → Cape of Good Hope', from: [43.3, 12.6], to: [20.0, -34.8] },
  { label: 'Panama → Strait of Magellan', from: [-79.5, 9.0], to: [-70.5, -53.5] },
  { label: 'Bosphorus → (no bypass)', from: [29.0, 41.1], to: [29.0, 41.1] },
];

/** Keep items with no timestamp (reference data) or within the time window. */
export function withinWindow(items: GeoItem[], sinceMs: number): GeoItem[] {
  if (!sinceMs) return items;
  return items.filter((d) => !d.ts || d.ts >= sinceMs);
}

const hexOf = (id: LayerId) => LAYER_STYLES.find((s) => s.id === id)!.color;
const WEATHER_HEX = hexOf('weather');
const STORM_HEX = hexOf('storms');

const onPolyClick = (onPick: (item: GeoItem) => void) => (info: { object?: unknown }) => {
  const f = info.object as { properties?: { item?: GeoItem } } | undefined;
  if (f?.properties?.item) onPick(f.properties.item);
};

// NWS alert areas, drawn as filled polygons beneath every point layer so the
// dots stay legible on top. Cyan to match the weather layer's swatch.
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
    getLineWidth: 1.4,
    getLineColor: [...WEATHER_HEX, 235] as [number, number, number, number],
    getFillColor: [...WEATHER_HEX, 70] as [number, number, number, number],
    onClick: onPolyClick(onPick),
  });
}

// A rough geodesic circle (ring of [lon,lat]) — longitude spacing widened by
// 1/cos(lat) so the ring stays circular on the map away from the equator.
function circleRing(lon: number, lat: number, radiusKm: number, steps = 48): number[][] {
  const latR = radiusKm / 111; // ~111 km per degree latitude
  const lonR = radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const ring: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([lon + lonR * Math.cos(a), lat + latR * Math.sin(a)]);
  }
  return ring;
}

// Generated impact rings around active cyclones. NOT the official NHC forecast
// cone (that's published only as shapefiles/KMZ) — this is a wind-field footprint
// derived from the storm's real intensity, so it reads at a glance how large and
// strong each system is. Radius scales with sustained wind (kt).
function stormRingLayer(
  data: LayerData,
  visible: Record<LayerId, boolean>,
  onPick: (item: GeoItem) => void,
  sinceMs: number,
): Layer | null {
  const storms = withinWindow(data.storms ?? [], sinceMs);
  if (!visible.storms || storms.length === 0) return null;
  const features = storms.map((d) => {
    const kt = Number(d.meta?.intensity);
    const wind = Number.isFinite(kt) && kt > 0 ? kt : d.severity * 25;
    const radiusKm = 90 + wind * 3.2; // 35kt TS ≈ 200km · 130kt cat-4 ≈ 510km
    return {
      type: 'Feature' as const,
      geometry: { type: 'Polygon' as const, coordinates: [circleRing(d.lon, d.lat, radiusKm)] },
      properties: { item: d },
    };
  });
  const fc = { type: 'FeatureCollection', features } as any;
  return new GeoJsonLayer({
    id: 'storm-rings',
    data: fc,
    pickable: true,
    stroked: true,
    filled: true,
    lineWidthUnits: 'pixels',
    getLineWidth: 1.2,
    getLineColor: [...STORM_HEX, 170] as [number, number, number, number],
    getFillColor: [...STORM_HEX, 18] as [number, number, number, number],
    onClick: onPolyClick(onPick),
  });
}

// Curated maritime bypass arcs — alternatives around key chokepoints. Shown with
// the chokepoints layer so the "what if this strait closes" routes are visible.
const CHOKE_HEX = hexOf('chokepoints');
function bypassArcLayer(visible: Record<LayerId, boolean>): Layer | null {
  if (!visible.chokepoints) return null;
  const routes = BYPASS_ROUTES.filter((r) => r.from[0] !== r.to[0] || r.from[1] !== r.to[1]);
  return new ArcLayer<{ from: [number, number]; to: [number, number]; label: string }>({
    id: 'bypass-arcs',
    data: routes,
    greatCircle: true,
    getSourcePosition: (d) => d.from,
    getTargetPosition: (d) => d.to,
    getSourceColor: [...CHOKE_HEX, 90] as [number, number, number, number],
    getTargetColor: [96, 200, 140, 150],
    getWidth: 1.6,
    widthUnits: 'pixels',
    pickable: false,
  });
}

// Live tankers/vessels at chokepoints — amber = anchored/loading, cyan = underway;
// unclassified vessels in the same waters render faint grey.
function tankersLayer(
  data: LayerData,
  visible: Record<LayerId, boolean>,
  onPick: (item: GeoItem) => void,
  sinceMs: number,
): Layer | null {
  const tankers = withinWindow(data.tankers ?? [], sinceMs);
  if (!visible.tankers || tankers.length === 0) return null;
  return new ScatterplotLayer<GeoItem>({
    id: 'tankers',
    data: tankers,
    pickable: true,
    radiusUnits: 'pixels',
    radiusMinPixels: 2,
    radiusMaxPixels: 7,
    stroked: true,
    lineWidthUnits: 'pixels',
    getLineWidth: 0.8,
    getLineColor: [10, 14, 20, 180],
    getPosition: (d) => [d.lon, d.lat],
    getRadius: (d) => (d.meta?.tanker ? 5 : 3),
    getFillColor: (d) => {
      if (!d.meta?.tanker) return [148, 163, 184, 150];
      return d.meta?.anchored ? [255, 183, 3, 235] : [0, 209, 255, 235];
    },
    onClick: (info) => {
      if (info.object) onPick(info.object as GeoItem);
    },
  });
}

// Live aircraft as rotated, altitude-colored plane icons (deck IconLayer),
// clamped in pixels so they stay crisp at every zoom.
function flightsIconLayer(
  data: LayerData,
  visible: Record<LayerId, boolean>,
  onPick: (item: GeoItem) => void,
  sinceMs: number,
): Layer | null {
  const flights = withinWindow(data.flights ?? [], sinceMs);
  if (!visible.flights || flights.length === 0) return null;
  return new IconLayer<GeoItem>({
    id: 'flights',
    data: flights,
    pickable: true,
    getPosition: (d) => [d.lon, d.lat],
    getIcon: () => 'plane',
    iconAtlas: PLANE_ICON,
    iconMapping: { plane: { x: 0, y: 0, width: 32, height: 32, mask: true } },
    getSize: 17,
    sizeUnits: 'pixels',
    sizeMinPixels: 9,
    sizeMaxPixels: 22,
    billboard: false,
    getAngle: (d) => -(Number(d.meta?.trackDeg) || 0), // deck rotates CCW; compass is CW
    getColor: (d) => [...altitudeToColor((Number(d.meta?.altM) || 0) * 3.281), 225] as [number, number, number, number],
    onClick: (info) => {
      if (info.object) onPick(info.object as GeoItem);
    },
  });
}

// Day/night terminator — the night hemisphere as a translucent polygon, computed
// client-side from the sun's subsolar point (no API). Purely cosmetic "live world"
// depth; drawn at the very bottom so nothing else is dimmed illegibly.
function dayNightLayer(nowMs: number): Layer {
  const ring = nightPolygon(nowMs);
  return new PolygonLayer<{ polygon: number[][] }>({
    id: 'day-night',
    data: [{ polygon: ring }],
    getPolygon: (d) => d.polygon,
    getFillColor: [4, 8, 16, 96],
    getLineColor: [40, 60, 90, 120],
    lineWidthUnits: 'pixels',
    getLineWidth: 0.8,
    stroked: true,
    filled: true,
    pickable: false,
  });
}

// Ring of [lon,lat] enclosing the night side. Uses the standard subsolar-point
// approximation (declination + equation-of-time-free hour angle) — accurate to a
// degree or so, which is plenty for a shading overlay.
function nightPolygon(nowMs: number): number[][] {
  const d = new Date(nowMs);
  const rad = Math.PI / 180;
  // Days since J2000 and solar declination.
  const jd = nowMs / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const decl = Math.asin(Math.sin(23.44 * rad) * Math.sin(lambda)); // sun declination (rad)
  // Subsolar longitude from UTC time.
  const utcHours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const subsolarLon = -15 * (utcHours - 12);
  // Terminator latitude as a function of longitude.
  const top: number[][] = [];
  const bottom: number[][] = [];
  for (let lon = -180; lon <= 180; lon += 3) {
    const H = (lon - subsolarLon) * rad;
    const lat = Math.atan(-Math.cos(H) / Math.tan(decl)) / rad;
    top.push([lon, lat]);
  }
  // Close the polygon over whichever pole is in darkness.
  const poleLat = decl > 0 ? -90 : 90;
  for (let lon = 180; lon >= -180; lon -= 3) bottom.push([lon, poleLat]);
  return [...top, ...bottom];
}

// Schematic pipeline routes, colored by status (toggled from the map bar).
function pipelinesLayer(lines: PipelineLine[]): Layer {
  return new PathLayer<PipelineLine>({
    id: 'pipelines',
    data: lines,
    getPath: (d) => d.path as unknown as [number, number][],
    getColor: (d) => [...(PIPE_COLOR[d.status] ?? [148, 163, 184]), 210] as [number, number, number, number],
    getWidth: 2,
    widthUnits: 'pixels',
    widthMinPixels: 1.5,
    capRounded: true,
    jointRounded: true,
    pickable: false,
  });
}

// Submarine cables as thin reference lines (toggled from the map bar).
function cablesLayer(cables: CableLine[]): Layer {
  return new PathLayer<CableLine>({
    id: 'cables',
    data: cables,
    getPath: (d) => d.path as unknown as [number, number][],
    getColor: [90, 130, 170, 120],
    getWidth: 1,
    widthUnits: 'pixels',
    widthMinPixels: 1,
    pickable: false,
  });
}

// Breathing halo behind the highest-severity events — the "something's happening"
// cue. An outlined-only ScatterplotLayer whose radiusScale is animated each tick.
function pulseLayer(
  data: LayerData,
  visible: Record<LayerId, boolean>,
  sinceMs: number,
  pulseT: number,
): Layer | null {
  const hot: GeoItem[] = [];
  for (const s of LAYER_STYLES) {
    if (!visible[s.id] || s.id === 'flights' || s.id === 'tankers') continue;
    for (const d of withinWindow(data[s.id] ?? [], sinceMs)) if (d.severity >= 6) hot.push(d);
  }
  if (hot.length === 0) return null;
  const scale = 1 + 0.9 * (0.5 + 0.5 * Math.sin(pulseT / 350));
  return new ScatterplotLayer<GeoItem>({
    id: 'pulse',
    data: hot,
    radiusUnits: 'pixels',
    getPosition: (d) => [d.lon, d.lat],
    getRadius: (d) => severityRadius(d.severity) + 4,
    radiusScale: scale,
    radiusMinPixels: 7,
    stroked: true,
    filled: false,
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: 1.5,
    getLineColor: [255, 70, 70, 150],
    pickable: false,
  });
}

export interface BuildOpts {
  sinceMs?: number;
  dayNight?: boolean;
  nowMs?: number;
  cables?: CableLine[];
  pipelines?: PipelineLine[];
  pulseT?: number;
}

export function buildLayers(
  data: LayerData,
  visible: Record<LayerId, boolean>,
  onPick: (item: GeoItem) => void,
  opts: BuildOpts = {},
): Layer[] {
  const { sinceMs = 0, dayNight = false, nowMs = 0, cables, pipelines, pulseT = 0 } = opts;
  const base: Array<Layer | null> = [
    dayNight ? dayNightLayer(nowMs) : null,
    cables && cables.length ? cablesLayer(cables) : null,
    pipelines && pipelines.length ? pipelinesLayer(pipelines) : null,
    bypassArcLayer(visible),
    pulseLayer(data, visible, sinceMs, pulseT),
    stormRingLayer(data, visible, onPick, sinceMs),
    weatherPolygonLayer(data, visible, onPick, sinceMs),
  ];
  // Flights are icons, not dots; the rest are pixel-clamped scatter markers so
  // they stay small and crisp (no ballooning "big circles") at any zoom.
  const points = LAYER_STYLES.filter((s) => s.id !== 'flights' && s.id !== 'tankers').map(
    (s) =>
      new ScatterplotLayer<GeoItem>({
        id: s.id,
        data: withinWindow(data[s.id] ?? [], sinceMs),
        visible: visible[s.id],
        pickable: true,
        radiusUnits: 'pixels',
        radiusMinPixels: 3,
        radiusMaxPixels: s.id === 'quakes' ? 13 : 11,
        stroked: true,
        lineWidthUnits: 'pixels',
        getLineWidth: 1,
        getLineColor: [10, 14, 20, 210],
        opacity: 0.9,
        getPosition: (d: GeoItem) => [d.lon, d.lat],
        getRadius: (d: GeoItem) => severityRadius(d.severity),
        getFillColor: [...s.color, 220] as [number, number, number, number],
        onClick: (info) => {
          if (info.object) onPick(info.object as GeoItem);
        },
      }),
  );
  const tankers = tankersLayer(data, visible, onPick, sinceMs);
  const flights = flightsIconLayer(data, visible, onPick, sinceMs);
  // Bottom → top: terminator, area polygons, scatter markers, tankers, aircraft.
  return [...base, ...points, tankers, flights].filter((l): l is Layer => l != null);
}
