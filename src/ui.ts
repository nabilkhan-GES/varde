import { severityColor } from './severity';
import { LAYER_STYLES } from './layers';
import type {
  CrisisRow,
  EnergyResult,
  GeoItem,
  InventoriesResult,
  InventorySeries,
  LayerId,
  PipelineRow,
  Quote,
  StorageRow,
  TrackersResult,
} from './types';

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
  flights: 'Live aircraft worldwide (OpenSky) — icons rotated by heading, colored by altitude.',
  classvi: 'Class VI CO₂ sequestration permits (curated snapshot).',
};

// ── Command bar ────────────────────────────────────────
export function renderCommandBar(el: HTMLElement, onRefresh: () => void) {
  const base = import.meta.env.BASE_URL;
  el.innerHTML = `
    <div class="cb-brand"><img class="cb-logo" src="${base}gunnar-logo.png" alt="Gunnar Energy Services" /><span class="v">energy monitor</span></div>
    <span class="cb-badge cb-defcon" data-defcon title="Composite threat level from live signal & hazards">DEFCON <b data-lvl>—</b> <span data-pct></span></span>
    <span class="cb-badge cb-status" data-status>Signal —</span>
    <div class="cb-spacer"></div>
    <span class="cb-live" data-live><span class="dot"></span><span data-updated>connecting…</span></span>
    <button class="cb-btn" data-refresh>↻ Refresh</button>`;
  el.querySelector('[data-refresh]')!.addEventListener('click', onRefresh);
  const live = el.querySelector('[data-live]') as HTMLElement;
  const updated = el.querySelector('[data-updated]') as HTMLElement;
  const status = el.querySelector('[data-status]') as HTMLElement;
  const defcon = el.querySelector('[data-defcon]') as HTMLElement;
  const lvl = el.querySelector('[data-lvl]') as HTMLElement;
  const pct = el.querySelector('[data-pct]') as HTMLElement;
  return {
    setLive(ts: number) {
      updated.textContent = `updated ${new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      live.classList.remove('stale');
    },
    setStale() { live.classList.add('stale'); updated.textContent = 'refreshing…'; },
    setDefcon(level: number, percent: number) {
      lvl.textContent = String(level);
      pct.textContent = `${percent}%`;
      defcon.dataset.lvl = String(level);
    },
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

export interface MapBarHandlers {
  onRange: (ms: number) => void;
  onRadar: (on: boolean) => void;
  onDayNight: (on: boolean) => void;
  defaultRange?: number;
}

export function renderMapBar(el: HTMLElement, h: MapBarHandlers) {
  const defaultRange = h.defaultRange ?? 0;
  el.innerHTML = `
    <span class="title">Global Situation</span>
    <span class="clock" data-clock>—</span>
    <div class="spacer"></div>
    <button class="tgl" data-radar>◊ Radar</button>
    <button class="tgl" data-daynight>☾ Day/Night</button>
    <div class="seg" data-range>${RANGES.map(([l, ms]) => `<button data-ms="${ms}" class="${ms === defaultRange ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const clock = el.querySelector('[data-clock]') as HTMLElement;
  el.querySelectorAll<HTMLElement>('[data-range] button').forEach((b) =>
    b.addEventListener('click', () => {
      el.querySelectorAll('[data-range] button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      h.onRange(Number(b.dataset.ms));
    }),
  );
  const toggle = (sel: string, cb: (on: boolean) => void) => {
    const b = el.querySelector<HTMLElement>(sel)!;
    b.addEventListener('click', () => {
      const on = !b.classList.contains('on');
      b.classList.toggle('on', on);
      cb(on);
    });
  };
  toggle('[data-radar]', h.onRadar);
  toggle('[data-daynight]', h.onDayNight);
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
// Dense, columnar table row: severity bar · event (+ place) · type · sev · age.
function rowHtml(it: GeoItem, i: number): string {
  return `
    <div class="trow" data-i="${i}">
      <span class="tbar" style="background:${rgb(severityColor(it.severity))}"></span>
      <div class="tmain">
        <div class="tt">${esc(it.title)}</div>
        ${it.place ? `<div class="tsub">${esc(String(it.place))}</div>` : ''}
      </div>
      <span class="ttype">${esc(it.layer)}</span>
      <span class="tsev">${it.severity.toFixed(1)}</span>
      <span class="tage">${it.ts ? ago(it.ts) : '—'}</span>
    </div>`;
}

const TABLE_HEAD = `<div class="thead"><span></span><span>Event</span><span>Type</span><span>Sev</span><span>Age</span></div>`;

export function renderCards(el: HTMLElement, onSelect: (item: GeoItem) => void) {
  el.innerHTML = `
    <div class="card wide" data-card="markets"><div class="card-h"><span class="t">Markets · Live Tape</span><span class="n" data-n></span></div><div class="card-b" data-b></div></div>
    <div class="card" data-card="energy"><div class="card-h"><span class="t">Energy Complex</span><span class="q" title="Live prices are real; inventories require a free EIA_API_KEY">ⓘ</span></div><div class="card-b pad" data-b></div></div>
    <div class="card" data-card="inventories"><div class="card-h"><span class="t">Oil Inventories</span><span class="q" title="EIA weekly stocks — commercial crude, SPR, total oil & Lower-48 nat-gas working storage">ⓘ</span><span class="n" data-n></span></div><div class="card-b pad" data-b></div></div>
    <div class="card" data-card="signal"><div class="card-h"><span class="t">Signal · Incidents / Conflict / Cyber</span><span class="n" data-n>0</span></div><div class="card-b" data-b></div></div>
    <div class="card" data-card="hazards"><div class="card-h"><span class="t">Hazards & Disasters</span><span class="n" data-n>0</span></div><div class="card-b" data-b></div></div>
    <div class="card" data-card="classvi"><div class="card-h"><span class="t">Class VI · CCUS Tracker</span><span class="n" data-n>0</span></div><div class="card-b" data-b></div></div>
    <div class="card" data-card="pipelines"><div class="card-h"><span class="t">Oil &amp; Gas Pipeline Status</span><span class="n" data-n></span></div><div class="card-b" data-b></div></div>
    <div class="card" data-card="storage"><div class="card-h"><span class="t">Strategic Storage Atlas</span><span class="n" data-n></span></div><div class="card-b" data-b></div></div>
    <div class="card" data-card="crisis"><div class="card-h"><span class="t">Energy Crisis Registry</span><span class="n" data-n></span></div><div class="card-b" data-b></div></div>`;

  const body = (card: string) => el.querySelector(`[data-card="${card}"] [data-b]`) as HTMLElement;
  const num = (card: string) => el.querySelector(`[data-card="${card}"] [data-n]`) as HTMLElement;

  const bindRows = (container: HTMLElement, items: GeoItem[]) => {
    container.querySelectorAll<HTMLElement>('[data-i]').forEach((node) =>
      node.addEventListener('click', () => onSelect(items[Number(node.dataset.i)])),
    );
  };

  const drill = (card: string, items: GeoItem[]) => {
    num(card).textContent = String(items.length);
    const b = body(card);
    b.innerHTML = items.length
      ? TABLE_HEAD + items.map((it, i) => rowHtml(it, i)).join('')
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
    setTrackers(t?: TrackersResult | null) {
      const cap = (c: number | null, u: string) => (c != null ? `${c.toLocaleString()} ${esc(u)}` : '—');
      const stat = (s: string) => `<span class="st ${statusClass(s)}">${esc(s)}</span>`;

      // Oil & gas pipeline status
      const pipes = t?.pipelines ?? [];
      num('pipelines').textContent = pipes.length ? String(pipes.length) : '';
      body('pipelines').innerHTML = pipes.length
        ? `<div class="trk trk-pipe"><div class="trk-h"><span>Asset</span><span>Route</span><span>Capacity</span><span>Status</span></div>` +
          pipes
            .map(
              (p: PipelineRow) => `<div class="trk-r" title="${esc(p.note ?? p.operator ?? '')}">
                <span class="trk-nm">${esc(p.name)}</span>
                <span class="trk-sub">${esc(p.from)} → ${esc(p.to)}</span>
                <span class="trk-cap">${cap(p.capacity, p.unit)}</span>
                ${stat(p.status)}</div>`,
            )
            .join('') +
          `</div>`
        : `<div class="empty">—</div>`;

      // Strategic storage atlas
      const stg = t?.storage ?? [];
      num('storage').textContent = stg.length ? String(stg.length) : '';
      body('storage').innerHTML = stg.length
        ? `<div class="trk trk-store"><div class="trk-h"><span>Facility</span><span>Country · Type</span><span>Capacity</span><span>Status</span></div>` +
          stg
            .map(
              (s: StorageRow) => `<div class="trk-r" title="${esc(s.note ?? s.operator ?? '')}">
                <span class="trk-nm">${esc(s.name)}</span>
                <span class="trk-sub">${esc(s.country)} · ${esc(s.type)}</span>
                <span class="trk-cap">${cap(s.capacity, s.unit)}</span>
                ${stat(s.status)}</div>`,
            )
            .join('') +
          `</div>`
        : `<div class="empty">—</div>`;

      // Energy crisis registry
      const cr = t?.crisis ?? [];
      num('crisis').textContent = cr.length ? String(cr.length) : '';
      body('crisis').innerHTML = cr.length
        ? `<div class="trk trk-crisis"><div class="trk-h"><span>Country</span><span>Product</span><span>Since</span><span>Severity</span></div>` +
          cr
            .map(
              (c: CrisisRow) => `<div class="trk-r" title="${esc(c.note ?? '')}">
                <span class="trk-nm">${esc(c.country)}</span>
                <span class="trk-sub">${esc(c.product)}</span>
                <span class="trk-cap">${esc(c.since)}</span>
                <span class="st ${crisisClass(c.severity)}">${esc(c.severity)}</span></div>`,
            )
            .join('') +
          (t?.note ? `<div class="note">${esc(t.note)}</div>` : '') +
          `</div>`
        : `<div class="empty">—</div>`;
    },
  };
}

// Status → semantic color class (green ok · amber warn · red bad · dim).
function statusClass(s: string): string {
  const v = s.toLowerCase();
  if (v === 'operating' || v === 'active') return 'ok';
  if (v === 'reduced' || v === 'idle') return 'warn';
  if (v === 'offline' || v === 'closed') return 'bad';
  return 'dim';
}
function crisisClass(s: string): string {
  const v = s.toLowerCase();
  if (v === 'high') return 'bad';
  if (v === 'medium') return 'warn';
  return 'dim';
}
