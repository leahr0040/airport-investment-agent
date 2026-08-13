---
phase: quick-260813-pvn
plan: 1
subsystem: scoring
tags: [faa-adip, arcgis, caching, expansion-score, code-review-fixes]

requires:
  - phase: 03-deterministic-scoring-engine
    provides: FAA facility adapter (faaFacility.ts) and deterministic scoring engine (expansionScore.ts) that this plan patches
provides:
  - Null-safe ArcGIS numeric field parsing in faaFacility.ts (no silent null-to-0/fabricated-coordinate coercion)
  - Failure results (no_data/error) from fetchFaaFacility no longer cached for the full 24h TTL
  - Explicit headroom-unavailable component (reason 'no_data') for zero-runway facilities in scoreAirports
  - Deleted duplicate faaFacility.client.single.test.ts
  - Written CR-02 (cargo-callsign misclassification) fix-options document for user decision
affects: [phase-04-conversational-agent, faaFacility.ts, expansionScore.ts]

tech-stack:
  added: []
  patterns: ["Throw (not return) inside a withCache callback to exclude a result from caching, per cache.ts's set-after-resolve behavior"]

key-files:
  created:
    - .planning/quick/260813-pvn-fix-code-review-findings-cr-01-wr-01-wr-/260813-pvn-CR-02-OPTIONS.md
  modified:
    - src/domain/adapters/faaFacility.ts
    - src/domain/adapters/faaFacility.test.ts
    - src/domain/scoring/expansionScore.ts
    - src/domain/scoring/expansionScore.test.ts
  deleted:
    - src/domain/adapters/faaFacility.client.single.test.ts

key-decisions:
  - "CR-01 fix: toFiniteOrNull returns null immediately for null/undefined/empty-string before ever calling Number(v), preventing Number(null)===0 corruption."
  - "WR-01 fix: no_data/error branches inside withCache's callback now throw an Error carrying a `reason` property instead of returning normally, so cache.ts's existing 'only cache what fn() resolves to' behavior naturally excludes failures from the 24h TTL. cache.ts itself is untouched."
  - "WR-04 fix: computeHeadroomKpi is gated on facility.data.runways.length > 0 at its only call site; a zero-runway facility routes headroom to available:false with reason 'no_data' via a new fallback in the existing reason-selection chain, reusing ComponentResult's existing unavailable shape (no new field/type)."
  - "IN-01: deleted faaFacility.client.single.test.ts outright — all its assertions were already covered, in more detail, by faaFacility.client.test.ts."
  - "CR-02 explicitly left as code-unchanged per plan scope; wrote 260813-pvn-CR-02-OPTIONS.md with 3 options and a labeled recommendation (Option 1: remove DAL/AAL/ACA from CARGO_CALLSIGN_PREFIXES) for the user to approve separately."

requirements-completed: [CR-01, WR-01, WR-04, IN-01, IN-02]

coverage:
  - id: D1
    description: "ArcGIS null/undefined/empty-string numeric fields parse to null, never 0 or a fabricated (0,0) coordinate"
    requirement: "CR-01"
    verification:
      - kind: unit
        ref: "src/domain/adapters/faaFacility.test.ts#parses null/undefined ArcGIS numeric fields to null, never 0 or a fabricated coordinate"
        status: pass
    human_judgment: false
  - id: D2
    description: "fetchFaaFacility no_data/error results are never cached; a genuine ok:true success is still cached"
    requirement: "WR-01"
    verification:
      - kind: unit
        ref: "src/domain/adapters/faaFacility.test.ts#never caches a no_data failure result: two consecutive lookups both hit the network"
        status: pass
      - kind: unit
        ref: "src/domain/adapters/faaFacility.test.ts#still caches a genuine ok:true success: two consecutive lookups hit the network only once"
        status: pass
    human_judgment: false
  - id: D3
    description: "A zero-runway facility yields headroom.available===false with reason 'no_data' instead of a value computed against a denominator of 1"
    requirement: "WR-04"
    verification:
      - kind: unit
        ref: "src/domain/scoring/expansionScore.test.ts#case group 7 (WR-04): zero-runway facility yields headroom unavailable with reason no_data"
        status: pass
    human_judgment: false
  - id: D4
    description: "Duplicate faaFacility.client.single.test.ts removed; faaFacility.client.test.ts coverage unchanged"
    requirement: "IN-01"
    verification:
      - kind: unit
        ref: "npx vitest run src/domain/adapters/faaFacility.client.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "CR-02 fix options document with 2-3 options and a labeled recommendation, code unchanged"
    requirement: null
    verification:
      - kind: other
        ref: "grep -c '^## Option' 260813-pvn-CR-02-OPTIONS.md >= 2 && grep -q '^## Recommendation' 260813-pvn-CR-02-OPTIONS.md"
        status: pass
    human_judgment: true
    rationale: "CR-02's proposed fix (removing passenger carriers from the cargo allowlist) requires a user decision, not automated verification — the document is a proposal, not an implemented fix."

duration: 25min
completed: 2026-08-13
status: complete
---

# Quick Task 260813-pvn: Fix Phase 3 Code Review Findings Summary

**Null-safe ArcGIS numeric parsing, non-cached failure results, and explicit zero-runway headroom unavailability, each with a dedicated regression test; duplicate test file deleted; cargo-callsign misclassification (CR-02) left as code-unchanged with a written options doc for the user.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-08-13T15:30:00Z
- **Completed:** 2026-08-13T15:55:24Z
- **Tasks:** 6 (5 code/verification tasks + 1 research/writeup task)
- **Files modified:** 5 (4 modified + 1 created), 1 deleted

## Accomplishments

