import { LRUCache } from "lru-cache";

export const OPENSKY_TTL_MS = 5 * 60 * 1000;
export const NAS_STATUS_TTL_MS = 3 * 60 * 1000;
export const OPENSKY_BUCKET_SECONDS = 300;
export const FAA_FACILITY_TTL_MS = 24 * 60 * 60 * 1000;

// lru-cache constrains V to `{}` (excludes null/undefined) - NonNullable<unknown> satisfies that
// without falling back to `any`; callers still cast on read via withCache<T>'s `as T`.
const cache = new LRUCache<string, NonNullable<unknown>>({
  max: 2000,
  // lru-cache initializes per-entry TTL tracking only when this is set; every caller overrides it.
  ttl: 1,
  perf: { now: () => Date.now() },
  // Default ttlResolution (1ms) debounces "now" behind a setTimeout that fake-timer
  // teardown between tests silently drops, freezing staleness checks. 0 disables the debounce.
  ttlResolution: 0,
});
const UNDEFINED_VALUE = Symbol("undefined cache value");
let hits = 0;
let misses = 0;

export async function withCache<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  if (cache.has(key)) {
    hits += 1;
    const cached = cache.get(key);
    return (cached === UNDEFINED_VALUE ? undefined : cached) as T;
  }

  misses += 1;
  const value = await fn();
  cache.set(key, (value === undefined ? UNDEFINED_VALUE : value) as NonNullable<unknown>, { ttl: ttlMs });
  return value;
}

export function getCacheStats(): { hits: number; misses: number; size: number } {
  cache.purgeStale();
  return { hits, misses, size: cache.size };
}

export function clearCache(): void {
  cache.clear();
  hits = 0;
  misses = 0;
}
