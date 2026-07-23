// Renewable electricity share — World Bank (keyless). % of electricity output from
// renewables, world + major economies (latest available year). Structural energy
// context; slow-moving but shapes the demand backdrop.
import { cached, fetchJson } from '../util';
import type { RenewablesResult } from '../../types';

const IND = 'EG.ELC.RNEW.ZS';
const COUNTRIES = 'WLD;USA;CHN;IND;DEU;GBR;BRA;NOR;FRA;JPN;RUS;SAU';
const NAME: Record<string, string> = {
  WLD: 'World', USA: 'United States', CHN: 'China', IND: 'India', DEU: 'Germany',
  GBR: 'United Kingdom', BRA: 'Brazil', NOR: 'Norway', FRA: 'France', JPN: 'Japan',
  RUS: 'Russia', SAU: 'Saudi Arabia',
};

export async function handler(): Promise<RenewablesResult> {
  return cached('renewables', 24 * 60 * 60 * 1000, async () => {
    const url = `https://api.worldbank.org/v2/country/${COUNTRIES}/indicator/${IND}?format=json&per_page=400&mrnev=1`;
    const j = await fetchJson<any[]>(url, 15000);
    const rows: any[] = Array.isArray(j) && j.length > 1 ? j[1] : [];
    let world: number | null = null;
    let asOf: string | undefined;
    const countries: Array<{ name: string; pct: number }> = [];
    for (const r of rows) {
      const pct = Number(r.value);
      if (!Number.isFinite(pct)) continue;
      const iso = String(r.countryiso3code || r.country?.id || '');
      if (r.date > (asOf ?? '')) asOf = String(r.date);
      if (iso === 'WLD' || iso === '1W') {
        world = Math.round(pct * 10) / 10;
      } else {
        countries.push({ name: NAME[iso] || String(r.country?.value || iso), pct: Math.round(pct * 10) / 10 });
      }
    }
    countries.sort((a, b) => b.pct - a.pct);
    return { asOf, world, countries };
  });
}
