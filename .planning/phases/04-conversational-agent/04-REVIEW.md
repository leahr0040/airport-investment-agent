---
phase: 04-conversational-agent
reviewed: 2026-08-19T00:00:00Z
depth: quick
files_reviewed: 12
files_reviewed_list:
  - src/domain/agent/tools.ts
  - src/domain/agent/tools.test.ts
  - src/adapters/llm/google.ts
  - src/adapters/llm/sessionStore.ts
  - src/lib/rateLimiter.ts
  - src/app/api/chat/route.ts
  - src/domain/scoring/buildScoringInputs.ts
  - src/instrumentation.ts
  - src/config/env.ts
  - src/app/page.tsx
  - src/domain/adapters/cache.ts
  - src/domain/adapters/opensky.client.ts
findings:
  critical: 2
  warning: 3
  info: 2
  total: 7
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-08-19T00:00:00Z
**Depth:** quick
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Reviewed the native Gemini tool-calling loop (`google.ts`), the chat API route, the
session/rate-limit plumbing, and the scoring/adapter glue in scope. Two blocker-level
issues were traced with high confidence by reading the actual control flow rather than
pattern-matching: (1) the tool-calling loop in `google.ts` can exit having computed a
function response it never sends back to Gemini, leaving the persisted per-session `Chat`
object with a dangling, unanswered function call that will likely break every subsequent
turn in that session; (2) `app/api/chat/route.ts` derives a single key from client-supplied
headers that is used *both* as the rate-limit bucket and as the Gemini chat `sessionId`,
with a fallback chain (`x-forwarded-for`, then a shared literal `'anon'`) that can collide
across genuinely distinct users, mixing their conversation histories.

On the specific security question asked for this pass — whether raw upstream API text
(FAA closure reasons, callsigns, facility names, etc.) reaches Gemini's context in a way
that could be interpreted as instructions — the answer in this file set is **no**: traced
`scoreAirportsTool` → `buildScoringInputs` → `expansionScore.ts`'s `ExpansionScore`/
`ScoringComponentBreakdown` types, and the only strings that flow back into the
`functionResponse` sent to Gemini are the enum-constrained `AdapterFailReason` values
(`"timeout" | "invalid_input" | "rate_limited" | "no_data" | "error"`) plus the caller's
own already-validated `icao`. No FAA/OpenSky free-text field is echoed into the tool
result. `resolveRegion`'s output is also closed-world (hardcoded `regions.ts` table). This
looks like a deliberate, correctly-executed design choice — noted as a positive, not a
finding.

The previously-flagged `MAX_AIRPORTS_PER_QUERY` gap in `buildScoringInputs.ts` was
confirmed present (no cap on `icaos.length` before fanning out to three adapters per
airport) — per the brief, not re-filed here since it's already tracked.

## Critical Issues

### CR-01: Tool-calling loop can exit with an unanswered function call, poisoning the session's chat history

**File:** `src/adapters/llm/google.ts:42-60`
**Issue:** The round loop runs `for (let round = 0; round < MAX_TOOL_ROUNDS; round++)`. On
the *last* iteration (`round === MAX_TOOL_ROUNDS - 1`), if Gemini's response still contains
function calls, the code executes the tool handlers and builds `responseParts` — but then
the loop condition fails and the function falls through to `return "I wasn't able to
finish..."` **without ever calling `chat.sendMessage({ message: responseParts })`**. The
`chat` object is not local to this call — it's the same `Chat` instance persisted in
`sessionStore` for the lifetime of the session (`getOrCreateChat`). Its internal history
now ends on an unresolved Gemini function call (the model is "waiting" for a
`functionResponse` that will never arrive). The next user turn in that same session calls
`chat.sendMessage()` again with a plain user message, which the Gemini API is very likely
to reject or mishandle, since function calls must be immediately followed by their
response before another turn — silently breaking the session for its remaining ~30-minute
TTL with no recovery path other than the client generating a new `sessionId`. The same
failure mode is also reachable if a tool handler throws mid-round (no try/catch around
`TOOL_HANDLERS[call.name](...)`): the round's `responseParts` never gets sent either, for
the same reason.
**Fix:** Send whatever was computed even on the terminal round, so every function call is
always answered, and guard handler execution so partial results still get sent:
```ts
for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
  const response = await chat.sendMessage({ message });
  const calls = response.functionCalls ?? [];
  if (calls.length === 0) return response.text ?? '';

  const responseParts = [];
  for (const call of calls) {
    if (!isToolName(call.name)) {
      responseParts.push({ functionResponse: { name: call.name ?? 'unknown', response: { error: 'unknown_tool' } } });
      continue;
    }
    try {
      const result = await TOOL_HANDLERS[call.name](call.args as never);
      responseParts.push({ functionResponse: { name: call.name, response: result as Record<string, unknown> } });
    } catch {
      responseParts.push({ functionResponse: { name: call.name, response: { error: 'tool_failed' } } });
    }
  }

  if (round === MAX_TOOL_ROUNDS - 1) {
    // Still answer the model's last function call so the session isn't left mid-turn,
    // then give up rather than looping again.
    await chat.sendMessage({ message: responseParts });
    return "I wasn't able to finish that request - please try rephrasing it.";
  }
  message = responseParts;
}
```

