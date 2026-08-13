---
phase: 02-live-data-adapters-caching
plan: 04
subsystem: adapters
tags: [faa, nas-status, fast-xml-parser, axios]

# Dependency graph
requires:
  - phase: 02-live-data-adapters-caching
    provides: "02-01 (withCache/AdapterResult/isValidIcao/isValidIata/toAdapterFailure), 02-02 (AirportCodes.icao)"
provides:
  - "fetchNasStatus(icao) - live FAA delay/closure events for an airport, matched by derived FAA LID"
  - "toFaaLid(icao) - ICAO-to-FAA-location-identifier derivation"
affects: [02-05-cross-adapter-verification]

tech-stack:
  added: [fast-xml-parser@5.10.1]
  patterns:
    - "NAS Status adapter split into nasStatus.ts (orchestration/parsing) and nasStatus.client.ts (axios HTTP + whole-feed TTL cache) - same split-file-with-axios pattern as 02-03, by explicit developer direction."

key-files:
  created:
    - src/domain/adapters/nasStatus.ts
    - src/domain/adapters/nasStatus.client.ts
    - src/domain/adapters/nasStatus.test.ts
    - src/domain/adapters/nasStatus.client.test.ts

key-decisions:
  - "Package Legitimacy Gate for fast-xml-parser presented for real via AskUserQuestion and approved (81.8M weekly downloads, 9-year-old repo, [SUS] verdict traced to a 'too-new' publish-date heuristic) - the prior drifted session's SUMMARY claimed approval with no actual record of the checkpoint running."
  - "Kept axios and the 2-file split (not fetch()+single-file per plan) - same explicit developer direction as 02-03."
  - "FAA LID matching implemented as a generic recursive walk over every Delay_type block (collecting any nested object with a matching ARPT field) instead of the drifted version's hardcoded Airport_Closure_List-only read - required to satisfy DATA-03's 'a delay block the FAA adds or renames later still yields its airport's events' truth."

requirements-completed: [DATA-03, DATA-04, DATA-05]

coverage:
  - id: D1
    description: "fetchNasStatus returns live FAA delay/closure events for a named airport; an airport with nothing wrong returns ok:true with an empty list, not a failure"
    requirement: DATA-03
    verification:
      - kind: unit
        ref: "src/domain/adapters/nasStatus.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Two different airports queried inside the TTL cost one upstream fetch (single shared 'nas:feed' key)"
    requirement: DATA-04
    verification:
      - kind: unit
        ref: "src/domain/adapters/nasStatus.test.ts > fetches the whole feed once for two different airports"
        status: pass
    human_judgment: false
  - id: D3
    description: "Timeout, rate-limit, server-error, and malformed-input paths all return a typed failure; a delay block the FAA adds or renames later still yields its airport's events (generic walk, not a hardcoded switch)"
    requirement: DATA-05
    verification:
      - kind: unit
        ref: "src/domain/adapters/nasStatus.test.ts, src/domain/adapters/nasStatus.client.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "FAA LID derived from ICAO (not IATA) so the DJT/KPBI rename divergence still matches correctly"
    requirement: DATA-03
    verification:
      - kind: unit
        ref: "src/domain/adapters/nasStatus.test.ts > matches the FAA LID divergence"
        status: pass
    human_judgment: false

duration: n/a (reconciled from a partially-drifted prior session, not timed end-to-end)
completed: 2026-08-13
status: complete
---

# Phase 2 Plan 4: FAA NAS Status Adapter Summary

**Whole-feed FAA NAS Status fetch cached under one shared key, with a generic recursive walk over every Delay_type block so unknown/renamed block names still surface their events — built with axios across 2 files per explicit developer direction (plan specified a single fetch()-based file).**

## Performance

- **Tasks:** 3 (checkpoint, implementation, tests) — reconciled from a prior session's uncommitted drift
- **Files modified:** 4 created

