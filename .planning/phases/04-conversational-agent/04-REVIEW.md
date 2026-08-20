---
phase: 04-conversational-agent
reviewed: 2026-08-20T00:00:00Z
depth: quick
files_reviewed: 12
files_reviewed_list:
  - src/adapters/llm/google.ts
  - src/adapters/llm/sessionStore.ts
  - src/app/api/chat/route.ts
  - src/app/page.tsx
  - src/config/env.ts
  - src/domain/agent/tools.test.ts
  - src/domain/agent/tools.ts
  - src/domain/scoring/buildScoringInputs.ts
  - src/domain/scoring/expansionScore.test.ts
  - src/domain/scoring/expansionScore.ts
  - src/instrumentation.ts
  - src/lib/rateLimiter.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-08-20T00:00:00Z
**Depth:** quick
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Reviewed the conversational-agent phase's LLM adapter, chat API route, tool-dispatch layer, and the deterministic scoring engine. The scoring engine (`expansionScore.ts`, `buildScoringInputs.ts`) is well-structured and matches its test suite. Both originally-reported Critical findings have since been resolved or corrected — see below. Remaining findings are quality/robustness warnings (empty-body validation hole, unhandled tool-call exceptions, no `icaos` array cap) and two Info-level notes; none are security-blocking.

## Critical Issues (resolved)

### CR-01: ~~Chat endpoint has no rate limiting~~ — FALSE POSITIVE, corrected 2026-08-20

**File:** `src/app/api/chat/route.ts:1-23`
**Original claim:** The quick-depth reviewer grepped for direct call-sites of `checkRateLimit`/`checkIpRateLimit` inside `route.ts`, found none, and concluded rate limiting was unenforced.
**Correction:** This missed `src/proxy.ts` — Next.js 16's file-convention replacement for `middleware.ts` (renamed from `middleware.ts` in commit `1829d96`). `proxy.ts` exports `proxy(req)` with `config.matcher: '/api/chat'`, so Next.js invokes it automatically on every request to that route *before* `route.ts` runs, with no import required in `route.ts` itself. It already calls both `ipRateLimitCheck` and `sessionRateLimitCheck` (wired in by an earlier quick task, `260819-uzg`). Both rate limiters are, and were, enforced. No code change needed.

### CR-02: Unauthenticated, client-supplied session id allows cross-user chat session hijack — FIXED 2026-08-20

**File:** `src/app/api/chat/route.ts:16` (originally); fix landed in `src/proxy.ts`
**Issue:** `const session = req.headers.get('x-session-id') ?? req.headers.get('x-forwarded-for') ?? 'anon';` — this value was used directly as the key into `sessionStore`'s in-memory `Map<string, {chat, expiresAt}>` (`src/adapters/llm/sessionStore.ts:10-19`), with no signature, cookie, or ownership check of any kind. Any caller could set `x-session-id` to a value they observed or guessed and thereby read/continue another user's active conversation; callers that omitted the header fell back to the spoofable `x-forwarded-for` or the literal `'anon'`, silently merging unrelated anonymous users onto one shared conversation.
**Fix (quick task `260820-lx1`, commits `33b36d5`, `f8e9941`):** `proxy.ts` now validates `x-session-id` as a strict UUID via Zod's `z.uuid()` immediately after the IP rate-limit check and before the session rate-limit check, returning `400 invalid_session_id` for anything missing or malformed — no generated fallback is substituted. `sessionRateLimitCheck.ts` and `route.ts` dropped their independent `x-forwarded-for`/`'anon'` fallback chains, since `proxy.ts`'s `config.matcher: '/api/chat'` guarantees a valid header by the time either runs. Verified: 121/121 tests pass, `tsc --noEmit` clean.

## Warnings

### WR-01: Request body validation is neutered by `.partial()`, letting malformed/empty bodies reach the LLM

**File:** `src/app/api/chat/route.ts:7-10`
**Issue:** `const BodySchema = z.object({ query: z.string().min(1) }).partial();` makes `query` optional, discarding the `min(1)` requirement whenever the key is absent. Combined with `body = await req.json().catch(() => ({}))`, a request with no body, an empty body `{}`, or unparsable JSON all pass `safeParse` successfully (`parsedBody.success === true`), and the handler proceeds to call `runAgent(session, '')` with an empty query — invoking the Gemini API — instead of returning the 400 the code clearly intends for invalid input. The `if (!parsedBody.success)` 400-path is effectively unreachable for the "no query provided" case, only firing when `query` is present but not a string, or an empty string is explicitly sent (since `min(1)` still applies when the key exists).
**Fix:**
```ts
const BodySchema = z.object({ query: z.string().min(1) });
const parsedBody = BodySchema.safeParse(body);
if (!parsedBody.success) {
  return NextResponse.json({ ok: false, error: { code: 'invalid_request', message: 'Expected {query: string}' } }, { status: 400 });
}
const query = parsedBody.data.query;
```

