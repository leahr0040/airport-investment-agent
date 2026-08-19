---
phase: quick
plan: 260819-uzg
subsystem: api
tags: [nextjs, middleware, rate-limiting, rate-limiter-flexible, security]

requires:
  - phase: 04-conversational-agent
    provides: src/app/api/chat/route.ts (the chat endpoint this plan retrofits)
provides:
  - "checkIpRateLimit(ip) — a second, coarser (30/min) RateLimiterMemory-backed limiter alongside the existing per-session checkRateLimit(key) (10/min)"
  - "src/middleware.ts — Node.js-runtime middleware matching only /api/chat, enforcing the IP check then the session check before the route handler ever parses the request body"
  - "src/lib/middleware/ipRateLimitCheck.ts and sessionRateLimitCheck.ts — composable, independently testable check functions middleware.ts threads together"
affects: [api, security-hardening]

tech-stack:
  added: []
  patterns:
    - "Composed middleware checks: each rate-limit concern lives in its own named function (req) => Promise<NextResponse | null>, and the single Next.js-recognized middleware.ts threads them in order rather than inlining all logic in one function body"

key-files:
  created:
    - src/middleware.ts
    - src/middleware.test.ts
    - src/lib/middleware/ipRateLimitCheck.ts
    - src/lib/middleware/ipRateLimitCheck.test.ts
    - src/lib/middleware/sessionRateLimitCheck.ts
    - src/lib/middleware/sessionRateLimitCheck.test.ts
  modified:
    - src/lib/rateLimiter.ts
    - src/lib/rateLimiter.test.ts
    - src/app/api/chat/route.ts
    - src/app/api/chat/route.test.ts

key-decisions:
  - "Dropped the unused `remaining` field from checkRateLimit/checkIpRateLimit's return shape entirely (grep-confirmed no caller read it beyond the two now-removed test assertions) — both functions now resolve Promise<{ allowed: boolean }>, per explicit developer direction mid-execution."
  - "Composed the two rate-limit checks as separate named functions (src/lib/middleware/ipRateLimitCheck.ts, sessionRateLimitCheck.ts) instead of inlining both checks directly in middleware.ts, per explicit developer direction mid-execution. Next.js only recognizes one middleware.ts entry point per project (confirmed: no multi-file middleware mechanism exists), so the composition lives inside that single file, not across multiple Next.js-recognized middleware files."

requirements-completed: [SEC-03]

coverage:
  - id: D1
    description: "checkIpRateLimit(ip) — second, coarser (30/min) rate limiter backing the IP-keyed backstop, sharing consume/error-handling logic with checkRateLimit via a private helper"
    requirement: "SEC-03"
    verification:
      - kind: unit
        ref: "src/lib/rateLimiter.test.ts#checkIpRateLimit"
        status: pass
    human_judgment: false
  - id: D2
    description: "src/middleware.ts enforces the IP check then the session check for POST /api/chat on the Node.js runtime, before the route handler parses the request body, returning the exact prior 429 JSON shape on either rejection"
    requirement: "SEC-03"
    verification:
      - kind: unit
        ref: "src/middleware.test.ts#middleware"
        status: pass
      - kind: unit
        ref: "src/lib/middleware/ipRateLimitCheck.test.ts#ipRateLimitCheck"
        status: pass
      - kind: unit
        ref: "src/lib/middleware/sessionRateLimitCheck.test.ts#sessionRateLimitCheck"
        status: pass
    human_judgment: false
  - id: D3
    description: "src/app/api/chat/route.ts no longer performs its own rate-limit check or imports checkRateLimit; it still computes session for runAgent"
    requirement: "SEC-03"
    verification:
      - kind: unit
        ref: "src/app/api/chat/route.test.ts#POST /api/chat"
        status: pass
    human_judgment: false

duration: 26min
completed: 2026-08-19
status: complete
---

# Quick Task 260819-uzg: Move chat rate limiting into middleware Summary

