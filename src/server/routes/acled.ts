// ACLED conflict events (battles, explosions, violence, riots, protests) — a
// direct energy-price driver when it hits producing regions or transit routes.
// Gated on ACLED credentials. Two ways to authenticate (see acleddata.com docs):
//   • ACLED_EMAIL + ACLED_PASSWORD  → we do the OAuth token exchange here, or
//   • ACLED_ACCESS_TOKEN            → a token you generated yourself.
// Without either, returns { available:false, events:[] } and the layer is empty.
import { cached, fetchJson } from '../util';
import type { AcledResult, GeoItem } from '../../types';

const EMAIL = process.env.ACLED_EMAIL;
const PASSWORD = process.env.ACLED_PASSWORD;
const TOKEN_ENV = process.env.ACLED_ACCESS_TOKEN;
const DAYS = 10;

const TYPE_SEV: Record<string, number> = {
  'Explosions/Remote violence': 3,
  Battles: 2.8,
  'Violence against civilians': 2.2,
  Riots: 1.6,
  Protests: 1.3,
  'Strategic developments': 1.2,
};

let cachedToken: string | null = null;
let tokenExp = 0;

async function getToken(): Promise<string | null> {
  if (TOKEN_ENV) return TOKEN_ENV;
  if (!EMAIL || !PASSWORD) return null;
  if (cachedToken && Date.now() < tokenExp) return cachedToken;
  try {
    const body = new URLSearchParams({
      username: EMAIL,
      password: PASSWORD,
      grant_type: 'password',
      client_id: 'acled',
    });
    const r = await fetch('https://acleddata.com/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    cachedToken = j.access_token ?? null;
    tokenExp = Date.now() + (Number(j.expires_in) || 3600) * 1000 - 60_000;
    return cachedToken;
  } catch {
    return null;
  }
}

export async function handler(): Promise<AcledResult> {
  if (!TOKEN_ENV && (!EMAIL || !PASSWORD)) return { available: false, events: [] };
  return cached('acled', 3 * 60 * 60 * 1000, async () => {
    const token = await getToken();
    if (!token) return { available: false, events: [] };
    const now = Date.now();
    const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const url =
      `https://acleddata.com/api/acled/read?_format=json&limit=800` +
      `&event_date=${fmt(now - DAYS * 86400000)}|${fmt(now)}&event_date_where=BETWEEN`;
    // Auth can succeed while the account isn't yet entitled to the data endpoint
    // ("Access denied"); degrade to empty rather than throwing on every refresh.
    let j: { data?: any[] };
    try {
      j = await fetchJson<{ data?: any[] }>(url, 20000, { Authorization: `Bearer ${token}` });
    } catch {
      return { available: false, events: [] };
    }
    const events: GeoItem[] = [];
    for (const e of j.data ?? []) {
      const lat = Number(e.latitude);
      const lon = Number(e.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const type = String(e.event_type ?? '');
      const fatalities = Number(e.fatalities) || 0;
      events.push({
        id: `acled:${e.event_id_cnty ?? `${e.event_date}:${lat},${lon}`}`,
        layer: 'acled',
        lon,
        lat,
        title: `${e.sub_event_type || type}${e.country ? ` — ${e.country}` : ''}`,
        place: e.country ? String(e.country) : undefined,
        ts: e.event_date ? Date.parse(e.event_date) : undefined,
        severity: Math.min(9, (TYPE_SEV[type] ?? 1.5) + Math.min(3, fatalities / 5)),
        kind: type,
        meta: { fatalities, actor: e.actor1, sub: e.sub_event_type },
      });
    }
    events.sort((a, b) => b.severity - a.severity || (b.ts ?? 0) - (a.ts ?? 0));
    return { available: true, events: events.slice(0, 800) };
  });
}
