---
phase: 02-live-data-adapters-caching
plan: 05
subsystem: adapters
tags: [isolation, smoke-test, live-verification]

# Dependency graph
requires:
  - phase: 02-live-data-adapters-caching
    provides: "02-03 (fetchMovements), 02-04 (fetchNasStatus)"
provides:
  - "isolation.test.ts - automated proof that one adapter failing does not affect the other"
  - "npm run smoke - opt-in live verification against real OpenSky/FAA endpoints"
affects: []

key-files:
  created:
    - src/domain/adapters/isolation.test.ts
    - src/domain/adapters/live.smoke.ts
    - vitest.smoke.config.ts

key-decisions:
  - "Isolation test scope trimmed to the two essential cases (OpenSky timeout doesn't take down the FAA result; the D-08 gate short-circuits both adapters) rather than the plan's full 6-case list, by explicit developer direction to keep remaining Phase 2 work minimal."
  - "Live smoke script scope trimmed similarly: real-data + cache-hit proof only, omitting the plan's separate isolation-against-a-real-failure assertion."

requirements-completed: [DATA-02, DATA-03, DATA-04, DATA-05]

coverage:
  - id: D1
    description: "One upstream source failing leaves the other's data intact; the combined Promise.all resolves rather than rejects"
    requirement: DATA-05
    verification:
      - kind: unit
        ref: "src/domain/adapters/isolation.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Both adapters run against the real OpenSky and FAA endpoints and return real, non-fixture numbers; a repeat call inside the TTL costs zero upstream calls"
    requirement: "DATA-02, DATA-03, DATA-04"
    verification: []
    human_judgment: true
    rationale: "Live-endpoint behavior is only verifiable by a human running npm run smoke against real credentials. The developer confirmed the run passed ('all passed') but the specific observed counts/lid/events were not captured into this record - see Issues Encountered."

duration: n/a
completed: 2026-08-13
status: complete
---

# Phase 2 Plan 5: Cross-Adapter Isolation & Live Verification Summary

**Automated proof that OpenSky and FAA NAS Status fail independently, plus an opt-in `npm run smoke` command exercising both against the real upstream APIs — confirmed passing by the developer.**

## Performance

- **Tasks:** 3 (isolation test, smoke infrastructure, live checkpoint)
- **Files modified:** 3 created

## Accomplishments
- `isolation.test.ts` — proves an OpenSky timeout doesn't take down the FAA result via `Promise.all`, and that the D-08 format gate short-circuits both adapters before any I/O
- `npm run smoke` — opt-in live run (`vitest.smoke.config.ts` + `live.smoke.ts`) loading real credentials via `process.loadEnvFile()`, never overlapping `npm test`'s include pattern
- Developer registered a real OpenSky OAuth2 client, populated `.env`, and ran `npm run smoke` — reported "all passed"

## Task Commits

1. **Task 1: Cross-adapter isolation test** - `c3f5e60` (test)
2. **Task 2: Opt-in live smoke run** - `e4fe5fd` (feat)
3. **Task 3: Live verification checkpoint** - confirmed by developer, no code commit (checkpoint only)

## Files Created/Modified
- `src/domain/adapters/isolation.test.ts` - cross-adapter failure-isolation proof (2 cases, trimmed from the plan's 6 per explicit direction)
- `src/domain/adapters/live.smoke.ts` - opt-in live run against both real upstreams plus a cache-hit proof
- `vitest.smoke.config.ts` - smoke-only include pattern, real credentials via `process.loadEnvFile()`
- `package.json` - `smoke` script

## Decisions Made
- Both the isolation test and the smoke script were scoped down from the plan's full case lists to the essential proof, by explicit developer direction ("for all the remaining steps in phase 2 write only minimum main test and complete").

## Deviations from Plan

**Scope reduction (explicit developer direction, not an auto-fix):** Plan 02-05 specifies 6 isolation cases and a more elaborate smoke script (including a second real-upstream call with a syntactically-valid-but-nonexistent ICAO code to prove failure isolation live). Both were trimmed to their essential proof at the developer's explicit request. The core DATA-05 claim (cross-adapter isolation) is still proven; the additional cases (both-sources-fail, failure-not-cached-on-retry, discriminated-union-exclusivity) are not separately asserted but follow from the same code path already exercised by 02-03/02-04's own test suites.

**Live checkpoint evidence not fully captured (explicit developer direction):** The plan's Task 3 requires recording the observed OpenSky departure/arrival counts, the FAA `lid`/`events` result, and a run timestamp as evidence for the phase's live-data claim. The developer ran `npm run smoke`, confirmed it passed, and explicitly declined to provide the specific numbers when asked ("ignore it and continue"). This SUMMARY records that the run happened and passed, per the developer's direct statement, but does not carry the itemized evidence the plan specifies — flagging this honestly rather than fabricating numbers that were never observed by this session.

---

**Total deviations:** 2, both explicit developer scope decisions (not defects).
**Impact on plan:** Phase 2's DATA-02/03/04/05 claims rest on: full automated coverage in 02-01 through 02-04 plus this phase's isolation test (all verified, all green), and the developer's direct confirmation that live data came back correctly. The evidentiary paper trail the plan wanted (exact numbers) is thinner than specified — acceptable given explicit developer sign-off, but worth knowing if this repo is graded on documentation completeness rather than just code correctness.

## Issues Encountered
See "Live checkpoint evidence not fully captured" above.

## Next Phase Readiness
- Phase 2 (live-data-adapters-caching) is complete: all 5 plans committed, `npm test` 66/66, `npx tsc --noEmit` clean, `npm run lint` clean, and the developer has confirmed live upstream data flows correctly.
- Phase 3 (deterministic-scoring-engine) already has committed `03-CONTEXT.md`/`03-RESEARCH.md`/`03-DISCUSSION-LOG.md` from a session that ran ahead of Phase 2's actual completion — worth a quick sanity check against what Phase 2 actually shipped (axios-based split-file adapters, not the originally-planned fetch()-based single files) before planning Phase 3.

## Self-Check: PASSED
All claimed files present on disk; both claimed commit hashes verified in `git log`; `npm test` 66/66, `npx tsc --noEmit` exit 0, `npm run lint` clean. Task 3's live-data claim rests on developer attestation, not a captured transcript (see Deviations).
