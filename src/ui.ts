import { severityColor } from './severity';
import { LAYER_STYLES } from './layers';
import type { EnergyResult, GeoItem, InventoriesResult, InventorySeries, LayerId, Quote } from './types';

const rgb = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m] as string));

function ago(ts?: number): string {
  if (!ts) return '';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

function sparkSVG(vals: number[], w = 150, h = 26): string {
  if (!vals || vals.length < 2) return '';
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const rng = max - min || 1;
  const pts = vals
    .map((v, i) => `${((i / (vals.length - 1)) * w).toFixed(1)},${(h - ((v - min) / rng) * (h - 4) - 2).toFixed(1)}`)
    .join(' ');
  const col = vals[vals.length - 1] >= vals[0] ? 'var(--up)' : 'var(--down)';
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.4"/></svg>`;
}

// Filled area chart (line + translucent fill) for inventory time-series.
function areaSVG(vals: number[], color: string, w = 268, h = 46): string {
  if (!vals || vals.length < 2) return '<div class="chart-empty">no data</div>';
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const rng = max - min || 1;
  const x = (i: number) => ((i / (vals.length - 1)) * w).toFixed(1);
  const y = (v: number) => (h - ((v - min) / rng) * (h - 6) - 3).toFixed(1);
  const line = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const area = `0,${h} ${line} ${w},${h}`;
  return `<svg class="area" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polygon points="${area}" fill="${color}" fill-opacity="0.12"/>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="1.5"/>
  </svg>`;
}

const LAYER_INFO: Record<LayerId, string> = {
  incidents: 'Oil & gas incidents from global news, geolocated.',
  conflict: 'Conflict / geopolitics affecting energy & infrastructure.',
  cyber: 'Cyber incidents on grids, pipelines and utilities.',
  quakes: 'Earthquakes M2.5+ in the past day (USGS).',
  events: 'Open natural-hazard events (NASA EONET).',
  disasters: 'Global disaster alerts with alert levels (GDACS).',
  storms: 'Active tropical cyclones (NOAA NHC).',
  weather: 'Active US weather alerts (NWS).',
  flights: 'Live aircraft over the Gulf / US energy corridor (OpenSky).',
  classvi: 'Class VI CO₂ sequestration permits (curated snapshot).',
};

// ── Command bar ────────────────────────────────────────
export function renderCommandBar(el: HTMLElement, onRefresh: () => void) {
  el.innerHTML = `
    <div class="cb-brand"><b>VARDE</b><span class="v">v0.2 · energy monitor</span></div>
    <span class="cb-badge energy"><span class="dot"></span>Energy</span>
    <span class="cb-badge cb-status" data-status>Signal —</span>
    <div class="cb-spacer"></div>
    <span class="cb-live" data-live><span class="dot"></span><span data-updated>connecting…</span></span>
    <button class="cb-btn" data-refresh>↻ Refresh</button>`;
  el.querySelector('[data-refresh]')!.addEventListener('click', onRefresh);
  const live = el.querySelector('[data-live]') as HTMLElement;
  const updated = el.querySelector('[data-updated]') as HTMLElement;
  const status = el.querySelector('[data-status]') as HTMLElement;
  return {
    setLive(ts: number) {
      updated.textContent = `updated ${new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      live.classList.remove('stale');
    },
    setStale() { live.classList.add('stale'); updated.textContent = 'refreshing…'; },
    setStatus(count: number, peak: number) {
      status.textContent = `Signal ${count} · peak ${peak ? peak.toFixed(1) : '—'}`;
      status.classList.toggle('hi', peak >= 6);
    },
  };
}

// ── Map bar (time range + 2D/3D) ───────────────────────
const RANGES: Array<[string, number]> = [
  ['1h', 3_600_000], ['6h', 21_600_000], ['24h', 86_400_000],
  ['48h', 172_800_000], ['7d', 604_800_000], ['All', 0],
];

export function renderMapBar(
  el: HTMLElement,
  onRange: (ms: number) => void,
  onDim: (d: '2d' | '3d') => void,
  defaultRange = 0,
) {
  el.innerHTML = `
    <span class="title">Global Situation</span>
    <span class="clock" data-clock>—</span>
    <div class="spacer"></div>
    <div class="seg" data-range>${RANGES.map(([l, ms]) => `<button data-ms="${ms}" class="${ms === defaultRange ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="seg" data-dim><button data-d="2d" class="on">2D</button><button data-d="3d">3D</button></div>`;
  const clock = el.querySelector('[data-clock]') as HTMLElement;
  el.querySelectorAll<HTMLElement>('[data-range] button').forEach((b) =>
    b.addEventListener('click', () => {
      el.querySelectorAll('[data-range] button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      onRange(Number(b.dataset.ms));
    }),
  );
  el.querySelectorAll<HTMLElement>('[data-dim] button').forEach((b) =>
    b.addEventListener('click', () => {
      el.querySelectorAll('[data-dim] button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      onDim(b.dataset.d as '2d' | '3d');
    }),
  );
  const tick = () => {
    clock.textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  };
  tick();
  setInterval(tick, 1000);
}

// ── Layer panel (searchable) ───────────────────────────
export function renderLayerPanel(
  el: HTMLElement,
  visible: Record<LayerId, boolean>,
  onToggle: (id: LayerId, on: boolean) => void,
) {
  el.innerHTML = `
    <div class="lp-head">
      <div class="t">Layers</div>
      <input class="lp-search" data-search placeholder="Search layers…" />
    </div>
    <div class="lp-list" data-list>${LAYER_STYLES.map(
      (s) => `
      <div class="lp-row ${visible[s.id] ? 'on' : ''}" data-id="${s.id}" data-label="${s.label.toLowerCase()}">
        <span class="cbx"></span>
        <span class="swatch" style="background:${s.hex}"></span>
        <span class="lbl">${s.label}</span>
        <span class="ct" data-ct="${s.id}">0</span>
        <span class="info" title="${esc(LAYER_INFO[s.id])}">ⓘ</span>
      </div>`,
    ).join('')}</div>
    <div class="lp-legend">Dot color = layer · size = severity</div>`;

  el.querySelectorAll<HTMLElement>('.lp-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('info')) return;
      const id = row.dataset.id as LayerId;
      const on = !row.classList.contains('on');
      row.classList.toggle('on', on);
      onToggle(id, on);
    });
  });
  const search = el.querySelector('[data-search]') as HTMLInputElement;
  search.addEventListener('input', () => {
    const q = search.value.toLowerCase();
    el.querySelectorAll<HTMLElement>('.lp-row').forEach((row) => {
      row.style.display = (row.dataset.label ?? '').includes(q) ? '' : 'none';
    });
  });
  return {
    setCounts(counts: Record<LayerId, number>) {
      (Object.keys(counts) as LayerId[]).forEach((id) => {
        const c = el.querySelector(`[data-ct="${id}"]`);
        if (c) c.textContent = String(counts[id]);
      });
    },
  };
}

// ── Right-side cards ───────────────────────────────────
function rowHtml(it: GeoItem, i: number): string {
  return `
    <div class="row" data-i="${i}">
      <div class="bar" style="background:${rgb(severityColor(it.severity))}"></div>
      <div>
        <div class="rt">${esc(it.title)}</div>
        <div class="rm">
          <span class="chip">${esc(it.layer)}</span>
          <span>sev ${it.severity.toFixed(1)}</span>
          ${it.place ? `<span>${esc(String(it.place))}</span>` : ''}
          ${it.ts ? `<span>${ago(it.ts)} ago</span>` : ''}
        </div>
      </div>
    </div>`;
}

export function renderCards(el: HTMLElement, onSelect: (item: GeoItem) => void) {
  el.innerHTML = `
    <div class="card" data-card="markets"><div class="card-h"><span class="t">Markets · Live Tape</span><span class="n" data-n></span></div><div class="card-b" data-b></div></div>
    <div class="card" data-card="energy"><div class="card-h"><span class="t">Energy Complex</span><span class="q" title="Live prices are real; inventories require a free EIA_API_KEY">ⓘ</span></div><div class="card-b pad" data-b></div></div>
    <div class="card" data-card="inventories"><div class="card-h"><span class="t">Oil Inventories</span><span class="q" title="EIA weekly stocks — commercial crude, SPR, total oil & Lower-48 nat-gas working storage">ⓘ</span><span class="n" data-n></span></div><div class="card-b pad" data-b></div></div>
    <div class="card" data-card="signal"><div class="card-h"><span class="t">Signal · Incidents / Conflict / Cyber</span><span class="n" data-n>0</span></div><div class="card-b" data-b></div></div>
    <div class="card" data-card="hazards"><div class="card-h"><span class="t">Hazards & Disasters</span><span class="n" data-n>0</span></div><div class="card-b" data-b></div></div>
    <div class="card" data-card="classvi"><div class="card-h"><span class="t">Class VI · CCUS Tracker</span><span class="n" data-n>0</span></div><div class="card-b" data-b></div></div>`;

  const body = (card: string) => el.querySelector(`[data-card="${card}"] [data-b]`) as HTMLElement;
  const num = (card: string) => el.querySelector(`[data-card="${card}"] [data-n]`) as HTMLElement;

  const bindRows = (container: HTMLElement, items: GeoItem[]) => {
    container.querySelectorAll<HTMLElement>('.row').forEach((node) =>
      node.addEventListener('click', () => onSelect(items[Number(node.dataset.i)])),
    );
  };

  const drill = (card: string, items: GeoItem[]) => {
    num(card).textContent = String(items.length);
    const b = body(card);
    b.innerHTML = items.length
      ? items.map((it, i) => rowHtml(it, i)).join('')
      : `<div class="empty">No items in range.</div>`;
    bindRows(b, items);
  };

  return {
    setSignal: (items: GeoItem[]) => drill('signal', items),
    setHazards: (items: GeoItem[]) => drill('hazards', items),
    setClassVI(wells: GeoItem[]) {
      num('classvi').textContent = String(wells.length);
      const b = body('classvi');
      b.innerHTML = wells.length
        ? wells
            .map(
              (w, i) => `
        <div class="row" data-i="${i}">
          <div class="bar" style="background:${rgb(severityColor(w.severity))}"></div>
          <div>
            <div class="rt">${esc(w.title)}</div>
            <div class="rm"><span class="chip">${esc(String(w.kind ?? ''))}</span><span>${esc(String(w.place ?? ''))}</span>${w.meta?.operator ? `<span>· ${esc(String(w.meta.operator))}</span>` : ''}</div>
          </div>
        </div>`,
            )
            .join('')
        : `<div class="empty">—</div>`;
      bindRows(b, wells);
    },
    setMarkets(quotes: Quote[]) {
      num('markets').textContent = String(quotes.length);
      body('markets').innerHTML = quotes
        .map((q) => {
          const up = q.changePct >= 0;
          return `<div class="mkrow">
            <span class="nm">${esc(q.name)}</span>
            ${sparkSVG(q.spark)}
            <span class="px">${q.price.toLocaleString()}</span>
            <span class="ch ${up ? 'up' : 'dn'}">${up ? '▲' : '▼'}${Math.abs(q.changePct).toFixed(2)}%</span>
          </div>`;
        })
        .join('');
    },
    setEnergy(quotes: Quote[], energy?: EnergyResult | null) {
      const byName = (n: string) => quotes.find((q) => q.name === n);
      const price = (label: string, q?: Quote) => `
        <div class="bigstat">
          <div class="l">${label}</div>
          <div class="v">${q ? q.price.toLocaleString() : '—'}</div>
          <div class="u">${q ? q.unit : ''}</div>
        </div>`;
      const eia = energy?.available ? energy.series : [];
      const fund = (label: string, key: string) => {
        const s = eia.find((x) => x.key === key);
        const has = !!s && s.value != null;
        const wow =
          s && s.changePct != null
            ? ` <span class="wow ${s.changePct >= 0 ? 'up' : 'dn'}">${s.changePct >= 0 ? '+' : ''}${s.changePct}% WoW</span>`
            : '';
        return `
        <div class="bigstat ${has ? '' : 'muted'}">
          <div class="l">${label}</div>
          <div class="v">${has ? Math.round(s!.value as number).toLocaleString() : '—'}${wow}</div>
          <div class="u">${has ? s!.unit : 'connect EIA'}</div>
        </div>`;
      };
      body('energy').innerHTML = `
        <div class="stat-grid">
          ${price('WTI Crude', byName('WTI Crude'))}
          ${price('Brent', byName('Brent'))}
          ${price('Henry Hub', byName('Nat Gas'))}
          ${fund('US Crude Stocks', 'crude')}
          ${fund('Nat Gas Storage', 'natgas')}
          ${fund('SPR Crude', 'spr')}
        </div>
        <div class="note">${
          energy?.available
            ? `EIA weekly · as of ${energy.asOf ?? '—'} · prices delayed`
            : `Prices live (delayed) · US inventories, storage & SPR appear when an <b>EIA_API_KEY</b> is set (free at eia.gov/opendata)`
        }</div>`;
    },
    setInventories(inv?: InventoriesResult | null) {
      const b = body('inventories');
      if (!inv?.available || !inv.series.length) {
        num('inventories').textContent = '';
        b.innerHTML = `<div class="note">US total oil stocks (commercial + SPR) and Lower-48 nat-gas working storage — weekly history — appear when an <b>EIA_API_KEY</b> is set (free at eia.gov/opendata).</div>`;
        return;
      }
      num('inventories').textContent = `${inv.series[0]?.points.length ?? 0}w`;
      const chartRow = (s: InventorySeries) => {
        const vals = s.points.map((p) => p.value);
        const up = (s.changePct ?? 0) >= 0;
        const wow =
          s.changePct != null
            ? `<span class="wow ${up ? 'up' : 'dn'}">${up ? '+' : ''}${s.changePct}% WoW</span>`
            : '';
        return `<div class="inv-row">
          <div class="inv-head">
            <span class="inv-l"><span class="inv-dot" style="background:${s.color}"></span>${esc(s.label)}</span>
            <span class="inv-v">${s.latest != null ? Math.round(s.latest).toLocaleString() : '—'} <span class="inv-u">${esc(s.unit)}</span> ${wow}</span>
          </div>
          ${areaSVG(vals, s.color)}
        </div>`;
      };
      b.innerHTML =
        inv.series.map(chartRow).join('') +
        `<div class="note">EIA weekly · as of ${inv.asOf ?? '—'} · commercial = crude excluding SPR</div>`;
    },
  };
}
