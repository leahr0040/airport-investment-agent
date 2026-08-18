---
phase: quick-260818-fr0
plan: 1
subsystem: api
tags: [gemini, google-genai, chat, session-memory, ttl-cache]

requires:
  - phase: 04-conversational-agent
    provides: tool-calling runAgent, resolve_region/score_airports tools, x-session-id extraction and rate limiting in route.ts
provides:
  - Session-scoped conversation memory for the chat agent via @google/genai's Chat class
  - sessionStore.ts, an in-memory TTL-bounded (30min sliding) sessionId -> Chat map
  - live.smoke.ts, a permanent opt-in regression guard proving Chat's own history capture survives a tool-call round-trip
affects: [chat-route, conversational-agent]

tech-stack:
  added: []
  patterns:
    - "Live-verify an SDK behavior claim with an opt-in smoke test before committing to an architecture change, instead of assuming from docs"
    - "In-memory Map<sessionId, {value, expiresAt}> with sliding TTL for per-session state, no external cache dependency"

key-files:
  created:
    - src/adapters/llm/sessionStore.ts
    - src/adapters/llm/sessionStore.test.ts
    - src/adapters/llm/live.smoke.ts
  modified:
    - src/adapters/llm/google.ts
    - src/adapters/llm/google.test.ts
    - src/app/api/chat/route.ts
    - src/app/api/chat/route.test.ts

key-decisions:
  - "Live smoke test passed: @google/genai's Chat class preserves per-turn state across a tool-call round-trip on its own, so the manual contents array + thought_signature echo was deleted rather than kept as a fallback"
  - "SYSTEM_PROMPT moved from being concatenated into the first user message to Chat's systemInstruction config field, since it is now sent once per session instead of re-sent on every follow-up"
  - "sessionStore.ts's Map growth is unbounded until each entry's own TTL sweep removes it - accepted (ponytail: comment) given this project's single-process, no-persistent-DB, demo/project scale"

requirements-completed: []

coverage:
  - id: D1
    description: "Two POST /api/chat requests with the same x-session-id continue one Gemini conversation"
    verification:
      - kind: unit
        ref: "src/adapters/llm/google.test.ts#reuses the same Chat for repeated calls with the same sessionId, and creates a new Chat for a different sessionId"
        status: pass
    human_judgment: false
  - id: D2
    description: "Two POST /api/chat requests with different x-session-id values get fully independent conversations"
    verification:
      - kind: unit
        ref: "src/adapters/llm/google.test.ts#reuses the same Chat for repeated calls with the same sessionId, and creates a new Chat for a different sessionId"
        status: pass
    human_judgment: false
  - id: D3
    description: "Chat's internal history capture (no manual thought_signature echo) is confirmed live, not assumed, before deleting the manual contents array"
    verification:
      - kind: other
        ref: "npm run smoke -- src/adapters/llm/live.smoke.ts (ran during execution: PASSED)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A session past its TTL is evicted and gets a fresh Chat rather than being retained forever"
    verification:
      - kind: unit
        ref: "src/adapters/llm/sessionStore.test.ts#evicts a session past its TTL, creating a fresh chat on next access"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-08-18
status: complete
---

# Quick Task 260818-fr0: Session-Scoped Conversation Memory Summary

