// Varde AIS relay — a tiny always-on service that holds a persistent AISStream
// WebSocket, accumulates vessel positions + static (ship-type) data over time,
// classifies tankers (IMO ship type 80–89), and serves the current snapshot at
// GET /tankers.json (CORS: *). Because it runs continuously, it catches each
// vessel's ~6-minute static broadcast, so classification is far denser than the
// one-shot sample the static snapshot build takes.
//
// Deploy anywhere that runs a long-lived process (Railway, Fly.io, Render, a VPS).
// Env: AISSTREAM_API_KEY (required), PORT (default 8080), VESSEL_TTL_MS (30 min).
import WebSocket from 'ws';
import http from 'node:http';

const API_KEY = process.env.AISSTREAM_API_KEY;
const PORT = Number(process.env.PORT) || 8080;
const TTL = Number(process.env.VESSEL_TTL_MS) || 30 * 60 * 1000;

if (!API_KEY) {
  console.error('AISSTREAM_API_KEY is required');
  process.exit(1);
}

// [ [south, west], [north, east] ] over tanker-dominated waters (matches the app).
const BOXES = [
  [[23.5, 53.5], [27.5, 57.5]], // Hormuz
  [[24.0, 56.0], [26.5, 58.5]], // Gulf of Oman / Fujairah
  [[11.0, 42.0], [16.5, 45.0]], // Bab-el-Mandeb
  [[27.5, 32.0], [30.5, 34.0]], // Suez
  [[0.0, 99.0], [6.5, 105.5]], // Malacca / Singapore
  [[25.5, 49.0], [28.5, 51.5]], // Persian Gulf / Ras Tanura
  [[25.5, -96.5], [30.0, -88.0]], // US Gulf
  [[50.5, 2.0], [53.5, 5.0]], // Rotterdam
];

const types = new Map(); // mmsi → ship type
const names = new Map(); // mmsi → name
const live = new Map(); // mmsi → { lat, lon, sog, cog, name, ts, seen }
const isTanker = (t) => t != null && t >= 80 && t <= 89;

function connect() {
  const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
  ws.on('open', () => {
    console.log('AISStream connected');
    ws.send(
      JSON.stringify({
        APIKey: API_KEY,
        BoundingBoxes: BOXES,
        FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
      }),
    );
  });
  ws.on('message', (raw) => {
    let msg;
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
        ts: meta.time_utc ? Date.parse(meta.time_utc) : Date.now(),
        seen: Date.now(),
      });
    }
  });
  ws.on('close', () => {
    console.warn('AISStream closed; reconnecting in 5s');
    setTimeout(connect, 5000);
  });
  ws.on('error', (e) => {
    console.error('AISStream error', e?.message || e);
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  });
}

function snapshot() {
  const now = Date.now();
  const tankers = [];
  for (const [mmsi, p] of live) {
    if (now - p.seen > TTL) {
      live.delete(mmsi);
      continue;
    }
    const type = types.get(mmsi);
    const tanker = isTanker(type);
    const anchored = p.sog < 0.5;
    tankers.push({
      id: `ais:${mmsi}`,
      layer: 'tankers',
      lon: p.lon,
      lat: p.lat,
      title: p.name || names.get(mmsi) || mmsi,
      place: anchored ? 'anchored / loading' : `${p.sog.toFixed(1)} kn`,
      ts: p.ts,
      severity: tanker ? 2 : 1.2,
      kind: tanker ? 'tanker' : 'vessel',
      meta: { sog: p.sog, cog: p.cog, shipType: type ?? null, tanker, anchored },
    });
  }
  tankers.sort((a, b) => Number(b.meta.tanker) - Number(a.meta.tanker));
  return { available: true, tankers };
}

http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url === '/health') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, vessels: live.size, classified: types.size }));
      return;
    }
    if (req.url === '/tankers.json') {
      res.setHeader('content-type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.end(JSON.stringify(snapshot()));
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  })
  .listen(PORT, () => console.log(`AIS relay on :${PORT} — /tankers.json /health`));

connect();