## Accomplishments
- Package Legitimacy checkpoint for `fast-xml-parser` run for real and approved (the drifted session's claim of approval had no actual record)
- `fetchNasStatus(icao)` — ICAO format gate, FAA LID derivation + validation, whole-feed fetch via one shared cache key, generic block walk
- `toFaaLid(icao)` exported, correctly handling the DJT/KPBI IATA-rename divergence and non-K-prefixed Alaska/Hawaii codes
- Rewrote the drifted implementation's hardcoded `Airport_Closure_List`-only read into a generic recursive walk that finds any matching `ARPT` entry regardless of which `Delay_type` block or list wrapper contains it

## Task Commits

1. **Task 1: Package Legitimacy Gate for fast-xml-parser** - checkpoint only, approved via AskUserQuestion (no code commit; dependency landed in `1410173`)
2. **Task 2: Implement the adapter** - `39fb9b7` (feat)
3. **Task 3: Cover against XML fixtures** - `e82ef98` (test)

## Files Created/Modified
- `src/domain/adapters/nasStatus.ts` - format gate, LID derivation, generic Delay_type walk, event/raw shaping
- `src/domain/adapters/nasStatus.client.ts` - axios whole-feed fetch, single `nas:feed` cache key, timeout/rate-limit normalization
- `src/domain/adapters/nasStatus.test.ts`, `nasStatus.client.test.ts` - fixture-driven coverage

## Decisions Made
- axios + 2-file split kept instead of plan 02-04's fetch()-based single file (see key-decisions above; same override as 02-03).
- Generic recursive `ARPT`-matching walk chosen over a per-block-type switch, per the plan's explicit DATA-05 truth about unknown/renamed blocks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Drifted implementation only read the Airport Closures block**
- **Found during:** Reconciling a prior session's uncommitted `nasStatus.ts`, which read `root?.Delay_type?.Airport_Closure_List?.Airport` directly - correct for closures only, but silently blind to ground stops, ground delay programs, arrival/departure delays, and any future block the FAA adds or renames. `Delay_type` is also an array in the confirmed live schema (CLAUDE.md), not the single object the drifted code assumed.
- **Fix:** Rewrote as a generic recursive walk (`findMatchingEntries`) over every `Delay_type` block, collecting any nested object with a matching `ARPT` field regardless of the list wrapper name.
- **Files modified:** `src/domain/adapters/nasStatus.ts`
- **Verification:** New tests for multiple blocks, an unrecognised block name, and a single-element list all pass.
- **Committed in:** `39fb9b7`

**2. [Rule 2 - Missing Critical] `isValidIcao`/`isValidIata` gates were imported but never called**
- **Found during:** Same reconciliation pass; the drifted `fetchNasStatus` accepted either a 3- or 4-character input ambiguously via a private, unvalidated `deriveFaaLid` instead of the plan's explicit `isValidIcao` gate followed by an `isValidIata`-checked derived LID.
- **Fix:** Added the `isValidIcao(icao)` gate first, then `toFaaLid` + `isValidIata` guard on the derived value, matching plan 02-04's Task 2 spec exactly.
- **Files modified:** `src/domain/adapters/nasStatus.ts`
- **Verification:** `rejects malformed codes before any network call` test passes; `npm run lint` no longer flags `isValidIcao` as unused.
- **Committed in:** `39fb9b7`

**3. [Rule 1 - Bug] axios timeout and 429 not mapped correctly**
- **Found during:** Same reconciliation pass, same class of bug as 02-03's OpenSky client.
- **Issue:** `nasStatus.client.ts` only checked `response.status !== 200` and threw a plain `Error('FeedFetchFailed')` with no `reason`, so a 429 would fall through to a generic `error` instead of `rate_limited`, and a real axios timeout (`code: 'ECONNABORTED'`) would never be recognized as `timeout` by the shared `toAdapterFailure` helper.
- **Fix:** Added the same `normalizeTimeout` helper used in `opensky.client.ts`, plus explicit 429-to-`rate_limited` mapping.
- **Files modified:** `src/domain/adapters/nasStatus.client.ts`
- **Verification:** New tests for both cases pass.
- **Committed in:** `39fb9b7`

### Explicit developer override (not an auto-fix)

**Plan 02-04 specifies a single `nasStatus.ts`/`nasStatus.test.ts` pair using `fetch()`.** The developer explicitly directed keeping axios and the 2-file split (same override as 02-03) - recorded here rather than silently diverging. The plan's literal file-shape acceptance criteria (e.g. `grep -c "nasstatus.faa.gov" src/domain/adapters/nasStatus.ts` returns 1) do not fully apply since the feed URL now lives in `nasStatus.client.ts`.

---

**Total deviations:** 3 auto-fixed (2 missing-critical, 1 bug) + 1 explicit developer override (architecture)
**Impact on plan:** All three auto-fixes were necessary for DATA-03/DATA-05 to hold as specified - the drifted version would have silently under-reported disruptions at any airport affected by something other than a closure. No scope creep beyond what the plan already required.

## Issues Encountered
Reconciled from a prior session that had written `nasStatus.ts`/`nasStatus.client.ts` to disk with a thin SUMMARY.md claiming the checkpoint was approved, but with zero commits and a materially incomplete implementation (closures-only, unvalidated LID derivation). Ran the checkpoint for real before treating `fast-xml-parser` as approved.

## Next Phase Readiness
- `fetchNasStatus`/`toFaaLid` are committed, typecheck clean, lint clean, and green under `npm test` (64/64 repo-wide).
- Plan 02-05's isolation test and live smoke run can import this adapter directly alongside 02-03's OpenSky adapter.

## Self-Check: PASSED
All claimed files present on disk; all claimed commit hashes verified in `git log`; `npm test` 64/64, `npx tsc --noEmit` exit 0, `npm run lint` clean.
