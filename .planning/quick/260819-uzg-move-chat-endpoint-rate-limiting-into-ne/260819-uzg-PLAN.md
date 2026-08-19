---
phase: quick
plan: 260819-uzg
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/rateLimiter.ts
  - src/lib/rateLimiter.test.ts
  - src/middleware.ts
  - src/middleware.test.ts
  - src/app/api/chat/route.ts
  - src/app/api/chat/route.test.ts
autonomous: true
requirements: [SEC-03]
must_haves:
  truths:
    - "A request to POST /api/chat is rate-limited before its JSON body is ever parsed by the route handler"
    - "Rotating x-session-id on every request cannot bypass throttling entirely, because a coarser IP-keyed limit still applies"
    - "A rate-limited request receives the exact same 429 response shape the route handler previously produced: {ok:false, error:{code:'rate_limited', message:'Rate limit exceeded'}}"
    - "route.ts no longer performs rate limiting itself; that responsibility lives solely in middleware.ts"
  artifacts:
    - src/lib/rateLimiter.ts
    - src/middleware.ts
  key_links:
    - "src/middleware.ts imports checkRateLimit and checkIpRateLimit from src/lib/rateLimiter.ts and calls the IP check before the session check"
    - "export const config in middleware.ts matches only /api/chat and pins runtime: 'nodejs' so its in-memory RateLimiterMemory instances share process state with the route handler (Edge runtime would run in a separate isolate and silently defeat the shared in-memory limiter)"
    - "src/app/api/chat/route.ts still computes session (same x-session-id ?? x-forwarded-for ?? 'anon' fallback) for runAgent(session, query), but no longer imports checkRateLimit"
---

<objective>
Move the chat endpoint's rate limiting out of the route handler (`src/app/api/chat/route.ts`) and into `src/middleware.ts`, so throttling happens before JSON body parsing, and add a second, coarser IP-keyed rate limit alongside the existing per-session one so rotating `x-session-id` cannot bypass throttling entirely.

Purpose: per CLAUDE.md's security constraint, the chat endpoint must be "rate-limited per session so a single client cannot exhaust upstream API quota or LLM budget" (SEC-03). Today that check runs inside the route handler, after `req.json()` has already parsed the body — a rejected request still paid the parsing cost, and a client that simply rotates its self-reported `x-session-id` header defeats the per-session limiter entirely (the header is client-controlled with no identity guarantee). Running the check in middleware rejects abusive traffic earlier, and a second coarser IP-keyed limiter closes the session-rotation gap as a backstop (not a replacement for per-session fairness, since `x-forwarded-for` is itself a spoofable, proxy-dependent header).

Output: `src/lib/rateLimiter.ts` exports a new `checkIpRateLimit(ip: string)` alongside the existing `checkRateLimit(key: string)`, sharing their consume/error-handling logic. `src/middleware.ts` is a new file that runs both checks (IP first, then session) for `/api/chat` only, on the Node.js runtime, returning the identical 429 JSON shape the route handler used to produce. `src/app/api/chat/route.ts` drops its own rate-limit check and the now-unused `checkRateLimit` import, keeping only the `session` computation it still needs for `runAgent`.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/lib/rateLimiter.ts
@src/lib/rateLimiter.test.ts
@src/app/api/chat/route.ts
@src/app/api/chat/route.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add a coarser IP-keyed rate limit alongside the existing session limiter</name>
  <files>src/lib/rateLimiter.ts, src/lib/rateLimiter.test.ts</files>
  <behavior>
    - checkIpRateLimit(ip) allows up to 30 calls for the same ip within the window, then blocks the 31st with {allowed: false, remaining: 0} (new test, mirrors the existing burst-capacity test shape for checkRateLimit).
    - checkIpRateLimit tracks separate ip keys independently — two different ips are each allowed on their first call (new test, mirrors the existing "tracks separate session keys independently" test).
    - checkRateLimit's existing behavior (10-request burst capacity, independent keys, rejection-vs-real-error handling) is unchanged — every existing rateLimiter.test.ts assertion still passes with no edits to its expectations.
  </behavior>
  <action>
In `src/lib/rateLimiter.ts`, keep the existing `limiter` (`RateLimiterMemory({ points: 10, duration: 60 })`) and its preceding comment completely untouched. Add a second module-level `RateLimiterMemory` instance named `ipLimiter`, constructed with `{ points: 30, duration: 60 }`, preceded by a one-line comment explaining it is a coarser IP-keyed backstop (not the primary fairness mechanism) so that rotating the client-supplied session identifier cannot bypass throttling entirely.

Extract the current `checkRateLimit` function body (the try/consume/catch block that distinguishes a `RateLimiterRes` rejection from a real thrown `Error`) into a private, non-exported async helper — e.g. `consumeRateLimit(limiterInstance: RateLimiterMemory, key: string): Promise<{ allowed: boolean; remaining: number }>` — containing that exact logic unchanged. Rewrite `checkRateLimit(key: string)` to a one-line delegation to `consumeRateLimit(limiter, key)`. Add and export a new `checkIpRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number }>` that delegates to `consumeRateLimit(ipLimiter, ip)`. Both exported functions keep their exact current return shape (`{ allowed: boolean; remaining: number }`) and error-propagation behavior (a real `Error` from `consume()` still propagates, only a `RateLimiterRes` rejection maps to `{allowed: false, remaining: 0}`).

