---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/middleware/sessionIdValidationCheck.ts
  - src/lib/middleware/sessionIdValidationCheck.test.ts
  - src/proxy.ts
  - src/proxy.test.ts
autonomous: true
requirements: [QUICK-01]
must_haves:
  truths:
    - "POST /api/chat still rejects a missing or non-UUID x-session-id with 400 invalid_session_id, in the same check order as today (after ip rate-limit, before session rate-limit)"
    - "Valid-UUID requests still pass through to sessionRateLimitCheck and then to the route handler exactly as before"
  artifacts:
    - "src/lib/middleware/sessionIdValidationCheck.ts"
    - "src/lib/middleware/sessionIdValidationCheck.test.ts"
  key_links:
    - "src/proxy.ts imports sessionIdValidationCheck and calls it as the second of three checks, between ipRateLimitCheck and sessionRateLimitCheck"
---

<objective>
Extract the inline `z.uuid().safeParse(req.headers.get('x-session-id'))` check that quick task 260820-lx1 added directly in `src/proxy.ts` into its own module, `src/lib/middleware/sessionIdValidationCheck.ts`, matching the existing one-function-per-file pattern already used by `ipRateLimitCheck.ts` and `sessionRateLimitCheck.ts`.

Purpose: consistency — `proxy.ts` currently mixes two extracted checks with one inline check for no structural reason; extracting the third closes that inconsistency and gives the UUID-format guard its own colocated test file instead of living inside `proxy.test.ts`.

Output: `src/lib/middleware/sessionIdValidationCheck.ts` (new, exports `sessionIdValidationCheck(req: NextRequest): Promise<NextResponse | null>`), `src/lib/middleware/sessionIdValidationCheck.test.ts` (new), `src/proxy.ts` (updated to call the extracted function, no longer imports `zod`), `src/proxy.test.ts` (updated to mock the extracted function, moved-out tests removed).

This is a pure refactor — no behavior change. Request handling order, response bodies, and status codes are unchanged.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Current `src/proxy.ts` (as of quick task 260820-lx1, decision logged in STATE.md) runs three checks in order: `ipRateLimitCheck` -> inline UUID format check -> `sessionRateLimitCheck`. The inline check to move:

```
// x-session-id doubles as the rate-limit key (sessionRateLimitCheck.ts) and the
// chat-history lookup key (route.ts's sessionStore), so it is rejected here rather
// than trusted downstream.
const sessionIdCheck = z.uuid().safeParse(req.headers.get('x-session-id'));
if (!sessionIdCheck.success) {
  return NextResponse.json(
    { ok: false, error: { code: 'invalid_session_id', message: 'x-session-id header must be a valid UUID' } },
    { status: 400 },
  );
}
```

Template files to match exactly (structure and test style):
- `src/lib/middleware/ipRateLimitCheck.ts` / no test read needed beyond signature — confirms the `(req: NextRequest): Promise<NextResponse | null>` shape and single-purpose-file pattern.
- `src/lib/middleware/sessionRateLimitCheck.ts` — same shape.
- `src/lib/middleware/sessionRateLimitCheck.test.ts` — exact test style to follow: colocated, `vi.mock` only for modules the function under test actually calls, a local `req(headers)` helper building a `NextRequest` against `http://localhost/api/chat`, one `describe` block named after the function.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extract sessionIdValidationCheck.ts with colocated tests</name>
  <files>src/lib/middleware/sessionIdValidationCheck.ts, src/lib/middleware/sessionIdValidationCheck.test.ts</files>
  <behavior>
    - Missing x-session-id header -> returns a NextResponse with status 400 and body { ok: false, error: { code: 'invalid_session_id', message: 'x-session-id header must be a valid UUID' } }
    - x-session-id present but not a valid UUID (e.g. 'not-a-uuid') -> returns the same 400 response
    - x-session-id present and a valid UUID -> returns null
  </behavior>
  <action>
    Create src/lib/middleware/sessionIdValidationCheck.ts exporting `async function sessionIdValidationCheck(req: NextRequest): Promise<NextResponse | null>`, importing `NextRequest`/`NextResponse` from 'next/server' and `z` from 'zod', matching the file shape of ipRateLimitCheck.ts and sessionRateLimitCheck.ts (single exported function, no other exports). Move the `z.uuid().safeParse(req.headers.get('x-session-id'))` check and its explanatory comment (x-session-id doubling as the rate-limit key and chat-history lookup key) verbatim from src/proxy.ts into this function's body. On `!result.success`, return the same `NextResponse.json({ ok: false, error: { code: 'invalid_session_id', message: 'x-session-id header must be a valid UUID' } }, { status: 400 })` currently produced inline in proxy.ts. On success, return null.

    Create src/lib/middleware/sessionIdValidationCheck.test.ts following sessionRateLimitCheck.test.ts's structure: a local `req(headers)` helper constructing `new NextRequest('http://localhost/api/chat', { headers })`, one `describe('sessionIdValidationCheck', ...)` block. This function calls no other module (no rate limiter, no external state), so no `vi.mock` is needed — call it directly. Write three tests covering the three <behavior> cases above: missing header, malformed UUID string, and a valid UUID (reuse the fixture UUID '123e4567-e89b-12d3-a456-426614174000' from proxy.test.ts for consistency). For the two 400-path tests, assert both `result!.status` and the parsed JSON body equal the exact code/message pair above.
  </action>
  <verify>
    <automated>npm test -- src/lib/middleware/sessionIdValidationCheck.test.ts</automated>
  </verify>
  <done>src/lib/middleware/sessionIdValidationCheck.ts exports sessionIdValidationCheck matching the (req: NextRequest): Promise&lt;NextResponse | null&gt; signature; its test file has 3 passing tests (missing header, malformed UUID, valid UUID) and the suite passes.</done>