### WR-02: A single malformed/failing tool call crashes the whole chat turn instead of degrading gracefully

**File:** `src/adapters/llm/google.ts:53-61`
**Issue:** Inside the tool-round loop, `TOOL_HANDLERS[call.name](call.args as never)` is awaited with no try/catch. If a handler throws — e.g. `call.args` is `undefined` or missing an expected field (Gemini's structured tool-call output is not itself schema-validated before dispatch — see IN-02), or an adapter throws instead of returning its documented `AdapterResult` — the exception propagates out of `runAgent`, up through `route.ts`'s outer try/catch, and the user gets a generic 500 "Internal error" for the whole turn, rather than the model receiving a tool-error result it could recover from or explain.
**Fix:** Wrap each handler invocation and feed failures back to the model as a function response, e.g.:
```ts
let result: unknown;
try {
  result = await TOOL_HANDLERS[call.name](call.args as never);
} catch (e) {
  result = { error: 'tool_execution_failed' };
}
responseParts.push({ functionResponse: { name: call.name, response: result as Record<string, unknown> } });
```

### WR-03: No cap on LLM-supplied `icaos` array length before fan-out to upstream adapters

**File:** `src/domain/agent/tools.ts:81-105`, `src/domain/agent/tools.ts:145-163`, `src/domain/scoring/buildScoringInputs.ts:7-20`
**Issue:** `flightDestinationsTool`, `runwayConditionsTool`, and `scoreAirportsTool`/`buildScoringInputs` all accept a model-supplied `icaos: string[]` and fan out via `Promise.all` to 2-3 upstream adapter calls per code, deduplicated but with no upper bound on array size. A single tool call requesting scoring/conditions for a large number of codes multiplies upstream API usage and Gemini tool-response payload size in one turn. This is low-risk in isolation, but combined with CR-01 (no endpoint-level rate limiting) there is currently nothing bounding the total cost of a single request.
**Fix:** Cap the array length (e.g. 10-20 codes) in each tool handler and return a clear `too_many_icaos`-style result for the excess, in addition to fixing CR-01.

## Info

### IN-01: Dead `'error'` reason branches in `expansionScore.ts` are unreachable and misleading

**File:** `src/domain/scoring/expansionScore.ts:107-119`
**Issue:** `volumeReason` and `delayReason` return the literal `'error'` when `input.movements.ok`/`input.nasStatus.ok` is `true`. But `buildComponent` only reads the `reason` value when the corresponding `kpi` is `null`, and `resolveVolume`/`resolveDelay` only return `null` when `.ok` is `false` — so the `.ok === true` branch of `volumeReason`/`delayReason` can never actually be observed by a caller. It reads as if `'error'` is a real, reachable failure reason, which could mislead a future maintainer.
**Fix:** Either remove the dead branch (make the functions only callable/typed for the failure case) or add a one-line comment noting it's unreachable-by-construction, matching the precondition-comment style already used on `computeHeadroomKpi`.

### IN-02: Tool-call arguments from Gemini are dispatched with no schema validation

**File:** `src/domain/agent/tools.ts:165-170`, `src/adapters/llm/google.ts:59`
**Issue:** `TOOL_HANDLERS` is typed as `Record<ToolName, (args: never) => Promise<unknown>>`, and dispatch is `TOOL_HANDLERS[call.name](call.args as never)`. Typing the parameter as `never` disables compile-time checking of the argument shape entirely (a function requiring any specific `args` type is assignable to `(args: never) => ...`), and there is no runtime (Zod) validation of `call.args` before it reaches domain code such as `resolveRegion`'s `args.region` or `scoreAirportsTool`'s `args.icaos`. CLAUDE.md establishes Zod as the project's validation convention at trust boundaries; the LLM's structured tool-call output is exactly such a boundary (its shape is nominally constrained by the JSON Schema in `TOOL_DECLARATIONS`, but nothing enforces that Gemini's actual output conforms before the handler runs).
**Fix:** Validate `call.args` against a Zod schema per tool name before invoking the handler, and return a structured tool-error response (see WR-02) on validation failure rather than trusting the shape implicitly.

---

_Reviewed: 2026-08-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
