// Lightweight snap-to-grid dashboard for the right rail: each .card is a tile you
// can drag-reorder (by its header), resize (width = 1..COLS column span, height in
// px), close, or re-add from the toolbar menu. Layout persists to localStorage.
// Framework-free; operates on the existing card DOM so every card setter still
// works (they query by [data-card], which never changes).

const KEY = 'varde.layout.v2';
const COLS = 3;
const DEFAULT_H = 320;

interface PanelState {
  cols: number;
  h: number;
  hidden: boolean;
}
interface Layout {
  order: string[];
  panels: Record<string, PanelState>;
}

const WIDE = new Set(['markets', 'energynews']); // default full-width tiles

function defaultCols(id: string): number {
  return WIDE.has(id) ? COLS : 1;
}

export function initDashboard(cardsEl: HTMLElement, toolbarEl: HTMLElement): void {
  const cards = Array.from(cardsEl.querySelectorAll<HTMLElement>('.card'));
  const ids = cards.map((c) => c.dataset.card!).filter(Boolean);
  const byId = new Map(cards.map((c) => [c.dataset.card!, c] as const));
  const titleOf = (id: string) =>
    byId.get(id)?.querySelector('.card-h .t')?.textContent?.trim() ?? id;

  const layout = normalize(load(), ids);

  // ── one-time DOM decoration ──
  for (const c of cards) {
    const id = c.dataset.card!;
    c.setAttribute('draggable', 'true');
    c.classList.remove('wide');

    // Close button in the header.
    const head = c.querySelector('.card-h');
    if (head && !head.querySelector('.card-x')) {
      const x = document.createElement('button');
      x.className = 'card-x';
      x.title = 'Hide panel';
      x.textContent = '✕';
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        layout.panels[id].hidden = true;
        apply();
      });
      head.appendChild(x);
    }
    // Resize handle (bottom-right).
    if (!c.querySelector('.card-resize')) {
      const rz = document.createElement('div');
      rz.className = 'card-resize';
      rz.title = 'Drag to resize';
      attachResize(rz, c, id);
      c.appendChild(rz);
    }

    // Drag-reorder — only when grabbing the header (not rows/links).
    c.addEventListener('dragstart', (e) => {
      if (!(e.target as HTMLElement).closest('.card-h') || (e.target as HTMLElement).closest('.card-x')) {
        e.preventDefault();
        return;
      }
      dragId = id;
      c.classList.add('dragging');
      e.dataTransfer?.setData('text/plain', id);
    });
    c.addEventListener('dragend', () => {
      c.classList.remove('dragging');
      dragId = null;
      apply();
    });
  }

  let dragId: string | null = null;
  cardsEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    const over = (e.target as HTMLElement).closest('.card') as HTMLElement | null;
    if (!over || !dragId) return;
    const overId = over.dataset.card!;
    if (overId === dragId) return;
    const from = layout.order.indexOf(dragId);
    const to = layout.order.indexOf(overId);
    if (from < 0 || to < 0) return;
    layout.order.splice(from, 1);
    layout.order.splice(to, 0, dragId);
    applyOrder();
  });

  // ── resize (pointer) ──
  function attachResize(handle: HTMLElement, card: HTMLElement, id: string) {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      const st = layout.panels[id];
      const startX = e.clientX;
      const startY = e.clientY;
      const startCols = st.cols;
      const startH = st.h;
      const tileW = cardsEl.clientWidth / COLS;
      const move = (ev: PointerEvent) => {
        const dCols = Math.round((ev.clientX - startX) / tileW);
        st.cols = Math.max(1, Math.min(COLS, startCols + dCols));
        st.h = Math.max(140, Math.min(900, startH + (ev.clientY - startY)));
        card.style.gridColumn = `span ${st.cols}`;
        card.style.setProperty('--card-h', `${st.h}px`);
      };
      const up = (ev: PointerEvent) => {
        handle.releasePointerCapture(ev.pointerId);
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        save(layout);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }

  function applyOrder() {
    layout.order.forEach((id, i) => {
      const c = byId.get(id);
      if (c) c.style.order = String(i);
    });
  }

  function apply() {
    applyOrder();
    for (const id of layout.order) {
      const c = byId.get(id);
      if (!c) continue;
      const st = layout.panels[id];
      c.style.gridColumn = `span ${st.cols}`;
      c.style.setProperty('--card-h', `${st.h}px`);
      c.classList.toggle('hidden', st.hidden);
    }
    renderToolbar();
    save(layout);
  }

  function renderToolbar() {
    const hidden = layout.order.filter((id) => layout.panels[id].hidden);
    toolbarEl.innerHTML =
      `<div class="dt-menu">
        <button class="dt-btn" data-add>＋ Panels${hidden.length ? ` (${hidden.length})` : ''}</button>
        <div class="dt-drop" data-drop hidden>${
          hidden.length
            ? hidden.map((id) => `<button data-id="${id}">＋ ${escapeHtml(titleOf(id))}</button>`).join('')
            : '<div class="dt-empty">all panels shown</div>'
        }</div>
      </div>
      <button class="dt-btn" data-reset title="Reset layout">⤢ Reset</button>`;
    const addBtn = toolbarEl.querySelector('[data-add]') as HTMLElement;
    const drop = toolbarEl.querySelector('[data-drop]') as HTMLElement;
    addBtn.addEventListener('click', () => (drop.hidden = !drop.hidden));
    drop.querySelectorAll<HTMLElement>('button[data-id]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.id!;
        layout.panels[id].hidden = false;
        // bring re-added panel to the front of the order
        layout.order = [id, ...layout.order.filter((x) => x !== id)];
        drop.hidden = true;
        apply();
      }),
    );
    (toolbarEl.querySelector('[data-reset]') as HTMLElement).addEventListener('click', () => {
      localStorage.removeItem(KEY);
      location.reload();
    });
  }

  apply();
}

// ── map ↔ rail divider ──
export function initDivider(divider: HTMLElement, rail: HTMLElement, onResize: () => void): void {
  divider.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    divider.setPointerCapture(e.pointerId);
    const stage = rail.parentElement!;
    const move = (ev: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      const w = Math.max(320, Math.min(rect.width - 300, rect.right - ev.clientX));
      rail.style.flex = `0 0 ${w}px`;
      rail.style.maxWidth = 'none';
      onResize();
    };
    const up = (ev: PointerEvent) => {
      divider.releasePointerCapture(ev.pointerId);
      divider.removeEventListener('pointermove', move);
      divider.removeEventListener('pointerup', up);
      onResize();
    };
    divider.addEventListener('pointermove', move);
    divider.addEventListener('pointerup', up);
  });
}

// ── persistence ──
function load(): Layout | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}
function save(l: Layout) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* ignore */
  }
}
function normalize(l: Layout | null, ids: string[]): Layout {
  const out: Layout = { order: [], panels: {} };
  const src = l && Array.isArray(l.order) ? l : { order: [], panels: {} };
  for (const id of ids) {
    out.panels[id] = {
      cols: src.panels?.[id]?.cols ?? defaultCols(id),
      h: src.panels?.[id]?.h ?? DEFAULT_H,
      hidden: src.panels?.[id]?.hidden ?? false,
    };
  }
  out.order = [...(src.order || []).filter((id) => ids.includes(id))];
  for (const id of ids) if (!out.order.includes(id)) out.order.push(id);
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m] as string));
}
