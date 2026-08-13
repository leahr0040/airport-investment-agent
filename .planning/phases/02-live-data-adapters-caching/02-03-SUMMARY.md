---
phase: 02-live-data-adapters-caching
plan: 03
subsystem: adapters
tags: [opensky, axios, oauth2, movements]

# Dependency graph
requires:
  - phase: 02-live-data-adapters-caching
    provides: "02-01 (withCache/AdapterResult/isValidIcao/toAdapterFailure), 02-02 (AirportCodes.icao)"
provides:
  - "fetchMovements(icao) - OpenSky departure/arrival counts over a stated 24h window"
  - "clearTokenCache() - test seam and 401/403 recovery hook"
affects: [02-05-cross-adapter-verification]

tech-stack:
  added: []
  patterns:
    - "OpenSky adapter split into opensky.ts (orchestration), opensky.client.ts (axios HTTP + token lifecycle), opensky.parser.ts (record normalization), opensky.aggregator.ts (counting/no_data decision), opensky.types.ts (shared types) - by explicit developer direction, overriding plan 02-03's single-file spec."

key-files:
  created:
    - src/domain/adapters/opensky.ts
    - src/domain/adapters/opensky.client.ts
    - src/domain/adapters/opensky.parser.ts
    - src/domain/adapters/opensky.aggregator.ts
    - src/domain/adapters/opensky.types.ts
    - src/domain/adapters/opensky.test.ts
    - src/domain/adapters/opensky.client.test.ts

key-decisions:
  - "Kept axios (not fetch()) and the 5-file split, by explicit developer direction during reconciliation - plan 02-03 specified a single fetch()-based opensky.ts/opensky.test.ts pair; this codebase uses axios instead."
  - "axios's `timeout` option rejects with code ECONNABORTED, not an error named TimeoutError - the shared toAdapterFailure helper (02-01) only recognises the latter. Normalized in OpenSkyClient.normalizeTimeout() rather than teaching toAdapterFailure about axios-specific error shapes, so the shared helper stays HTTP-client-agnostic."

requirements-completed: [DATA-02, DATA-04, DATA-05]

coverage:
  - id: D1
    description: "fetchMovements returns real departure/arrival counts over an explicit, reported 24h window, authenticated via OAuth2 client credentials"
    requirement: DATA-02
    verification:
      - kind: unit
        ref: "src/domain/adapters/opensky.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "A repeat request inside the TTL issues no additional upstream call (bucketed cache key)"
    requirement: DATA-04
    verification:
      - kind: unit
        ref: "src/domain/adapters/opensky.test.ts > caches results inside the TTL"
        status: pass
    human_judgment: false
  - id: D3
    description: "Timeout, rate-limit, unauthorized, malformed-input, and empty-window paths all return a typed failure; nothing throws past the adapter boundary"
    requirement: DATA-05
    verification:
      - kind: unit
        ref: "src/domain/adapters/opensky.test.ts, src/domain/adapters/opensky.client.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-08 format gate runs before any I/O (zero axios calls on invalid input)"
    requirement: DATA-05
    verification:
      - kind: unit
        ref: "src/domain/adapters/opensky.test.ts > rejects a lowercase code before calling axios"
        status: pass
    human_judgment: false

duration: n/a (reconciled from a partially-drifted prior session, not timed end-to-end)
completed: 2026-08-13
status: complete
---

# Phase 2 Plan 3: OpenSky Movements Adapter Summary

**OAuth2 client-credentials adapter over OpenSky's flights API — bucketed 24h departure/arrival counts, lazy token refresh, and typed failures — built with axios across 5 files per explicit developer direction (plan specified a single fetch()-based file).**

## Performance

- **Tasks:** 2 (RED test suite, GREEN implementation) — reconciled from a prior session's uncommitted drift, not executed fresh
- **Files modified:** 7 created

## Accomplishments
- `fetchMovements(icao)` — validated ICAO gate, bucketed cache key, concurrent departure/arrival fetch, typed result
- Lazy OAuth2 token lifecycle with a 30s expiry safety margin (D-05)
- 404-per-leg treated as a legitimate zero; both-legs-404 treated as `no_data`
- Null-inferred-airport records counted, never dropped, surfaced via `unknownDestinationCount`/`unknownOriginCount`
- Fixed a real bug: axios timeout errors (`code: 'ECONNABORTED'`) weren't recognized by the shared `toAdapterFailure` helper, which only matches `name === 'TimeoutError'` — a genuine upstream timeout would have been misclassified as a generic `error`

