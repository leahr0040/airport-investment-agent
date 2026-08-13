---
phase: 02-live-data-adapters-caching
plan: 01
subsystem: adapters
tags: [lru-cache, vitest, server-only, ttl-cache]

# Dependency graph
requires:
  - phase: 01-foundation-configuration-airport-registry-resolution
    provides: src/config/env.ts (server-only-guarded getEnv())
provides:
  - A Vitest harness that can import server-only-guarded modules (server-only alias + placeholder test.env)
  - withCache/getCacheStats/clearCache — lru-cache-backed per-entry TTL cache-aside wrapper
  - AdapterResult<T>/AdapterFailReason — the shared no-stale-branch failure contract (D-06)
  - isValidIcao/isValidIata — the D-08 format gate
  - toAdapterFailure — shared error-to-AdapterResult mapping with detail hygiene
affects: [02-03-opensky-adapter, 02-04-nas-status-adapter, 02-05-cross-adapter-verification]

tech-stack:
  added: [lru-cache@11.5.2]
  patterns:
    - "Shared adapter foundation in src/domain/adapters/ — types.ts, validate.ts, cache.ts, errors.ts — both adapters import from here instead of duplicating logic"

key-files:
  created:
    - test/stubs/server-only.ts
    - src/config/env.test.ts
    - src/domain/adapters/types.ts
    - src/domain/adapters/validate.ts
    - src/domain/adapters/validate.test.ts
    - src/domain/adapters/cache.ts
    - src/domain/adapters/cache.test.ts
    - src/domain/adapters/errors.ts
    - src/domain/adapters/errors.test.ts
  modified:
    - vitest.config.ts
    - package.json
    - package-lock.json

key-decisions:
  - "lru-cache constructed with ttl:1 + ttlResolution:0 + an explicit perf.now => Date.now() override. ttlResolution's default (1ms) debounces internal staleness reads behind a setTimeout; because the cache is a module-level singleton reused across every it() block, and each test tears down fake timers in afterEach, that debounce timer gets silently dropped before firing — a later test can inherit a frozen 'now' snapshot from an earlier test and entries never expire. ttlResolution:0 forces every staleness check to call perf.now() fresh, which is immune to fake-timer teardown/recreation across test boundaries."

requirements-completed: [DATA-04, DATA-05]

coverage:
  - id: D1
    description: "Vitest can import a server-only-guarded module that calls getEnv() without throwing"
    requirement: DATA-04
    verification:
      - kind: unit
        ref: "src/config/env.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "withCache suppresses a duplicate producer call inside its TTL, re-invokes after expiry, honours per-entry TTLs independently, and never caches a rejection"
    requirement: DATA-04
    verification:
      - kind: unit
        ref: "src/domain/adapters/cache.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "AdapterResult<T> expresses every failure as one of five named reasons with no stale branch"
    requirement: DATA-05
    verification:
      - kind: unit
        ref: "src/domain/adapters/validate.test.ts, src/domain/adapters/errors.test.ts (type-level, asserted via grep in plan acceptance criteria)"
        status: pass
    human_judgment: false
  - id: D4
    description: "isValidIcao/isValidIata reject every malformed shape (case, length, whitespace, path/URL-reserved characters, embedded newline)"
    requirement: DATA-05
    verification:
      - kind: unit
        ref: "src/domain/adapters/validate.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "toAdapterFailure maps TimeoutError/carried-reason/other errors identically, never leaks secret-like text into detail"
    requirement: DATA-05
    verification:
      - kind: unit
        ref: "src/domain/adapters/errors.test.ts"
        status: pass
    human_judgment: false

duration: n/a (reconciled from a partially-drifted prior session, not timed end-to-end)
completed: 2026-08-13
status: complete
---

# Phase 2 Plan 1: Adapter Foundation Summary

**lru-cache-backed TTL cache wrapper, the AdapterResult<T> no-stale failure contract, the D-08 airport-code format gate, and a shared toAdapterFailure error mapper — the foundation both live-data adapters build on.**

## Performance