- Fixed CR-01: `toFiniteOrNull` in `faaFacility.ts` now returns `null` for `null`/`undefined`/`''` before ever calling `Number(v)`, closing the `Number(null) === 0` silent-corruption bug for runway length/width and facility/runway-endpoint lat/lon.
- Fixed WR-01: `fetchFaaFacility`'s `no_data`/`error` branches now throw inside the `withCache` callback instead of returning normally, so `cache.ts`'s existing "only cache what `fn()` resolves to" behavior naturally excludes transient failures from the 24h `FAA_FACILITY_TTL_MS`. `cache.ts` itself is untouched.
- Fixed WR-04: `scoreAirports` now gates `computeHeadroomKpi` on `facility.data.runways.length > 0`; a zero-runway facility yields `headroom.available === false` with `reason === 'no_data'` instead of a value silently computed against a `Math.max(1, 0)` denominator.
- Fixed IN-01: deleted `faaFacility.client.single.test.ts` — fully redundant with `faaFacility.client.test.ts`.
- Fixed IN-02: added the null-numeric-field regression test directly proving the CR-01 fix.
- CR-02 (cargo-callsign misclassification) left with `CARGO_CALLSIGN_PREFIXES`/`isCargoCallsign`/`computeVolumeKpi` byte-for-byte unchanged; wrote `260813-pvn-CR-02-OPTIONS.md` with 3 options and a labeled recommendation for the user.

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix CR-01 (null-safe ArcGIS numeric parsing) with IN-02 regression test** - `fe07132` (fix)
2. **Task 2: Fix WR-01 (stop caching failure results for the full TTL) with regression test** - `2cef82a` (fix)
3. **Task 3: Fix WR-04 (explicit zero-runway headroom unavailability) with regression test** - `dd00a89` (fix)
4. **Task 4: Delete duplicate test file (IN-01)** - `d71c171` (chore)
5. **Task 5: Verify the adapter and scoring suites pass together** - verification only, no commit (read-only task)
6. **Task 6: Propose CR-02 fix options (research/writeup only — no code change)** - `c310a79` (docs)

**Plan metadata:** committed separately by orchestrator (SUMMARY.md/STATE.md not committed by this executor per plan constraints)

## Files Created/Modified

- `src/domain/adapters/faaFacility.ts` - `toFiniteOrNull` early-returns `null` for null/undefined/''; `no_data`/`error` branches inside `withCache`'s callback now throw instead of return
- `src/domain/adapters/faaFacility.test.ts` - added null-numeric-field regression test (CR-01/IN-02) and two cache-behavior regression tests (WR-01)
- `src/domain/scoring/expansionScore.ts` - `computeHeadroomKpi` call site gated on `runways.length > 0`; headroom's unavailable-reason chain adds a `'no_data'` fallback for the zero-runway case; precondition comment added above `computeHeadroomKpi`
- `src/domain/scoring/expansionScore.test.ts` - added zero-runway headroom-unavailable regression test (WR-04), existing case group 6 (CR-02) left untouched
- `src/domain/adapters/faaFacility.client.single.test.ts` - deleted (IN-01)
- `.planning/quick/260813-pvn-fix-code-review-findings-cr-01-wr-01-wr-/260813-pvn-CR-02-OPTIONS.md` - created: 3 CR-02 fix options with a labeled recommendation

## Decisions Made

- CR-01/WR-01/WR-04 fixes were made exactly as scoped in the plan's `<action>` blocks; no deviation from the prescribed approach.
- WR-01's acceptance criteria required `grep -c "throw Object.assign" >= 2` (two distinct inline throw sites), so both failure branches use an inline `throw Object.assign(new Error(reason), { reason: ... satisfies AdapterFailReason })` rather than a shared local helper function — chosen to match the plan's stated verification grep exactly.
- CR-02 left fully untouched in code per explicit plan scope; the options document recommends Option 1 (remove `DAL`/`AAL`/`ACA` from the allowlist) but does not implement it — that is a follow-up decision for the user.

## Deviations from Plan

None - plan executed exactly as written. WR-01's implementation used inline throws rather than the plan action text's illustrative `failWith()` helper suggestion, but this exactly matches the plan's own stated acceptance-criteria grep (`throw Object.assign` count >= 2) and its `done` criterion — not a deviation from the plan's actual verification contract.

## Issues Encountered

None. `npx tsc --noEmit` surfaces 3 pre-existing errors in unrelated, uncommitted Phase 4 files (`src/adapters/llm/gemini.test.ts`, `src/app/api/chat/route.test.ts`, `src/app/api/chat/route.ts` — all referencing a missing `./google`/`@/adapters/llm/google` module); these are out of scope per this plan's explicit file-touch constraints and were left untouched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All five confirmed Phase 3 code review findings (CR-01, WR-01, WR-04, IN-01, IN-02) are resolved and regression-tested; `npx vitest run src/domain/adapters src/domain/scoring` exits 0 with 79 passing tests across 11 files.
- CR-02 remains open pending the user's review of `260813-pvn-CR-02-OPTIONS.md` — `CARGO_CALLSIGN_PREFIXES` still misclassifies Delta/American/Air Canada movements as cargo until the user picks an option and a follow-up task implements it.
- WR-02 (ArcGIS where-clause injection safety enforced only by comment) and WR-03 (`queryFeatures` unchecked non-object body access) from the same code review were NOT in this plan's scope and remain open findings for a future task.

---
*Phase: quick-260813-pvn*
*Completed: 2026-08-13*

## Self-Check: PASSED

All created/modified files found on disk; `faaFacility.client.single.test.ts` confirmed deleted; all 5 task commits (`fe07132`, `2cef82a`, `dd00a89`, `d71c171`, `c310a79`) found in git log.