## Task Commits

1. **Task 1: Specify the adapter against axios mocks (RED)** - `da342ab` (test)
2. **Task 2: Implement the adapter (GREEN)** - `4932393` (feat)
3. **Follow-up: cache.ts `any` -> `unknown`** - `a222928` (fix, addendum to 02-01)

## Files Created/Modified
- `src/domain/adapters/opensky.ts` - orchestration: gate, window/cache key, calls client+parser+aggregator
- `src/domain/adapters/opensky.client.ts` - axios HTTP client, OAuth2 token lifecycle, status-code-to-reason mapping
- `src/domain/adapters/opensky.parser.ts` - raw record normalization
- `src/domain/adapters/opensky.aggregator.ts` - counting and the no_data decision
- `src/domain/adapters/opensky.types.ts` - `FlightMovement`, `Movements`
- `src/domain/adapters/opensky.test.ts`, `opensky.client.test.ts` - full contract coverage

## Decisions Made
- axios + 5-file split kept instead of plan 02-03's fetch()-based single file (see key-decisions above).
- Timeout normalization lives in the client, not in the shared `toAdapterFailure` helper, keeping that helper HTTP-client-agnostic for whichever client 02-04 uses.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] axios timeout not recognized as `timeout` by the shared error mapper**
- **Found during:** Reconciling a prior session's uncommitted OpenSky work; the existing test only passed because it mocked a fabricated `TimeoutError`-named rejection rather than exercising real axios timeout behavior.
- **Issue:** `toAdapterFailure` (02-01) maps only `err.name === "TimeoutError"` to reason `timeout`. Real axios timeouts reject with `code: "ECONNABORTED"` and a generic `Error`/`AxiosError` name, so a genuine 3-second upstream stall would have surfaced as reason `error` instead of `timeout`.
- **Fix:** Added `OpenSkyClient.normalizeTimeout()`, wrapping both the token POST and leg GET calls; on `ECONNABORTED` it throws a normalized `Error` named `TimeoutError` before it reaches `toAdapterFailure`.
- **Files modified:** `src/domain/adapters/opensky.client.ts`, `src/domain/adapters/opensky.client.test.ts` (added a direct unit test for the normalization)
- **Verification:** New test `normalizes a real axios ECONNABORTED timeout to a TimeoutError-named error` passes; full suite green.
- **Committed in:** `4932393`

### Explicit developer override (not an auto-fix)

**Plan 02-03 specifies a single `opensky.ts`/`opensky.test.ts` pair using `fetch()` with `AbortSignal.timeout(3000)`, with `<verification>` requiring the diff touch exactly two files.** During reconciliation the developer explicitly directed keeping axios and the existing 5-file split instead ("I want to use axios and I want the split files - the code is more clean and clear"). This plan's `<verification>`/acceptance-criteria greps for `AbortSignal.timeout(3000)`/`encodeURIComponent`/file-count in `opensky.ts` are therefore **not** literally satisfied by the shipped code — the equivalent behavior (3s timeout via axios's `timeout` option, `encodeURIComponent` on the airport code in `buildFlightsUrl`) is present, just not in the file the plan's grep checks target. Recorded here rather than silently diverging.

---

**Total deviations:** 1 auto-fixed (bug) + 1 explicit developer override (architecture)
**Impact on plan:** The bug fix was necessary for DATA-05 to hold under real network conditions. The architecture override is a deliberate, informed choice; the plan's literal file-shape acceptance criteria no longer apply to this plan.

## Issues Encountered
Reconciled from a prior session that had written all 7 files to disk with a SUMMARY.md claiming completion, but had made zero commits and used axios/a 5-file split never mentioned in the plan. Verified against the plan's behavioral requirements (not just its file-shape requirements) before committing.

## Next Phase Readiness
- `fetchMovements`/`clearTokenCache` are committed, typecheck clean, lint clean, and green under `npm test` (49/49 repo-wide).
- Plan 02-05's isolation test and live smoke run can import this adapter directly alongside 02-04's NAS Status adapter.

## Self-Check: PASSED
All claimed files present on disk; all claimed commit hashes verified in `git log`; `npm test` 49/49, `npx tsc --noEmit` exit 0, `npm run lint` clean for all opensky.*/cache.ts files.
