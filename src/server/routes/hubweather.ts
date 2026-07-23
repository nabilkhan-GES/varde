// Live weather at major energy demand/supply hubs — Open-Meteo (keyless). One
// multi-location call returns current temperature, today's max/min and wind; the
// panel flags heat/cold that drives power & gas demand. Not a rigorous climate
// anomaly — it's live conditions at the points that move energy markets.
import { cached, fetchJson } from '../util';
import type { HubWeather, HubWeatherResult } from '../../types';

const HUBS: Array<{ name: string; region: string; lat: number; lon: number }> = [
  { name: 'Houston', region: 'US Gulf', lat: 29.76, lon: -95.37 },
  { name: 'Cushing', region: 'US Midcon', lat: 35.98, lon: -96.77 },
  { name: 'Chicago', region: 'US Midwest', lat: 41.88, lon: -87.63 },
  { name: 'New York', region: 'US Northeast', lat: 40.71, lon: -74.01 },
  { name: 'Los Angeles', region: 'US West', lat: 34.05, lon: -118.24 },
  { name: 'London', region: 'UK', lat: 51.51, lon: -0.13 },
  { name: 'Rotterdam', region: 'NW Europe', lat: 51.92, lon: 4.48 },
  { name: 'Frankfurt', region: 'C Europe', lat: 50.11, lon: 8.68 },
  { name: 'Tokyo', region: 'Japan', lat: 35.68, lon: 139.69 },
  { name: 'Singapore', region: 'SE Asia', lat: 1.35, lon: 103.82 },
  { name: 'Dubai', region: 'Gulf', lat: 25.2, lon: 55.27 },
  { name: 'Riyadh', region: 'Saudi', lat: 24.71, lon: 46.68 },
];

export async function handler(): Promise<HubWeatherResult> {
  return cached('hubweather', 60 * 60 * 1000, async () => {
    const lats = HUBS.map((h) => h.lat).join(',');
    const lons = HUBS.map((h) => h.lon).join(',');
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
      `&current=temperature_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min` +
      `&forecast_days=1&timezone=auto`;
    const res = await fetchJson<any>(url, 15000);
    const arr = Array.isArray(res) ? res : [res];
    const hubs: HubWeather[] = HUBS.map((h, i) => {
      const r = arr[i] ?? {};
      return {
        name: h.name,
        region: h.region,
        tempC: num(r?.current?.temperature_2m),
        maxC: num(r?.daily?.temperature_2m_max?.[0]),
        minC: num(r?.daily?.temperature_2m_min?.[0]),
        windKph: num(r?.current?.wind_speed_10m),
      };
    });
    return { hubs };
  });
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
