const LOG_PREFIX = "[analytics]";

// In-memory, module-level TTL cache — same shape as usage-policy.ts's
// modelPricing Map (no external cache dependency exists anywhere in
// this project, e.g. no Redis). Short-lived (default 60s) since
// analytics queries can be expensive but admins tolerate near-real-time
// data; explicit invalidate()/bypass exists for anything that must
// reflect a just-made change immediately.
interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

const DEFAULT_TTL_MS = 60_000;

export function buildCacheKey(name: string, params: Record<string, unknown>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((key) => `${key}=${JSON.stringify(params[key])}`)
    .join("&");
  return `${name}?${sorted}`;
}

/** Wraps `fn` with a short-lived cache — same key + still-fresh entry short-circuits `fn` entirely. */
export async function withCache<T>(key: string, fn: () => Promise<T>, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  const now = Date.now();
  const existing = store.get(key);

  if (existing && existing.expiresAt > now) {
    console.log(`${LOG_PREFIX} Analytics cache hit`, { key });
    return existing.value as T;
  }

  console.log(`${LOG_PREFIX} Analytics cache miss`, { key });
  const value = await fn();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

/** Drops every cached entry whose key starts with `prefix` — call after a subscription/payment/major-usage change so the next read is fresh. */
export function invalidate(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

export function clearAll(): void {
  store.clear();
}
