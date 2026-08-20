---
phase: 04-conversational-agent
plan: 02
subsystem: api
tags: [gemini, tool-calling, opensky, faa, scoring, sec-04]

requires:
  - phase: 04-conversational-agent
    provides: "Working chat agent (04-PLAN.md/04-SUMMARY.md) - Gemini native tool-calling over resolve_region/score_airports, session memory, rate limiting"
provides:
  - "flight_destinations tool exposing real OpenSky per-flight destination ICAO codes (QUERY-03)"
  - "runway_conditions tool exposing real FAA runway geometry and SEC-04-safe classified delay events (QUERY-04)"
  - "VolumeKpi.window and VolumeKpi.measuredVsProxied threaded through score_airports tool results (QUERY-05)"
  - "Exported, extended SYSTEM_PROMPT requiring window/proxy/estimate disclosure on every airport-specific answer"
affects: [04-conversational-agent verification, any future phase touching tools.ts or google.ts]

tech-stack:
  added: []
  patterns:
    - "New agent tools follow the existing TOOL_DECLARATIONS/TOOL_HANDLERS/{name}Tool async-function pattern from resolve_region/score_airports"
    - "SEC-04 boundary: upstream free-text (NasStatusEvent.reason/.raw) is reduced to a fixed enum (classifyDelayType) and a character-allowlist (sanitizeTimestampLike) before reaching any tool result, never forwarded verbatim"

key-files:
  created: []
  modified:
    - src/domain/scoring/expansionScore.ts
    - src/domain/scoring/expansionScore.test.ts
    - src/domain/agent/tools.ts
    - src/domain/agent/tools.test.ts
    - src/adapters/llm/google.ts

key-decisions:
  - "No deterministic distance/great-circle/runway-pairing computation added anywhere - flight_destinations and runway_conditions expose raw coordinates/codes only; the LLM makes the distance/separation judgment itself and must label it as its own estimate, per explicit user decision in 04-CONTEXT.md"
  - "runwayConditionsTool fetches fetchFaaFacility and fetchNasStatus independently via Promise.all so one source failing does not blank the other's half of the result, matching buildScoringInputs' existing per-source failure-isolation pattern"
  - "User declined the plan's proposed new SYSTEM_PROMPT-content test in google.test.ts during Task 3 review; SYSTEM_PROMPT was still exported and extended with all required disclosure language, verified manually by grep instead of an automated assertion"

patterns-established:
  - "classifyDelayType/sanitizeTimestampLike as the sanitization primitives for any future tool that surfaces FAA NAS Status free text"

requirements-completed: [QUERY-03, QUERY-04, QUERY-05]

coverage:
  - id: D1
    description: "score_airports tool result carries the real OpenSky data window and an explicit measured-vs-proxied disclosure (QUERY-05)"
    requirement: "QUERY-05"
    verification:
      - kind: unit
        ref: "src/domain/scoring/expansionScore.test.ts#case group 8 (QUERY-05)"
        status: pass
    human_judgment: false
  - id: D2
    description: "flight_destinations tool exposes real per-flight arrival ICAO codes, filtered through isValidIcao (QUERY-03)"
    requirement: "QUERY-03"
    verification:
      - kind: unit
        ref: "src/domain/agent/tools.test.ts#flightDestinationsTool"
        status: pass
    human_judgment: false
  - id: D3
    description: "runway_conditions tool exposes real runway geometry and SEC-04-safe classified/sanitized delay events (QUERY-04)"
    requirement: "QUERY-04"
    verification:
      - kind: unit
        ref: "src/domain/agent/tools.test.ts#runwayConditionsTool"
        status: pass
    human_judgment: false
  - id: D4
    description: "SYSTEM_PROMPT requires disclosure of data window, proxy status, and estimate provenance for the two new tools"
    requirement: "QUERY-05"
    verification: []
    human_judgment: true
    rationale: "User declined the plan's automated SYSTEM_PROMPT-content test during execution; prompt wording was verified by manual grep, not an automated assertion - a human should confirm the disclosure requirements are actually being honored in a live chat response."

duration: 25min
completed: 2026-08-20
status: complete
---

# Phase 04 Plan 02: Gap-closure - flight destinations, runway conditions, disclosure Summary

**Two new Gemini tools (flight_destinations, runway_conditions) exposing real OpenSky/FAA data with a SEC-04-safe delay-event sanitizer, plus a threaded data-window/proxy disclosure through VolumeKpi and an extended SYSTEM_PROMPT requiring the agent to disclose data windows, proxy status, and estimate provenance.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-08-20T12:20:00Z
- **Completed:** 2026-08-20T12:45:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- `VolumeKpi` now carries `window` and `measuredVsProxied`, reaching every `score_airports` tool result with zero wiring changes elsewhere (QUERY-05)
- `flight_destinations` tool surfaces real, validated OpenSky arrival-airport ICAO codes for an airport's departures (QUERY-03)
- `runway_conditions` tool surfaces real FAA runway endpoint geometry and a sanitized, classified `DelayEventSummary[]` that never leaks `NasStatusEvent.reason`/`.raw` (QUERY-04)
- `SYSTEM_PROMPT` exported and extended to require window/proxy disclosure on every airport-specific answer, plus estimate-provenance labeling for long-haul-share and runway-separation judgments