**Chat agent now keeps one Gemini conversation per session id via @google/genai's `Chat` class, backed by an in-memory 30-minute sliding-TTL session store, replacing a hand-rolled per-request `contents` array that was rebuilt empty on every call.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-18T11:30:15+03:00
- **Completed:** 2026-08-18T11:37:39+03:00
- **Tasks:** 2
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments
- Live-verified via `live.smoke.ts` that `@google/genai`'s `Chat` class preserves whatever per-turn state Gemini needs across a tool-call round-trip on its own — result: **PASSED**. Ran with real credentials against the live Gemini API (`npm run smoke -- src/adapters/llm/live.smoke.ts`), forcing a function call with `FunctionCallingConfigMode.ANY`, sending a `functionResponse` back on the same `Chat` object with zero manual `contents`/`thought_signature` handling, and confirming the second turn still produced a valid function call.
- Because the live check passed, took the default path: deleted the manual `Content[]` array, the round-trip echo of `response.candidates?.[0]?.content`, and the manual `thought_signature` comment/workaround from `google.ts`, replacing them with `sessionStore.getOrCreateChat(sessionId, createChat)` and `chat.sendMessage({ message })`.
- `runAgent`'s signature changed from `runAgent(query)` to `runAgent(sessionId, query)`; `route.ts`'s already-extracted `session` value (previously only used for rate limiting) is now also passed through to `runAgent`.
- `sessionStore.ts` added: one module-level `Map<sessionId, {chat, expiresAt}>`, a single exported `getOrCreateChat(sessionId, createChat)`, 30-minute sliding TTL, with a `ponytail:` comment documenting the accepted unbounded-growth-until-TTL-sweep ceiling.
- `SYSTEM_PROMPT` moved off being concatenated into the first user-message text and onto `Chat`'s `systemInstruction` config field, since a session's system prompt is now sent once (at `chats.create`) rather than re-sent on every follow-up query.

## Task Commits

Each task was committed atomically:

1. **Task 1: Live-verify Chat history, then build session-scoped runAgent** - `5f0d67c` (feat)
2. **Task 2: Update tests for session-scoped runAgent** - `b74d2cc` (test)

**Plan metadata:** pending (docs commit handled by orchestrator)

## Files Created/Modified
- `src/adapters/llm/live.smoke.ts` - Opt-in live smoke test proving `Chat`'s internal history alone survives a tool-call round-trip; kept permanently as a regression guard (`npm run smoke`, never part of `npm test`)
- `src/adapters/llm/sessionStore.ts` - In-memory TTL-bounded (30min sliding) `Map<sessionId, Chat>`, exports `getOrCreateChat`
- `src/adapters/llm/sessionStore.test.ts` - Covers reuse (same session id -> same `Chat`) and TTL eviction (fake timers, 25h advance)
- `src/adapters/llm/google.ts` - `runAgent(sessionId, query)` now uses `sessionStore.getOrCreateChat` + `chat.sendMessage`; `SYSTEM_PROMPT` moved to `systemInstruction`; manual `Content[]`/echo logic deleted
- `src/adapters/llm/google.test.ts` - Mocks `chats.create`/`sendMessage` instead of `models.generateContent`; asserts session reuse and isolation via `chatsCreateMock` call counts and exact `sendMessage` argument shapes per round
- `src/app/api/chat/route.ts` - `runAgent(query)` call site changed to `runAgent(session, query)`
- `src/app/api/chat/route.test.ts` - First test extended to assert `runAgent` is called with `(session, query)`

## Decisions Made
- Live smoke test passed, so the default (`Chat`-based) design from the plan was used — the fallback design (persisting a `Content[]` array per session instead) was not needed.
- `SYSTEM_PROMPT` delivery mechanism changed from per-message text concatenation to `systemInstruction` config, a necessary consequence of moving to a persistent `Chat` session (re-sending the full prompt as message text on every follow-up would have been wrong).

## Deviations from Plan

None - plan executed exactly as written. The live verification step resolved to the "PASSES" branch documented in the plan, and Step 2's default design was implemented as specified.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. (Existing `GOOGLE_GENERATIVE_AI_API_KEY` in `.env` was reused for the live smoke test; no new credentials needed.)

## Next Phase Readiness

- `runAgent`'s new `(sessionId, query)` signature and `sessionStore.ts` are ready for use by any future caller needing session-scoped conversation state.
- `live.smoke.ts` is a permanent regression guard - if a future `@google/genai` upgrade changes `Chat`'s history-capture behavior, `npm run smoke` will catch it before it silently breaks session memory.
- No blockers identified.

---
*Phase: quick-260818-fr0*
*Completed: 2026-08-18*

## Self-Check: PASSED

All created/modified files found on disk; both task commits (`5f0d67c`, `b74d2cc`) verified in `git log`.