- **Tasks:** 4 (harness, contract+validate, cache, errors)
- **Files modified:** 9 created, 3 modified

## Accomplishments
- Vitest harness unblocked: `server-only` alias + placeholder `test.env` let tests import modules that call `getEnv()`
- `withCache`/`getCacheStats`/`clearCache` — generic TTL cache-aside wrapper with per-entry TTL and stats
- `AdapterResult<T>`/`AdapterFailReason` — five-reason discriminated union, no `stale` branch (D-06)
- `isValidIcao`/`isValidIata` — anchored, non-normalising format gate (D-08)
- `toAdapterFailure` — single shared error-to-result mapper both adapters call from their catch block

## Task Commits

1. **Task 1: Vitest harness for server-only modules** - `78d46b1` (chore)
2. **Task 2: AdapterResult contract and D-08 format gate** - `1668c2d` (test, RED), `81026fc` (feat, GREEN)
3. **Task 3: lru-cache TTL wrapper** - `3b835d3` (test, RED), `5a8326d` (feat, GREEN)
4. **Task 4: Shared error mapping helper** - `5e3830c` (test, RED), `6c8535a` (feat, GREEN)

## Files Created/Modified
- `test/stubs/server-only.ts` - no-op stand-in for the `server-only` package under Vitest
- `src/config/env.test.ts` - proves the harness resolves `server-only` and injects placeholder credentials
- `src/domain/adapters/types.ts` - `AdapterResult<T>`, `AdapterFailReason`
- `src/domain/adapters/validate.ts` - `isValidIcao`, `isValidIata`
- `src/domain/adapters/cache.ts` - `withCache`, `getCacheStats`, `clearCache`, TTL/bucket constants
- `src/domain/adapters/errors.ts` - `toAdapterFailure`
- `vitest.config.ts` - `server-only` alias, placeholder `test.env`, `passWithNoTests` removed

## Decisions Made
- `ttlResolution: 0` on the cache's lru-cache instance (see key-decisions above) — required for the TTL-expiry tests to be reliable under Vitest's fake timers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] cache.ts TTL-expiry logic was inert under fake timers**
- **Found during:** Reconciling a prior session's uncommitted work that had left `cache.ts` written to disk but never committed (2 of 8 `cache.test.ts` cases failing).
- **Issue:** lru-cache's default `ttlResolution` (1ms) debounces internal "now" reads behind a `setTimeout` that is silently dropped when a test's fake-timer environment is torn down before the debounce window elapses — a later test inherits a frozen "now" snapshot from an earlier one and entries never expire.
- **Fix:** Added `ttlResolution: 0` to the cache constructor (disables the debounce; every staleness check calls `perf.now()` fresh) and pinned `vi.setSystemTime()` in `cache.test.ts`'s `beforeEach` for determinism.
- **Files modified:** `src/domain/adapters/cache.ts`, `src/domain/adapters/cache.test.ts`
- **Verification:** `npx vitest run src/domain/adapters/cache.test.ts` — 8/8 pass; full suite 38/38 pass; `npx tsc --noEmit` exits 0.
- **Committed in:** `5a8326d`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary correctness fix for the exact behavior Task 3 exists to prove (per-entry TTL expiry). No scope creep.

## Issues Encountered
A prior session had written `cache.ts` to disk and left it uncommitted with no SUMMARY.md, while `errors.ts` (a later task) was already committed — an out-of-order, unreconciled partial state. Diagnosed via `git log --grep`, `git status`, and a standalone lru-cache/vitest fake-timer repro before fixing and committing task-by-task.

## Next Phase Readiness
- All four shared modules are committed, typecheck clean, and green under `npm test` (38/38).
- Plans 02-03 (OpenSky) and 02-04 (NAS Status) can import `withCache`, `AdapterResult`, `isValidIcao`/`isValidIata`, and `toAdapterFailure` directly.

## Self-Check: PASSED
All claimed files present on disk; all claimed commit hashes verified in `git log`; `npm test` 38/38, `npx tsc --noEmit` exit 0.
