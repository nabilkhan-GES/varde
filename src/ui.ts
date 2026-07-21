import { severityColor } from './severity';
import { LAYER_STYLES } from './layers';
import type { GeoItem, LayerId, Quote } from './types';

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

// ── Top bar ────────────────────────────────────────────
export function renderTopbar(el: HTMLElement, onRefresh: () => void) {
  el.innerHTML = `
    <div class="brand"><b>VARDE</b><span>energy situational awareness</span></div>
    <div class="topbar-spacer"></div>
    <div class="stat"><span class="k" data-tracked>—</span><span class="l">tracked</span></div>
    <div class="stat"><span class="k" data-max>—</span><span class="l">peak severity</span></div>
    <span class="live" data-live><span class="dot"></span><span data-updated>connecting…</span></span>
    <button class="btn" data-refresh>↻ Refresh</button>
  `;
  el.querySelector('[data-refresh]')!.addEventListener('click', onRefresh);
  const updated = el.querySelector('[data-updated]') as HTMLElement;
  const live = el.querySelector('[data-live]') as HTMLElement;
  const tracked = el.querySelector('[data-tracked]') as HTMLElement;
  const max = el.querySelector('[data-max]') as HTMLElement;
  return {
    setUpdated(ts: number) {
      updated.textContent = `updated ${new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      live.classList.remove('stale');
    },
    setStale() { live.classList.add('stale'); updated.textContent = 'refreshing…'; },
    setStats(count: number, peak: number) { tracked.textContent = String(count); max.textContent = peak ? peak.toFixed(1) : '—'; },
  };
}

// ── Radar (merged, severity-sorted feed) ───────────────
export function renderRadar(el: HTMLElement, onSelect: (item: GeoItem) => void) {
  el.innerHTML = `
    <div class="radar-head"><span class="t">Radar</span><span class="n" data-count>0</span></div>
    <div class="radar-list" data-list></div>`;
  const list = el.querySelector('[data-list]') as HTMLElement;
  const count = el.querySelector('[data-count]') as HTMLElement;
  return {
    update(items: GeoItem[]) {
      count.textContent = String(items.length);
      list.innerHTML = items
        .map((it, i) => `
          <div class="item" data-i="${i}">
            <div class="bar" style="background:${rgb(severityColor(it.severity))}"></div>
            <div>
              <div class="title">${esc(it.title)}</div>
              <div class="meta">
                <span class="chip">${esc(it.layer)}</span>
                <span class="sev">sev ${it.severity.toFixed(1)}</span>
                ${it.place ? `<span>${esc(it.place)}</span>` : ''}
                ${it.ts ? `<span>${ago(it.ts)} ago</span>` : ''}
              </div>
            </div>
          </div>`)
        .join('');
      list.querySelectorAll<HTMLElement>('.item').forEach((node) => {
        node.addEventListener('click', () => onSelect(items[Number(node.dataset.i)]));
      });
    },
  };
}

// ── Layer toggles + legend ─────────────────────────────
export function renderLayerbar(
  el: HTMLElement,
  visible: Record<LayerId, boolean>,
  onToggle: (id: LayerId, on: boolean) => void,
) {
  el.innerHTML =
    `<div class="hd">Layers</div>` +
    LAYER_STYLES.map(
      (s) => `
      <div class="toggle ${visible[s.id] ? 'on' : ''}" data-id="${s.id}">
        <span class="sw"></span>
        <span class="dotc" style="background:${s.hex}"></span>
        <span>${s.label}</span>
        <span class="ct" data-ct="${s.id}">0</span>
      </div>`,
    ).join('');
  el.querySelectorAll<HTMLElement>('.toggle').forEach((node) => {
    node.addEventListener('click', () => {
      const id = node.dataset.id as LayerId;
      const on = !node.classList.contains('on');
      node.classList.toggle('on', on);
      onToggle(id, on);
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

// ── Markets ticker ─────────────────────────────────────
export function renderMarkets(el: HTMLElement) {
  return {
    update(quotes: Quote[]) {
      el.innerHTML =
        quotes
          .map((q) => {
            const up = q.changePct >= 0;
            return `<div class="mk">
              <span class="nm">${esc(q.name)}</span>
              <span class="px">${q.price.toLocaleString()}</span>
              <span class="u">${esc(q.unit)}</span>
              <span class="ch ${up ? 'up' : 'dn'}">${up ? '▲' : '▼'} ${Math.abs(q.changePct).toFixed(2)}%</span>
            </div>`;
          })
          .join('') + `<span class="mk-note">Δ vs. prev close · delayed</span>`;
    },
  };
}