**Rate limiting for `/api/chat` moved from the route handler into `src/middleware.ts`, with a new coarser IP-keyed backstop (`checkIpRateLimit`, 30/min) checked first, ahead of the existing per-session limiter (`checkRateLimit`, 10/min), so throttling happens before the request body is ever parsed and rotating `x-session-id` can no longer bypass throttling entirely.**

## Performance

- **Duration:** ~26 min
- **Started:** 2026-08-19T22:23:31+03:00
- **Completed:** 2026-08-19T22:49:48+03:00
- **Tasks:** 2
- **Files modified:** 10 (4 modified, 6 created)

## Accomplishments
- `checkIpRateLimit(ip)` added alongside the existing `checkRateLimit(key)`, both delegating to a shared private `consumeRateLimit` helper — no duplicated consume/error-handling logic.
- `src/middleware.ts` (Node.js runtime, matches only `/api/chat`) enforces the IP check first, then the session check, returning the identical `{ok:false, error:{code:'rate_limited', message:'Rate limit exceeded'}}` 429 shape the route handler previously produced — before `req.json()` ever runs.
- `src/app/api/chat/route.ts` no longer imports or calls `checkRateLimit`; it still computes `session` for `runAgent`.
- Rate-limit enforcement logic split into two independently testable, composable functions (`ipRateLimitCheck`, `sessionRateLimitCheck`) rather than inlined in the single Next.js-recognized `middleware.ts` entry point.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add a coarser IP-keyed rate limit alongside the existing session limiter** - `9f4186d` (feat)
2. **Task 2: Create composed rate-limit check functions, thread them through middleware.ts, drop the now-redundant check from route.ts** - `42cd608` (feat)

_Note: no separate test(RED)/feat(GREEN) commit split was made — Task 1 and Task 2 were each committed as a single feat commit containing both the new/changed source and its tests, matching this repo's established quick-task commit granularity (one commit per task, not per TDD sub-step)._

## Files Created/Modified
- `src/lib/rateLimiter.ts` - Added `ipLimiter` (RateLimiterMemory, points: 30/duration: 60) and exported `checkIpRateLimit(ip)`; both exported functions now resolve `Promise<{ allowed: boolean }>` (the unused `remaining` field was dropped)
- `src/lib/rateLimiter.test.ts` - Added `describe('checkIpRateLimit', ...)` mirroring the existing burst/independent-key tests; removed the two now-inapplicable `remaining` assertions
- `src/middleware.ts` - New: Node.js-runtime middleware matching `/api/chat`, composing `ipRateLimitCheck` then `sessionRateLimitCheck`, returning `NextResponse.next()` when both allow
- `src/middleware.test.ts` - New: mocks the two check functions directly, verifies composition order (IP short-circuits before session check runs), the session-block path, and pass-through
- `src/lib/middleware/ipRateLimitCheck.ts` - New: extracts client IP from `x-forwarded-for` (first entry, trimmed, `'unknown'` fallback), calls `checkIpRateLimit`, returns 429-or-null
- `src/lib/middleware/ipRateLimitCheck.test.ts` - New: allowed/blocked/fallback-IP cases
- `src/lib/middleware/sessionRateLimitCheck.ts` - New: reproduces the existing `x-session-id ?? x-forwarded-for ?? 'anon'` fallback chain verbatim (CR-02's tracked collision behavior, not rewritten here), calls `checkRateLimit`, returns 429-or-null
- `src/lib/middleware/sessionRateLimitCheck.test.ts` - New: allowed/blocked/fallback-chain cases
- `src/app/api/chat/route.ts` - Removed `checkRateLimit` import and its 429 branch; `session` computation kept for `runAgent`
- `src/app/api/chat/route.test.ts` - Removed the now-inapplicable `'rejects a session once it exceeds the rate limit'` test (that behavior is now covered by `src/middleware.test.ts` and the two check-function test files)

## Decisions Made
- Dropped the `remaining` field from both rate-limit check functions' return shape (`Promise<{ allowed: boolean }>` only) — confirmed via grep that no caller outside `rateLimiter.ts` and its own tests ever read it.
- Split the middleware logic into two named, independently testable functions (`src/lib/middleware/ipRateLimitCheck.ts`, `sessionRateLimitCheck.ts`) composed by a thin `src/middleware.ts`, rather than inlining both checks in one function body as the plan's `<action>` text originally specified — Next.js only recognizes a single `middleware.ts` entry point per project (no multi-file middleware mechanism exists), so composition happens *inside* that one file via imported functions, not via multiple Next.js-recognized middleware files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test-pollution bug in src/middleware.test.ts causing 2/3 tests to fail**
- **Found during:** Task 2, first verification run
- **Issue:** `vi.mock`'d `ipRateLimitCheck`/`sessionRateLimitCheck` used `mockResolvedValueOnce` per test with no `beforeEach` reset. When a test short-circuited before calling the second mock (e.g. the IP-block test never calls `sessionRateLimitCheck`), that mock's queued once-value leaked unconsumed into the next test, shifting which queued value each subsequent test actually got — causing the session-block test to observe status 200 and the pass-through test to observe status 429.
- **Fix:** Added `beforeEach(() => { vi.resetAllMocks(); })` inside the `describe('middleware', ...)` block so each test starts with clean mocks.
- **Files modified:** src/middleware.test.ts
- **Verification:** `npx vitest run src/middleware.test.ts` — all 3 tests pass
- **Committed in:** 42cd608 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug), plus 2 developer-directed structural changes made mid-execution (documented above under Decisions Made / key-decisions, not auto-fixes — both were explicit instructions, not autonomous deviation-rule judgment calls).
**Impact on plan:** The mock-pollution fix was necessary for the tests to actually verify the composition order they claim to verify — no scope creep. The structural changes (dropping `remaining`, composing via named functions) alter the plan's literal `<action>` text and acceptance-criteria greps but preserve every behavioral truth in `must_haves.truths` and `success_criteria`.

