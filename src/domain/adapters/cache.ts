import { LRUCache } from "lru-cache";

export const OPENSKY_TTL_MS = 5 * 60 * 1000;
export const NAS_STATUS_TTL_MS = 3 * 60 * 1000;
export const OPENSKY_BUCKET_SECONDS = 300;
export const FAA_FACILITY_TTL_MS = 24 * 60 * 60 * 1000;

type Producer = () => Promise<NonNullable<unknown>>;

const cache = new LRUCache<string, NonNullable<unknown>, Producer>({
  max: 2000,
  ttl: 1,
  // Live Date-based clock: lru-cache's 1ms default parks "now" behind a setTimeout that fake-timer teardown drops, freezing this singleton's TTLs.
  perf: { now: () => Date.now() },
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
