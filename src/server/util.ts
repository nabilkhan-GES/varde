// Tiny server-side helpers shared by every route: fetch-with-timeout and a
// process-memory TTL cache (good enough for dev + a warm serverless instance;
// swap for Upstash/Redis when traffic warrants — see ROADMAP).

export async function fetchText(url: string, timeoutMs = 12000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; varde/0.1; +https://varde.app)' },
    });
    if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchJson<T = unknown>(url: string, timeoutMs = 12000): Promise<T> {
  return JSON.parse(await fetchText(url, timeoutMs)) as T;
}

const store = new Map<string, { at: number; val: unknown }>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return hit.val as T;
  try {
    const val = await fn();
    store.set(key, { at: now, val });
    return val;
  } catch (err) {
    if (hit) return hit.val as T; // serve stale on upstream failure
    throw err;
  }
}