Do not touch the top-of-file comment above the existing `limiter` declaration describing its steady-rate/burst framing — that is a separately tracked finding (IN-01), out of scope here.

In `src/lib/rateLimiter.test.ts`, add a new `describe('checkIpRateLimit', ...)` block after the existing `describe('checkRateLimit', ...)` block, importing `checkIpRateLimit` alongside the existing `checkRateLimit` import. Mirror the two existing test cases' structure and randomized-key pattern (`` `ip-burst-${Date.now()}-${Math.random()}` `` etc.) but loop 30 times (not 10) before asserting the 31st call is blocked, matching `ipLimiter`'s `points: 30`.
  </action>
  <verify>
    <automated>cd "<repo-root>" &amp;&amp; npx vitest run src/lib/rateLimiter.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "checkIpRateLimit" src/lib/rateLimiter.ts` returns at least 2 (declared and exported).
    - `grep -c "points: 30" src/lib/rateLimiter.ts` returns 1.
    - `npx vitest run src/lib/rateLimiter.test.ts` exits 0, including the new `checkIpRateLimit` tests and every pre-existing `checkRateLimit` test unchanged.
  </acceptance_criteria>
  <done>src/lib/rateLimiter.ts exports checkIpRateLimit(ip) backed by a separate, looser RateLimiterMemory instance (points: 30, duration: 60), sharing its consume/error-handling logic with checkRateLimit via a private helper; both functions' pre-existing external behavior is unchanged; rateLimiter.test.ts covers the new function's burst-then-block and independent-key behavior.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create src/middleware.ts to enforce both limits before body parsing, and drop the now-redundant check from route.ts</name>
  <files>src/middleware.ts, src/middleware.test.ts, src/app/api/chat/route.ts, src/app/api/chat/route.test.ts</files>
  <behavior>
    - middleware(req) checks the IP limit first; when checkIpRateLimit resolves {allowed: false}, it returns a 429 Response with body {ok:false, error:{code:'rate_limited', message:'Rate limit exceeded'}} and never calls checkRateLimit (new test, via a mocked '@/lib/rateLimiter').
    - middleware(req) checks the session limit second; when checkIpRateLimit allows but checkRateLimit resolves {allowed: false}, it returns the same 429 shape (new test).
    - middleware(req) returns a pass-through response (status 200, no rate_limited body) when both checks allow (new test).
    - POST /api/chat still returns the agent's narrative for a valid request (existing route.test.ts cases, unchanged) — route.ts no longer performs its own rate-limit rejection, since that responsibility now lives in middleware.ts.
  </behavior>
  <action>
Create `src/middleware.ts`. Import `NextRequest` and `NextResponse` from `'next/server'`, and `checkRateLimit`, `checkIpRateLimit` from `'@/lib/rateLimiter'`. Export an async function `middleware(req: NextRequest)`.

Inside, extract the client IP from `req.headers.get('x-forwarded-for')`: split on `,`, take the first entry, `.trim()` it; if the header is absent or the trimmed first entry is empty, fall back to the literal `'unknown'` — never throw. Immediately above this line, add a one-line `// ponytail:` comment noting `x-forwarded-for` is a spoofable, client-influenceable header used only as a coarse abuse-cost backstop, not an identity guarantee, unless the app sits behind a trusted proxy that overwrites it.

Call `await checkIpRateLimit(ip)` first. If `!result.allowed`, return `NextResponse.json({ ok: false, error: { code: 'rate_limited', message: 'Rate limit exceeded' } }, { status: 429 })` immediately — do not call `checkRateLimit` in this branch.

Otherwise compute `session` using the exact same fallback chain currently in `route.ts`: `req.headers.get('x-session-id') ?? req.headers.get('x-forwarded-for') ?? 'anon'`. This task does not change that fallback's collision behavior (tracked separately as CR-02) — reproduce it verbatim, do not rewrite it. Call `await checkRateLimit(String(session))`. If `!result.allowed`, return the identical 429 JSON shape used above.

If both checks allow, `return NextResponse.next()`.

Below the function, export `export const config = { matcher: '/api/chat', runtime: 'nodejs' };` — Node.js runtime (not Edge) so this middleware's `RateLimiterMemory` instances share in-process memory with the `/api/chat` route handler; Edge middleware runs in a separate isolate and would silently defeat the shared in-memory limiter.

In `src/app/api/chat/route.ts`, remove the `import { checkRateLimit } from '@/lib/rateLimiter';` line, and remove the `session`-derived `rateLimitResult` check and its 429 branch. Keep the `session` computation itself (`req.headers.get('x-session-id') ?? req.headers.get('x-forwarded-for') ?? 'anon'`) exactly as-is, since `runAgent(session, query)` still needs it — only the rate-limit call and its rejection branch are removed.

