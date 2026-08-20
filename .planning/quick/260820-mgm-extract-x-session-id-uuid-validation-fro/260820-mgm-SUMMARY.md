---
phase: quick
plan: 01
subsystem: api
tags: [nextjs, proxy, zod, middleware, refactor]

requires:
  - phase: quick-260820-lx1
    provides: "The inline z.uuid() x-session-id validation check in proxy.ts that this task extracts"
provides:
  - "src/lib/middleware/sessionIdValidationCheck.ts as a third structurally-identical single-purpose check module alongside ipRateLimitCheck.ts and sessionRateLimitCheck.ts"
affects: [proxy, middleware]

tech-stack:
  added: []
  patterns: ["One check per file under src/lib/middleware/, each async (req: NextRequest) => Promise<NextResponse | null>, composed in proxy.ts"]

key-files:
  created:
    - src/lib/middleware/sessionIdValidationCheck.ts
    - src/lib/middleware/sessionIdValidationCheck.test.ts
  modified:
    - src/proxy.ts
    - src/proxy.test.ts

key-decisions:
  - "Pure refactor, no behavior change - extraction preserves check order (ipRateLimitCheck -> sessionIdValidationCheck -> sessionRateLimitCheck) and identical response bodies/status codes"

patterns-established:
  - "Third middleware check module completes the one-function-per-file convention in src/lib/middleware/, closing the prior inconsistency where two checks were extracted and one was inline"

requirements-completed: [QUICK-01]

coverage:
  - id: D1
    description: "sessionIdValidationCheck.ts extracted with 3 colocated tests (missing header, malformed UUID, valid UUID)"
    requirement: "QUICK-01"
    verification:
      - kind: unit
        ref: "src/lib/middleware/sessionIdValidationCheck.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "proxy.ts wired to call sessionIdValidationCheck instead of inline z.uuid() check; proxy.test.ts updated to mock all three checks with the two moved 400-path tests removed"
    requirement: "QUICK-01"
    verification:
      - kind: unit
        ref: "src/proxy.test.ts"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-08-20
status: complete
---

# Quick Task 260820-mgm: Extract sessionIdValidationCheck middleware Summary

**Moved the inline `z.uuid()` x-session-id format check out of `proxy.ts` into its own `src/lib/middleware/sessionIdValidationCheck.ts` module with colocated tests, matching the existing `ipRateLimitCheck`/`sessionRateLimitCheck` one-function-per-file pattern.**

## Performance

- **Duration:** 12 min
- **Tasks:** 2 completed
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `src/lib/middleware/sessionIdValidationCheck.ts` exports `sessionIdValidationCheck(req): Promise<NextResponse | null>`, structurally identical to the other two check modules
- 3 new colocated tests covering missing header, malformed UUID, and valid UUID
- `proxy.ts` composes all three checks (`ipRateLimitCheck` -> `sessionIdValidationCheck` -> `sessionRateLimitCheck`) with no inline validation logic and no `zod` import
- `proxy.test.ts` reduced to its 3 wiring tests (ip-block short-circuit, session-block passthrough, full passthrough), mocking all three checks; the two moved 400-path tests were deleted, their coverage now lives in `sessionIdValidationCheck.test.ts`

## Task Commits

1. **Task 1: Extract sessionIdValidationCheck.ts with colocated tests** - `e86275e` (feat)
2. **Task 2: Wire sessionIdValidationCheck into proxy.ts and update proxy.test.ts** - `0e32259` (refactor)

## Files Created/Modified
- `src/lib/middleware/sessionIdValidationCheck.ts` - Extracted UUID-format check, returns 400 invalid_session_id or null
- `src/lib/middleware/sessionIdValidationCheck.test.ts` - 3 colocated tests (missing header, malformed UUID, valid UUID)
- `src/proxy.ts` - Calls sessionIdValidationCheck as the second of three checks; no longer imports zod
- `src/proxy.test.ts` - Mocks all three checks; two moved 400-path tests removed, 3 remaining tests updated with explicit null mocks

## Decisions Made
None - followed plan as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
`src/lib/middleware/` now contains three structurally identical single-purpose check modules (`ipRateLimitCheck`, `sessionRateLimitCheck`, `sessionIdValidationCheck`), each with its own colocated test file. `src/proxy.ts` composes all three with no inline validation logic remaining. No blockers.

---
*Phase: quick*
*Completed: 2026-08-20*

## Self-Check: PASSED

- FOUND: src/lib/middleware/sessionIdValidationCheck.ts
- FOUND: src/lib/middleware/sessionIdValidationCheck.test.ts
- FOUND commit: e86275e
- FOUND commit: 0e32259
