// AIS vessel sampling — AISStream.io (free key, gated on AISSTREAM_API_KEY).
//
// AISStream is a persistent WebSocket, which neither GitHub Pages nor serverless
// functions can hold open. Instead of an always-on relay, we take a *timed sample*:
// open the socket, subscribe to bounding boxes over the major crude/product
// chokepoints & terminals, collect position + static messages for `durationMs`,
// then close and emit the latest position per vessel. Ship type 80–89 = tanker
// (IMO); vessels we can classify from ShipStaticData are flagged accordingly.
import WebSocket from 'ws';
import type { GeoItem } from '../types';

// [ [south, west], [north, east] ] boxes over tanker-dominated waters.
const BOXES: number[][][] = [
  [[23.5, 53.5], [27.5, 57.5]], // Strait of Hormuz
  [[24.0, 56.0], [26.5, 58.5]], // Gulf of Oman / Fujairah
  [[11.0, 42.0], [16.5, 45.0]], // Bab-el-Mandeb
  [[27.5, 32.0], [30.5, 34.0]], // Gulf of Suez / Suez Canal
  [[0.0, 99.0], [6.5, 105.5]], // Malacca / Singapore
  [[25.5, 49.0], [28.5, 51.5]], // Persian Gulf / Ras Tanura
  [[25.5, -96.5], [30.0, -88.0]], // US Gulf (Houston/Galveston/LOOP)
  [[50.5, 2.0], [53.5, 5.0]], // Rotterdam / North Sea
];

export interface AisOpts {
  apiKey: string;
  durationMs?: number;
  max?: number;
}

interface Live {
  lat: number;
  lon: number;
  sog: number; // speed over ground (kn)
  cog: number;
  name?: string;
  ts?: number;
}

export function sampleTankers({ apiKey, durationMs = 40000, max = 1000 }: AisOpts): Promise<GeoItem[]> {
  return new Promise((resolve) => {
    let done = false;
    const types = new Map<string, number>(); // MMSI → ship type (from static)
    const names = new Map<string, string>();
    const live = new Map<string, Live>();
    let ws: WebSocket;

    const finish = () => {
      if (done) return;
      done = true;
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      resolve(build(types, names, live, max));
    };

    const timer = setTimeout(finish, durationMs);

    try {
      ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
    } catch {
      clearTimeout(timer);
      resolve([]);
      return;
    }

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          APIKey: apiKey,
          BoundingBoxes: BOXES,
          FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
        }),
      );
    });

    ws.on('message', (raw: WebSocket.RawData) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const meta = msg?.MetaData ?? {};
      const mmsi = String(meta.MMSI ?? meta.mmsi ?? '');
      if (!mmsi) return;
      if (msg.MessageType === 'ShipStaticData') {
        const sd = msg.Message?.ShipStaticData ?? {};
        if (typeof sd.Type === 'number') types.set(mmsi, sd.Type);
        if (sd.Name) names.set(mmsi, String(sd.Name).trim());
      } else if (msg.MessageType === 'PositionReport') {
        const pr = msg.Message?.PositionReport ?? {};
        const lat = Number(pr.Latitude ?? meta.latitude);
        const lon = Number(pr.Longitude ?? meta.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        live.set(mmsi, {
          lat,
          lon,
          sog: Number(pr.Sog) || 0,
          cog: Number(pr.Cog) || 0,
          name: meta.ShipName ? String(meta.ShipName).trim() : undefined,
          ts: meta.time_utc ? Date.parse(meta.time_utc) : undefined,
        });
      }
    });

    ws.on('error', finish);
    ws.on('close', finish);
  });
}

const isTanker = (t?: number) => t != null && t >= 80 && t <= 89;

function build(
  types: Map<string, number>,
  names: Map<string, string>,
  live: Map<string, Live>,
  max: number,
): GeoItem[] {
  const items: GeoItem[] = [];
  for (const [mmsi, p] of live) {
    const type = types.get(mmsi);
    const tanker = isTanker(type);
    const name = p.name || names.get(mmsi) || mmsi;
    const anchored = p.sog < 0.5;
    items.push({
      id: `ais:${mmsi}`,
      layer: 'tankers',
      lon: p.lon,
      lat: p.lat,
      title: name,
      place: anchored ? 'anchored / loading' : `${p.sog.toFixed(1)} kn`,
      ts: p.ts,
      // Confirmed tankers rank above unclassified vessels in the same waters.
      severity: tanker ? 2 : 1.2,
      kind: tanker ? 'tanker' : 'vessel',
      meta: { sog: p.sog, cog: p.cog, shipType: type ?? null, tanker, anchored },
    });
  }
  // Tankers first, then by anchored (loading is the interesting signal).
  items.sort((a, b) => Number(b.meta?.tanker) - Number(a.meta?.tanker));
  return items.slice(0, max);
}