### CR-02: Rate-limit key doubles as Gemini chat session id, with a collidable fallback — cross-user conversation leakage

**File:** `src/app/api/chat/route.ts:17-23`, `src/adapters/llm/sessionStore.ts:10-20`
**Issue:** `route.ts` computes one value —
`req.headers.get('x-session-id') ?? req.headers.get('x-forwarded-for') ?? 'anon'` — and
uses it for two different purposes: the rate-limiter bucket key *and* `runAgent(session,
query)`'s `sessionId`, which is the key `sessionStore.ts` uses to look up/create the
persisted Gemini `Chat` object (full conversation history). `page.tsx` always sends
`x-session-id`, but any caller that doesn't (a different client, a proxy/CDN that strips
custom headers, a test harness, a load balancer health check hitting the same route) falls
through to `x-forwarded-for`, which is not guaranteed unique per user (multiple users
behind the same NAT/corporate proxy share one IP), and ultimately to the literal string
`'anon'`, shared by *every* caller with neither header. Two unrelated users landing on the
same fallback key don't just share a rate-limit bucket — they share the exact same
in-memory `Chat` object, meaning one user's questions and the agent's answers about them
become part of the *other* user's conversation context for as long as that key's 30-minute
TTL is alive. This is a direct conversation/data-isolation bug, not just a quota-sharing
inconvenience, and it working around CLAUDE.md's explicit per-session rate-limiting
requirement in a way that also breaks session privacy.
**Fix:** Require the client-generated session id and reject requests without one, rather
than silently degrading to a shared key; keep `x-forwarded-for` (if used at all) out of the
session/chat-identity path entirely:
```ts
const sessionId = req.headers.get('x-session-id');
if (!sessionId) {
  return NextResponse.json(
    { ok: false, error: { code: 'invalid_request', message: 'Missing x-session-id header' } },
    { status: 400 },
  );
}
const rateLimitResult = await checkRateLimit(sessionId);
// ...
const narrative = await runAgent(sessionId, query);
```

## Warnings

### WR-01: Missing `query` field silently bypasses the 400 validation path and reaches the agent as an empty string

**File:** `src/app/api/chat/route.ts:9-15`
**Issue:** `BodySchema = z.object({ query: z.string().min(1) }).partial()` makes `query`
optional. When the request body is `{}` (or any object without a `query` key —
`req.json().catch(() => ({}))` also lands here on unparsable JSON), `safeParse` **succeeds**
(`success: true`, `data: {}`), so `!parsedBody.success` is false and the 400 branch never
runs. `query` is then computed as `parsedBody.data.query ?? ''`, and this empty string is
passed straight through `checkRateLimit` and `runAgent` — consuming a rate-limit point and
triggering a real Gemini call for a blank/malformed request instead of returning the
intended `invalid_request` 400. Only a *present-but-wrong-type-or-empty* `query` (e.g.
`{query: ""}` or `{query: 5}`) actually reaches the 400 path, which is the opposite of the
apparent intent (`.min(1)` reads as "query is required and non-empty").
**Fix:** Don't call `.partial()` on a schema meant to enforce a required field:
```ts
const BodySchema = z.object({ query: z.string().min(1) });
const parsedBody = BodySchema.safeParse(body);
if (!parsedBody.success) {
  return NextResponse.json({ ok: false, error: { code: 'invalid_request', message: 'Expected {query: string}' } }, { status: 400 });
}
const query = parsedBody.data.query;
```