## Issues Encountered

**Plan's literal acceptance-criteria greps no longer apply verbatim.** The plan's Task 2 acceptance criteria included `grep -c "checkIpRateLimit" src/middleware.ts` (expects ≥1) and `grep -c "checkRateLimit" src/middleware.ts` (expects ≥1) — written for the inline-checks version. Since `middleware.ts` now calls `ipRateLimitCheck`/`sessionRateLimitCheck` rather than `checkIpRateLimit`/`checkRateLimit` directly, `grep -c "checkIpRateLimit" src/middleware.ts` returns 0. Verified the equivalent intent by inspection instead: `middleware.ts` imports and calls both composed check functions in the correct order (`grep -n "RateLimitCheck" src/middleware.ts` shows both imports and both calls, IP first), `grep -c "runtime: 'nodejs'" src/middleware.ts` returns 1, and `grep -c "checkRateLimit" src/app/api/chat/route.ts` returns 0 as required. All plan-level `<verification>` block commands (full `vitest run`, `tsc --noEmit`) pass without adjustment.

## Verification Results

- `npx vitest run src/lib/rateLimiter.test.ts src/middleware.test.ts src/lib/middleware/ipRateLimitCheck.test.ts src/lib/middleware/sessionRateLimitCheck.test.ts src/app/api/chat/route.test.ts` — all pass (17 tests across 5 files)
- `npx vitest run` (full suite) — **110/110 tests pass, 21 test files**
- `npx tsc --noEmit` — **zero errors**
- `git status --porcelain` — changes limited to the plan's files plus the two new composed-check files and their tests (a structural deviation from the plan's literal file list, documented above); no unrelated files touched

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- SEC-03 (per-session/IP rate limiting on the chat endpoint, enforced before body parsing) is now fully in place and covered by tests.
- CR-02 (the `x-session-id ?? x-forwarded-for ?? 'anon'` fallback's cross-user collision potential) remains open, reproduced verbatim in `sessionRateLimitCheck.ts` as before — tracked separately, not addressed by this task.

---
*Phase: quick/260819-uzg*
*Completed: 2026-08-19*

## Self-Check: PASSED

All created/modified files found on disk; both task commits (`9f4186d`, `42cd608`) confirmed present in `git log`.
