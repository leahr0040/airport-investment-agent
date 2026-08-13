---
phase: 02-live-data-adapters-caching
plan: 02
subsystem: domain
tags: [regions, icao, iata]

# Dependency graph
requires: []
provides:
  - "AirportCodes {iata, icao} type and lookupAirports() returning pairs instead of bare IATA strings"
  - "regionKeys() accessor for iterating the full lookup table"
affects: [02-03-opensky-adapter, 02-04-nas-status-adapter]

key-files:
  modified:
    - src/domain/airports/regions.ts
    - src/domain/airports/regions.test.ts

key-decisions:
  - "4-letter passthrough branch derives iata as the input's last 3 characters (e.g. 'katl' -> {iata:'ATL', icao:'KATL'}), not the full 4-letter string — matches the plan's explicit instruction and keeps iata a real 3-letter code rather than an ICAO-shaped value in the wrong field."

requirements-completed: [DATA-02, DATA-03]

coverage:
  - id: D1
    description: "lookupAirports returns {iata, icao} pairs for every region/metro table entry, with ICAO carried as data (not derived) so DJT/KPBI and the Alaska/Hawaii P-prefix exceptions are correct"
    requirement: DATA-02
    verification:
      - kind: unit
        ref: "src/domain/airports/regions.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Passthrough branch derives ICAO by rule only for codes absent from the table, with correct K-prefix and ANC/HNL exceptions"
    requirement: DATA-03
    verification:
      - kind: unit
        ref: "src/domain/airports/regions.test.ts"
        status: pass
    human_judgment: false

duration: n/a (reconciled from a partially-drifted prior session, not timed end-to-end)
completed: 2026-08-13
status: complete
---

# Phase 2 Plan 2: Airport ICAO Codes Summary

**REGION_LOOKUP now carries {iata, icao} pairs as data (D-09); the passthrough branch derives ICAO by rule (K-prefix, ANC/HNL exceptions) only for codes absent from the table (D-10).**

## Performance

- **Tasks:** 2 (RED test rewrite, GREEN implementation)
- **Files modified:** 2

## Accomplishments
- `AirportCodes` exported type; every `REGION_LOOKUP` entry carries a real ICAO code as data
- `lookupAirports()` returns `AirportCodes[]` instead of bare IATA strings
- `regionKeys()` exported for iterating the whole table
- DJT/KPBI divergence (IATA renamed, ICAO unchanged) and the ANC/HNL P-prefix exceptions pinned by test

## Task Commits

1. **Task 1: Rewrite regions.test.ts against the {iata, icao} contract (RED)** - `705bd13` (test)
2. **Task 2: Carry ICAO on every table entry, derive only on passthrough (GREEN)** - `8cba36b` (feat)

## Files Created/Modified
- `src/domain/airports/regions.ts` - `AirportCodes` type, `regionKeys()`, `lookupAirports()` returning pairs
- `src/domain/airports/regions.test.ts` - full contract rewrite plus region-name Alaska/Hawaii and structural all-keys cases

## Decisions Made
- iata derivation on the 4-letter passthrough branch fixed to take the last 3 characters (see key-decisions above).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 4-letter passthrough iata field held the full 4-letter code**
- **Found during:** Reconciling a prior session's uncommitted `regions.ts`/`regions.test.ts` work against the plan's exact spec.
- **Issue:** `lookupAirports('katl')` returned `{iata: 'KATL', icao: 'KATL'}` — a 4-character value in a field the rest of the codebase treats as a 3-letter IATA code. The plan's Task 2 action explicitly specifies "take its last 3 characters as the IATA value."
- **Fix:** Changed the passthrough branch to `norm.slice(1)` for `iata`.
- **Files modified:** `src/domain/airports/regions.ts`, `src/domain/airports/regions.test.ts` (assertion updated to `{iata: 'ATL', icao: 'KATL'}`)
- **Verification:** `npx vitest run src/domain/airports/regions.test.ts` — 6/6 pass; `npx tsc --noEmit` exits 0; no production callers exist yet (repo-wide grep confirms).
- **Committed in:** `8cba36b`

**2. [Rule 2 - Missing Critical] Two required test cases were missing**
- **Found during:** Same reconciliation pass.
- **Issue:** The plan's Task 1 requires (a) a direct region-name lookup test for `'Alaska'`/`'Hawaii'` proving the table (not the K-prefix rule) supplies those pairs, and (b) a structural assertion over every table entry via `regionKeys()` that `icao` is `[A-Z]{4}` and `iata` is `[A-Z]{3}`. Neither existed in the drifted test file.
- **Fix:** Added both test cases.
- **Files modified:** `src/domain/airports/regions.test.ts`
- **Verification:** Both new cases pass; the structural assertion is what would have caught deviation #1 above on its own.
- **Committed in:** `705bd13`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing-critical)
**Impact on plan:** Both fixes bring the drifted working tree into conformance with the plan's explicit spec. No scope creep.

## Issues Encountered
None beyond the deviations above — this plan's code and tests existed uncommitted in the working tree from a prior session and were verified against the plan rather than written from scratch.

## Next Phase Readiness
- `AirportCodes`/`lookupAirports()`/`regionKeys()` are committed, typecheck clean, and green under `npm test`.
- Plans 02-03 (OpenSky, keys by `icao`) and 02-04 (NAS Status, derives FAA LID from `icao`) can import this shape directly.

## Self-Check: PASSED
All claimed files present on disk; both claimed commit hashes verified in `git log`; `npm test` full suite and `npx tsc --noEmit` both pass.