## Task Commits

1. **Task 1: Thread the OpenSky data window and a proxy disclosure through the scoring engine (QUERY-05)** - `e5f9f59` (feat)
2. **Task 2: Add flight_destinations and runway_conditions tools exposing real raw data through a SEC-04-safe projection (QUERY-03, QUERY-04)** - `e5eb8c6` (feat)
3. **Task 3: Extend SYSTEM_PROMPT to require window/proxy/estimate disclosure on every airport-specific answer (QUERY-03, QUERY-04, QUERY-05)** - `2e035d5` (feat)

_Note: Tasks 1 and 2 are marked `tdd="true"` in the plan, but were committed as single feat commits combining tests and implementation rather than separate RED/GREEN commits — see Deviations below._

## Files Created/Modified
- `src/domain/scoring/expansionScore.ts` - `VolumeKpi.window`/`.measuredVsProxied`, exported `VOLUME_PROXY_DISCLOSURE`
- `src/domain/scoring/expansionScore.test.ts` - two new case-group-8 assertions for window/disclosure threading
- `src/domain/agent/tools.ts` - `flightDestinationsTool`, `runwayConditionsTool`, `classifyDelayType`, `sanitizeTimestampLike`, new types, two new `TOOL_DECLARATIONS`/`TOOL_HANDLERS` entries
- `src/domain/agent/tools.test.ts` - tests for both new tools, `classifyDelayType`, `sanitizeTimestampLike`, and a `TOOL_DECLARATIONS` count assertion
- `src/adapters/llm/google.ts` - `SYSTEM_PROMPT` exported and extended with disclosure/estimate-provenance instructions

## Decisions Made
- No code-side distance/geometry computation added anywhere (per 04-CONTEXT.md's explicit prohibition) - both new tools return raw coordinates/codes and rely on the LLM to make and label its own distance/separation estimates.
- `runwayConditionsTool` fetches its two upstream sources independently via `Promise.all`, so one adapter failing (e.g. `fetchFaaFacility` returning `no_data`) does not blank the other half (`delayEvents`) of the result.

## Deviations from Plan

### Auto-fixed Issues

None - no bugs, missing critical functionality, or blocking issues were found beyond what the plan already specified.

### Other Deviations

**1. [Rule 4-adjacent, user-directed scope reduction] Skipped the plan's proposed SYSTEM_PROMPT-content test**
- **Found during:** Task 3 (SYSTEM_PROMPT extension)
- **Issue:** The plan's `<action>` called for a new test in `google.test.ts` asserting SYSTEM_PROMPT contains `window`, `proxied`/`proxy`, `flight_destinations`, `runway_conditions`, and `estimate` (case-insensitively).
- **Fix:** User explicitly declined this edit during review ("no need system prompt test"). `SYSTEM_PROMPT` was still exported and extended with all five required disclosure elements; presence was verified manually instead of via an automated test.
- **Files affected:** `src/adapters/llm/google.test.ts` (left unmodified - all 4 existing `describe('runAgent', ...)` cases still pass)
- **Verification:** Manual review of the exported `SYSTEM_PROMPT` string confirms it contains all five required substrings.
- **Committed in:** N/A (test not added)

**2. [Process deviation] Tasks 1 and 2 did not follow strict TDD RED/GREEN commit separation**
- **Found during:** Task 1 (already staged in the working tree at plan start) and Task 2 (implemented directly)
- **Issue:** Both tasks are marked `tdd="true"`, which calls for a `test(...)` commit (failing tests) followed by a `feat(...)` commit (passing implementation).
- **Fix:** Task 1's changes were discovered already staged as a single test+implementation diff from a prior session (verified passing before being committed here); Task 2's tests and implementation were written together and committed as one `feat(04-02)` commit. Behavior is equivalent (both are covered by passing tests before commit), but the RED-phase failing-test proof step was not separately captured in git history.
- **Files affected:** `src/domain/scoring/expansionScore.ts`/`.test.ts`, `src/domain/agent/tools.ts`/`.test.ts`
- **Verification:** All new and existing tests pass; `npx tsc --noEmit` clean.
- **Committed in:** `e5f9f59`, `e5eb8c6`

---

**Total deviations:** 2 (1 user-directed scope reduction, 1 process deviation)
**Impact on plan:** No functional impact - all three tasks' behavior, acceptance criteria, and success criteria are met. The dropped test was a single meta-test over prompt text content; the TDD commit-shape deviation does not affect the shipped code's correctness, only its git-history granularity.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- QUERY-03, QUERY-04, QUERY-05 gaps from `04-VERIFICATION.md` are closed: real per-flight destination data, real runway/delay data, and window/proxy/estimate disclosure are all wired end-to-end into the agent's tool set and system prompt.
- CHAT-02 (structured score rendering) remains explicitly out of scope - `git diff --stat` on `src/app/api/chat/route.ts`/`src/app/page.tsx` is empty, confirming no drift into that scope.
- A human should do a live chat pass against the running app to confirm the model actually honors the new disclosure instructions in practice (tracked as coverage item D4, `human_judgment: true`).
- Full suite: 119/119 tests pass; `npx tsc --noEmit` clean; geometry-computation grep across `src/domain`/`src/adapters` returns no matches.

---
*Phase: 04-conversational-agent*
*Completed: 2026-08-20*