### WR-02: `resolveRegion` has no defensive default for its argument, unlike `scoreAirportsTool`

**File:** `src/domain/agent/tools.ts:31-33` (contrast with line 36)
**Issue:** `scoreAirportsTool` guards against a missing/malformed tool-call argument with
`args.icaos ?? []`, but `resolveRegion` calls `lookupAirports(args.region)` directly with no
equivalent guard. Tool-call arguments arrive from the Gemini SDK as `call.args as never` —
a cast that fully suppresses compile-time checking (see IN-02) — so nothing statically
guarantees `args.region` is a string at runtime even though the JSON schema marks it
`required`/`enum`-constrained. If a model ever emits a call with a missing or out-of-enum
`region` (SDKs occasionally don't enforce this as strictly as the schema implies,
especially in edge cases like truncated output), an unhandled exception inside
`lookupAirports` would propagate out of the `for` loop in `google.ts`, producing a generic
500 for the whole request and — per CR-01's mechanism — leaving that round's function call
unanswered in the session's chat history.
**Fix:** Match the defensive pattern already used for `icaos`:
```ts
export async function resolveRegion(args: { region: string }): Promise<{ icaos: string[] }> {
  return { icaos: lookupAirports(args.region ?? '').map((match) => match.icao) };
}
```

### WR-03: `isToolName` hardcodes tool names instead of deriving them from `TOOL_DECLARATIONS`

**File:** `src/adapters/llm/google.ts:21-23`
**Issue:** `isToolName` is a manual literal check (`name === 'resolve_region' ||
name === 'score_airports'`) duplicating information already present in
`TOOL_DECLARATIONS`/`ToolName` from `tools.ts`. Adding, removing, or renaming a tool
requires remembering to update this function too; nothing enforces the two stay in sync,
and a forgotten update fails silently (an existing tool would be routed to the
`unknown_tool` branch instead of its handler).
**Fix:**
```ts
const TOOL_NAMES = new Set(TOOL_DECLARATIONS.map((t) => t.name));
function isToolName(name: string | undefined): name is ToolName {
  return name !== undefined && TOOL_NAMES.has(name as ToolName);
}
```

## Info

### IN-01: `rateLimiter.ts` comment describes behavior the config doesn't implement

**File:** `src/lib/rateLimiter.ts:3-4`
**Issue:** The comment says "5 req/min steady rate, burst capacity 10", but
`new RateLimiterMemory({ points: 10, duration: 60 })` implements a single flat window of
10 requests per 60 seconds — there is no separate steady-state rate and burst allowance in
`rate-limiter-flexible`'s basic `RateLimiterMemory` with these params. A future maintainer
reading the comment could believe the protection is stricter (5/min sustained) than it
actually is (10/min flat).
**Fix:** Correct the comment to describe the actual behavior, e.g. "10 requests per 60s,
single fixed window, per session key."

### IN-02: Tool dispatch fully suppresses type checking via `as never` / `never` parameter casts

**File:** `src/adapters/llm/google.ts:18`, `src/domain/agent/tools.ts:40-43`
**Issue:** `AGENT_TOOLS = [{ functionDeclarations: TOOL_DECLARATIONS as never }]` and
`TOOL_HANDLERS: Record<ToolName, (args: never) => Promise<unknown>>` both use `never` to
sidestep type mismatches between the plain-JSON-Schema tool declarations and the typed
handler functions. This is a reasonable practical accommodation for the SDK's typing, but
it means a schema/handler drift (e.g. renaming a property in `parametersJsonSchema` without
updating the corresponding handler's parameter type) will not be caught by the compiler —
only at runtime, and only if exercised by a test or a live call.
**Fix:** No change required for correctness at this scope, but consider a single narrow
comment at each cast site noting this is a known, deliberate type-safety gap (partially
already present at line 18) so it isn't mistaken for an oversight during future edits.

---

_Reviewed: 2026-08-19T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
