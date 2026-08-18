---
phase: 02-live-data-adapters-caching
reviewed: 2026-08-18T00:00:00Z
depth: quick
files_reviewed: 24
files_reviewed_list:
  - src/config/env.test.ts
  - src/domain/adapters/cache.test.ts
  - src/domain/adapters/cache.ts
  - src/domain/adapters/errors.test.ts
  - src/domain/adapters/errors.ts
  - src/domain/adapters/isolation.test.ts
  - src/domain/adapters/live.smoke.ts
  - src/domain/adapters/nasStatus.client.test.ts
  - src/domain/adapters/nasStatus.client.ts
  - src/domain/adapters/nasStatus.test.ts
  - src/domain/adapters/nasStatus.ts
  - src/domain/adapters/opensky.aggregator.ts
  - src/domain/adapters/opensky.client.test.ts
  - src/domain/adapters/opensky.client.ts
  - src/domain/adapters/opensky.parser.ts
  - src/domain/adapters/opensky.test.ts
  - src/domain/adapters/opensky.ts
  - src/domain/adapters/opensky.types.ts
  - src/domain/adapters/types.ts
  - src/domain/adapters/validate.test.ts
  - src/domain/adapters/validate.ts
  - src/domain/airports/regions.test.ts
  - src/domain/airports/regions.ts
  - test/stubs/server-only.ts
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-08-18T00:00:00Z
**Depth:** quick
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Reviewed the live-data adapter layer (OpenSky, FAA NAS Status, in-memory cache, error-mapping, and the region/airport lookup table) at quick depth: pattern scans for hardcoded secrets, dangerous functions, debug artifacts, and empty catch blocks came back clean (the only "secret"/"token" string literals found are test fixtures in `*.test.ts` files, not real credentials). Reading the adapter and cache implementations surfaced two correctness/robustness concerns worth fixing before this ships: an in-flight request race in the shared cache and OpenSky client that can duplicate upstream calls under concurrency, and an ICAO validation gap that lets non-US airport codes silently produce a confidently "healthy" FAA status answer instead of failing. Two minor duplication/type-safety items round out the findings.

## Warnings

### WR-01: Cache and token fetch have no in-flight de-duplication — concurrent requests for the same key each become a cache miss

**File:** `src/domain/adapters/cache.ts:23-38`, `src/domain/adapters/opensky.client.ts:67-75`

**Issue:** `withCache` only checks `cache.has(key)` synchronously and writes the result back with `cache.set(...)` after `await fn()` resolves. If two calls for the same key arrive before the first `fn()` has resolved (e.g., two chat turns referencing the same airport, or `Promise.all` fan-out over a region's multiple airports that happen to share a bucketed window key), both calls see a miss and both invoke the producer — meaning both hit the real upstream (OpenSky `/flights/*` or the FAA feed) instead of the second one waiting on the first's in-flight promise. `OpenSkyClient.ensureToken()` (`opensky.client.ts:67-75`) has the identical gap for the OAuth2 token fetch: two concurrent callers before the first token request resolves will both POST to the token endpoint. Given the project's explicit constraint that OpenSky's anonymous/registered quota (400–4,000 credits/day) is a hard budget to protect with rate-limiting, this silently defeats part of that protection under any real concurrency.

**Fix:** Memoize the in-flight promise per key, not just the resolved value:
```ts
const inFlight = new Map<string, Promise<unknown>>();

export async function withCache<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  if (cache.has(key)) { /* ...unchanged... */ }

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  misses += 1;
  const promise = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  const value = await promise;
  cache.set(key, (value === undefined ? UNDEFINED_VALUE : value) as NonNullable<unknown>, { ttl: ttlMs });
  return value;
}
```
Apply the same pattern to `ensureToken`'s token-request path.

### WR-02: ICAO validation is not restricted to US airports — non-US codes silently produce a confidently "no active events" answer

**File:** `src/domain/adapters/validate.ts:2-3`, `src/domain/adapters/nasStatus.ts:39-41`, `src/domain/airports/regions.ts:150-154`

**Issue:** `isValidIcao` (`validate.ts:2`) only checks "4 uppercase letters" — it has no US-prefix restriction (`K`/`P`/`N`/`T`). `toFaaLid` (`nasStatus.ts:39-41`) derives the FAA location identifier by naively stripping the first character of whatever 4-letter code it's given, and `regions.ts`'s passthrough branch (line 151-154) does the same for any unrecognized 4-letter input. For a non-US airport such as `EGLL` (London Heathrow), this pipeline computes LID `GLL`, passes `isValidIata`, queries the real FAA feed, finds no matching `ARPT`, and returns `{ ok: true, data: { events: [] } }` — presented to the analyst as "no active NAS status events," when in fact the FAA has no record of that airport at all. This is exactly the failure mode the project's CLAUDE.md calls out as worse than a hedged answer ("a confident wrong number fails harder than a hedged right one"): the system reports confident health data for an airport it cannot actually see.

**Fix:** Restrict `isValidIcao`/the region/airport resolution path to known-US prefixes (or better, validate against the cached OurAirports/FAA reference table instead of a bare regex), and have `fetchNasStatus`/`lookupAirports` return `invalid_input` (or an explicit "unsupported airport" reason) for codes outside that set rather than silently computing a syntactically-valid-looking but meaningless FAA LID.

## Info

### IN-01: Duplicated timeout/status-mapping logic between the two HTTP clients

**File:** `src/domain/adapters/nasStatus.client.ts:8-13,32-39`, `src/domain/adapters/opensky.client.ts:60-65,90-101`

**Issue:** `normalizeTimeout` (ECONNABORTED → `TimeoutError`) and the 429→`rate_limited` / non-200→`error` mapping are copy-pasted verbatim across `NasStatusClient` and `OpenSkyClient`. A future change to how one adapter maps HTTP statuses (e.g., adding a `403`-specific reason) is easy to make in one file and forget in the other.

**Fix:** Extract a shared `mapHttpFailure(status, err)` helper (or the timeout normalizer alone) into `errors.ts` and have both clients call it.

### IN-02: Ad-hoc `Error & { reason: string }` widens the reason literal, losing compile-time typo protection

**File:** `src/domain/adapters/nasStatus.client.ts:33,37`, `src/domain/adapters/opensky.client.ts:91,96,100`

**Issue:** Each throw site types the augmented error as `Error & { reason: string }` rather than `Error & { reason: AdapterFailReason }`. Since `string` is wider than the `AdapterFailReason` union, a typo like `'rate_limitted'` would type-check here and only be caught at runtime by `isAdapterFailReason` in `errors.ts` falling through to the generic `'error'` reason — silently misclassifying the failure instead of failing a build.

**Fix:**
```ts
const e: Error & { reason: AdapterFailReason } = Object.assign(new Error('rate_limited'), { reason: 'rate_limited' });
```

---

_Reviewed: 2026-08-18T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