In `src/app/api/chat/route.test.ts`, remove the `'rejects a session once it exceeds the rate limit'` test case — route.ts no longer enforces rate limiting itself, so this behavior is no longer testable at this layer (it is now covered by the new `src/middleware.test.ts`). Leave the file's other two test cases untouched.

Create `src/middleware.test.ts`, colocated next to `middleware.ts` per this repo's test convention. Mock `'@/lib/rateLimiter'` with `vi.mock('@/lib/rateLimiter', () => ({ checkRateLimit: vi.fn(), checkIpRateLimit: vi.fn() }))`, import the mocked `checkRateLimit`/`checkIpRateLimit` plus `middleware` from `'./middleware'`, and build requests with `new NextRequest('http://localhost/api/chat', { headers: {...} })` imported from `'next/server'`. Cover the three behaviors listed above: IP-block short-circuits before the session check runs (assert `checkRateLimit` was not called via `toHaveBeenCalledTimes(0)`), session-block after an IP-allow, and pass-through (assert `res.status` is `200`) when both mocks resolve `{ allowed: true, remaining: 1 }`. For the two 429 cases, assert both `res.status` is `429` and the parsed JSON body deep-equals `{ ok: false, error: { code: 'rate_limited', message: 'Rate limit exceeded' } }`.
  </action>
  <verify>
    <automated>cd "<repo-root>" &amp;&amp; npx vitest run src/middleware.test.ts src/app/api/chat/route.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "checkIpRateLimit" src/middleware.ts` returns at least 1, and `grep -c "checkRateLimit" src/middleware.ts` returns at least 1.
    - `grep -c "runtime: 'nodejs'" src/middleware.ts` returns 1.
    - `grep -c "checkRateLimit" src/app/api/chat/route.ts` returns 0 — route.ts no longer imports or calls it.
    - `npx vitest run src/middleware.test.ts src/app/api/chat/route.test.ts` exits 0.
  </acceptance_criteria>
  <done>src/middleware.ts checks the IP limit then the session limit for /api/chat on the Node.js runtime, short-circuiting to the exact prior 429 JSON shape on either rejection and calling NextResponse.next() otherwise; src/app/api/chat/route.ts no longer performs rate limiting (still computes session for runAgent); route.test.ts's now-inapplicable rate-limit test is removed; new src/middleware.test.ts covers IP-block, session-block, and pass-through.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|--------------|
| Client → `POST /api/chat` | Untrusted client controls `x-session-id` and (absent a trusted reverse proxy) can influence `x-forwarded-for`; both are used only as rate-limit keys, never as an identity or authorization signal. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-uzg-01 | Denial of Service | `/api/chat` (session-keyed rate limiting) | medium | mitigate | A client that rotates its self-reported `x-session-id` on every request previously bypassed per-session throttling entirely, exhausting upstream (OpenSky/FAA) quota and LLM budget. `middleware.ts` adds a second, coarser `checkIpRateLimit` check (30 req/min) that still applies regardless of session-id rotation, and runs both checks before JSON body parsing so a rejected burst never reaches `runAgent`. |
| T-quick-uzg-02 | Tampering | `x-forwarded-for` header (rate-limit key) | low | accept | The header is client-influenceable when the app is not behind a trusted proxy that overwrites it, so it cannot serve as an identity guarantee. Accepted here because its only role is a coarse abuse-cost backstop layered on top of the primary per-session limiter, not an authorization or identity control — documented inline via a `// ponytail:` comment at the extraction site. |
</threat_model>

<verification>
- `cd "<repo-root>" &amp;&amp; npx vitest run src/lib/rateLimiter.test.ts src/middleware.test.ts src/app/api/chat/route.test.ts` exits 0.
- `cd "<repo-root>" &amp;&amp; npx vitest run` (full suite) exits 0 — confirms no other caller of `checkRateLimit` regresses.
- `cd "<repo-root>" &amp;&amp; npx tsc --noEmit` reports zero errors.
- `git status --porcelain` shows changes limited to `src/lib/rateLimiter.ts`, `src/lib/rateLimiter.test.ts`, `src/middleware.ts`, `src/middleware.test.ts`, `src/app/api/chat/route.ts`, `src/app/api/chat/route.test.ts`.
</verification>

<success_criteria>
- `src/middleware.ts` matches only `/api/chat`, runs on the Node.js runtime, and rejects a request before its body is parsed by the route handler when either the IP or session rate limit is exceeded, returning the exact prior `{ok:false, error:{code:'rate_limited', message:'Rate limit exceeded'}}` 429 shape.
- `src/lib/rateLimiter.ts` exports both `checkRateLimit` (session, 10/min) and the new `checkIpRateLimit` (IP, 30/min, coarser backstop), sharing consume/error-handling logic without over-abstracting.
- `src/app/api/chat/route.ts` no longer imports or calls `checkRateLimit`; it still computes `session` for `runAgent`.
- All tests pass (`npx vitest run`), and `npx tsc --noEmit` is clean.
</success_criteria>

<output>
Create `.planning/quick/260819-uzg-move-chat-endpoint-rate-limiting-into-ne/260819-uzg-SUMMARY.md` when done.
</output>
