import { LRUCache } from "lru-cache";

export const OPENSKY_TTL_MS = 5 * 60 * 1000;
export const NAS_STATUS_TTL_MS = 3 * 60 * 1000;
export const OPENSKY_BUCKET_SECONDS = 300;
export const FAA_FACILITY_TTL_MS = 24 * 60 * 60 * 1000;

// lru-cache constrains V to `{}` (excludes null/undefined) - NonNullable<unknown> satisfies that
// without falling back to `any`; callers still cast on read via withCache<T>'s `as T`.
type Producer = () => Promise<NonNullable<unknown>>;

// fetchMethod is constructor-only and shared across all keys, so it can't be swapped per call -
// it reads the actual per-call producer out of `context` instead. This still gets fetch()'s
// native in-flight de-duplication for concurrent same-key calls, no hand-rolled Map needed.
const cache = new LRUCache<string, NonNullable<unknown>, Producer>({
  max: 2000,
  // lru-cache initializes per-entry TTL tracking only when this is set; every caller overrides it.
  ttl: 1,
  perf: { now: () => Date.now() },
  // Default ttlResolution (1ms) debounces "now" behind a setTimeout that fake-timer
  // teardown between tests silently drops, freezing staleness checks. 0 disables the debounce.
  ttlResolution: 0,
  fetchMethod: (_key, _stale, { context }) => context(),
});

export async function withCache<T extends NonNullable<unknown>>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const value = await cache.fetch(key, { ttl: ttlMs, context: fn });
  return value as T;
}

export function clearCache(): void {
  cache.clear();
}