</task>

<task type="auto">
  <name>Task 2: Wire sessionIdValidationCheck into proxy.ts and update proxy.test.ts</name>
  <files>src/proxy.ts, src/proxy.test.ts</files>
  <action>
    In src/proxy.ts: add `import { sessionIdValidationCheck } from '@/lib/middleware/sessionIdValidationCheck';` alongside the existing ipRateLimitCheck/sessionRateLimitCheck imports, and remove the now-unused `import { z } from 'zod';` line. Delete the inline `z.uuid().safeParse(...)` block and its comment, replacing it in the same position (after the ipRateLimitCheck short-circuit, before the sessionRateLimitCheck call) with: `const sessionIdBlocked = await sessionIdValidationCheck(req); if (sessionIdBlocked) return sessionIdBlocked;`. Request handling order stays ipRateLimitCheck -> sessionIdValidationCheck -> sessionRateLimitCheck -> NextResponse.next(), unchanged from today.

    In src/proxy.test.ts: add `vi.mock('@/lib/middleware/sessionIdValidationCheck', () => ({ sessionIdValidationCheck: vi.fn() }));` alongside the two existing vi.mock calls, and import sessionIdValidationCheck the same way ipRateLimitCheck/sessionRateLimitCheck are imported. `beforeEach` already calls `vi.resetAllMocks()`, which clears any default implementation — so each of the three surviving tests ('short-circuits on an ip block...', 'returns the session block...', 'passes through when both checks allow') must add an explicit `vi.mocked(sessionIdValidationCheck).mockResolvedValueOnce(null)` alongside their existing mock setup, so sessionIdValidationCheck resolves null (not undefined) in those cases and the assertions on ipRateLimitCheck/sessionRateLimitCheck call counts and final status stay correct. Remove the two tests 'returns 400 invalid_session_id when x-session-id is missing' and 'returns 400 invalid_session_id when x-session-id is not a valid UUID' entirely (their coverage now lives in sessionIdValidationCheck.test.ts) — do not replace them with new assertions on validation logic; the wiring itself is already proven by the three surviving tests once sessionIdValidationCheck is mocked into their control flow.
  </action>
  <verify>
    <automated>npm test -- src/proxy.test.ts src/lib/middleware/sessionIdValidationCheck.test.ts</automated>
  </verify>
  <done>src/proxy.ts no longer imports zod and contains no inline z.uuid() check; it calls sessionIdValidationCheck as the second of three checks in unchanged order; src/proxy.test.ts mocks all three checks, no longer contains the two moved 400-path tests, and its three remaining tests pass with explicit null mocks for sessionIdValidationCheck.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|--------------|
| client -> /api/chat | x-session-id format gate; unchanged by this extraction — still runs before sessionRateLimitCheck and the route handler |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-01 | Tampering | src/lib/middleware/sessionIdValidationCheck.ts | low | accept | Logic is moved verbatim from the working, already-reviewed inline check in proxy.ts (closed CR-02 in 04-REVIEW.md) — this task relocates code into its own file/tests, it does not change the UUID-format gate or its response contract. No new attack surface. |
</threat_model>

<verification>
`npm test` passes in full (proxy.test.ts's 5 remaining tests, sessionIdValidationCheck.test.ts's 3 new tests, and all pre-existing suites unaffected), `npm run typecheck` is clean, and `grep -c "z.uuid" src/proxy.ts` returns 0 (the check now lives only in sessionIdValidationCheck.ts).
</verification>

<success_criteria>
`src/lib/middleware/` contains three structurally identical single-purpose check modules (ipRateLimitCheck, sessionRateLimitCheck, sessionIdValidationCheck), each with its own colocated test file; src/proxy.ts composes all three with no inline validation logic remaining; POST /api/chat behavior (status codes, response bodies, check order) is unchanged from before this refactor.
</success_criteria>

<output>
Create `.planning/quick/260820-mgm-extract-x-session-id-uuid-validation-fro/260820-mgm-SUMMARY.md` when done
</output>
