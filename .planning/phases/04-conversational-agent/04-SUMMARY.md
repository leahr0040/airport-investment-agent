---
phase: 04-conversational-agent
plan: 04
subsystem: api
tags: [gemini, google-genai, chat, tool-calling, next-js]

requires:
  - phase: 02-live-data-adapters-caching
    provides: OpenSky/FAA/NAS adapters, withCache
  - phase: 03-deterministic-scoring-engine
    provides: buildScoringInputs, scoreAirports (expansionScore)
provides:
  - /api/chat route with Zod-validated body, per-session rate limiting, session-scoped Gemini conversations
  - Native Gemini tool-calling (resolve_region, score_airports) replacing manual intent-parse orchestration
  - Chat UI (src/app/page.tsx) rendering narrated answers
affects: [05-security-hardening]

tech-stack:
  added: ["@google/genai", "rate-limiter-flexible"]
  patterns:
    - "LLM orchestrates via native function-calling (runAgent's tool-round loop), never computes numbers itself - tool handlers return structured objects, not text, back into the model"
    - "Session-scoped conversation state via an in-memory TTL map keyed by session id, not a rebuilt-per-request contents array"

key-files:
  created:
    - src/domain/agent/tools.ts
    - src/domain/agent/tools.test.ts
    - src/adapters/llm/google.ts
    - src/adapters/llm/sessionStore.ts
    - src/lib/rateLimiter.ts
    - src/app/api/chat/route.ts
  modified:
    - src/domain/scoring/buildScoringInputs.ts
    - src/instrumentation.ts
    - src/config/env.ts
    - src/app/page.tsx

key-decisions:
  - "Pivoted from the original 04-PLAN.md design (separate parseIntent() step + zod intent schema + manual fetch/score/narrate orchestration) to Gemini's native function-calling: the model picks resolve_region/score_airports itself and writes the final answer from real tool results. narrator.ts (template-based narration) was deleted as superseded. This is an architecture evolution discovered during implementation, not a literal build of the original plan text - CLAUDE.md's Architecture section documents the as-built shape."
  - "GOOGLE_GENERATIVE_AI_MODEL default changed from a dated id (gemini-2.5-flash) to the gemini-flash-latest alias - dated ids can get gated for new-user projects with no warning, verified live 2026-08-13."
  - "Reconciliation choice (2026-08-19, explicit user direction): restored the OpenSky in-flight token-fetch race fix (quick task 260818-ia2) as part of this pass, but explicitly did NOT restore buildScoringInputs.ts's dropped MAX_AIRPORTS_PER_QUERY quota cap - left as a known, tracked gap rather than fixed unilaterally."

requirements-completed: []

duration: unknown (spans multiple sessions - 2026-08-13 tracer, 2026-08-18 quick-task iterations, 2026-08-19 reconciliation)
completed: 2026-08-19
status: complete
---

# Phase 4: Conversational Agent Summary

**Chat agent answers analyst questions via Gemini's native tool-calling (resolve_region, score_airports) over the real scoring engine, with session-scoped memory, per-session rate limiting, and Zod-validated request handling — narration is LLM prose, but every number in it comes from a tool result, never from the model itself.**

## Performance

- **Tasks:** Spans the original tracer commit (`554ad14`, 2026-08-13), three quick-task iterations (fr0 session memory, gzv/hb0 review fixes, 2026-08-18), and this session's reconciliation (2026-08-19).
- **Files modified (this session's commits only):** 12 (2 created, 8 modified, 1 deleted, across 2 code commits) plus the ia2 quick task (4 files, tracked separately)

## Accomplishments
- `/api/chat` (Next.js route) validates its body with Zod, rate-limits per session (`x-session-id` header, `rate-limiter-flexible`), and calls `runAgent(session, query)`.
- `runAgent` (`src/adapters/llm/google.ts`) runs a bounded tool-call loop (`MAX_TOOL_ROUNDS = 4`) against a session-scoped `@google/genai` `Chat` object; the model calls `resolve_region`/`score_airports` as needed and writes the final narrated answer itself from the returned structured data.
- `src/domain/agent/tools.ts` (this session): tool declarations plus handlers bridging into `domain/airports/regions.ts` and `domain/scoring/buildScoringInputs.ts`/`expansionScore.ts` - the deterministic core the LLM can never bypass.
- Session-scoped conversation memory (`sessionStore.ts`, 30-min sliding TTL) lets follow-up questions ("what about Boston?") resolve against prior turns without resending full history.
- Chat UI (`src/app/page.tsx`) renders narrated answers with a stable per-message id.
- This session additionally closed the OpenSky in-flight token-fetch race (quick task 260818-ia2, committed separately: `ba84c46`, `ced0f61`, `b36fe62`) and reconciled a body of uncommitted tool-calling work that had never been committed - including discovering and fixing that HEAD was, until this session's commit `9ac5f4b`, in a **broken state**: the previously-committed `google.ts` imported `@/domain/agent/tools`, a module that had never actually been added to git.

## Task Commits

This phase's work is not structured as GSD tasks (04-PLAN.md predates the structured plan format - no frontmatter task list). Relevant commits, in order:

1. `554ad14` (2026-08-13) - original tracer: route, google.ts (ai-sdk based, later rewritten), rateLimiter, narrator.ts, buildScoringInputs wiring
2. `5f0d67c`, `b74d2cc` (2026-08-18, quick-260818-fr0) - session-scoped Chat memory
3. `1908486` (2026-08-18, quick-260818-gzv) - unrelated CR-01 fix, adjacent area
4. `e497b5f` (2026-08-18, quick-260818-hb0) - chat UI committed in full, stable message ids
5. `ba84c46`, `ced0f61`, `b36fe62` (2026-08-19, quick-260818-ia2, this session) - in-flight request race fixes (withCache, OpenSky token fetch)
6. `9ac5f4b` (2026-08-19, this session) - native tool-calling architecture (`domain/agent/tools.ts`), narrator.ts removal, boot-time Gemini client init, model-default fix, cleanup

**Plan metadata:** this file + CLAUDE.md architecture doc update (docs commit, this session)

## Files Created/Modified

See `key-files` frontmatter above for the current-architecture set. Full per-commit file lists are in the commits themselves (`git show <hash> --stat`).

## Decisions Made

See `key-decisions` frontmatter above.

## Deviations from Plan

### Not Auto-fixed - Flagged for Follow-up

**1. [buildScoringInputs.ts] MAX_AIRPORTS_PER_QUERY quota cap dropped, not restored**
- **Found during:** Reconciliation review of uncommitted work, this session
- **Issue:** A prior uncommitted edit removed the `MAX_AIRPORTS_PER_QUERY = 6` cap (and its explaining comment) that bounded per-request OpenSky fan-out. Nothing replaced it - `resolve_region` can return more than 6 airports for a wide region query, and each airport costs 3 upstream calls.
- **Disposition:** Explicitly presented to the user with rationale; the user chose to leave it unfixed for this pass rather than have it restored. Recorded in STATE.md and this SUMMARY so it isn't silently lost.
- **Committed in:** `9ac5f4b` (carries the gap forward, does not fix it)

**2. [buildScoringInputs.ts/cache.ts] Requirement traceability not independently re-verified against all 10 phase requirement IDs**
- **Issue:** `04-PLAN.md` has no `requirements:` frontmatter to check off, and this phase's work spans five separate commits across three calendar dates. A quick grep found no `long-haul`/`great-circle` logic anywhere in `src/domain/scoring/` or `src/domain/agent/`, which is what QUERY-03 requires - this reads as an unimplemented requirement, not a naming mismatch, but was not chased further in this session.
- **Disposition:** Left for the phase verifier (`gsd-verifier`) to cross-reference all of CHAT-01..04, QUERY-01..05, SEC-04 against the actual codebase, rather than this session guessing at partial coverage.

## Issues Encountered

This phase's actual implementation was substantially complete but uncommitted when this session started (`/gsd-execute-phase 4` was invoked against a phase that already had working code sitting in the tree, plus a HEAD that didn't compile standalone). See commit `9ac5f4b`'s body and STATE.md's Blockers/Concerns for the full account. Resolved by reconciling and committing rather than re-executing from the (unstructured) `04-PLAN.md`.

## User Setup Required

None beyond what's already in `.env.example` (`GOOGLE_GENERATIVE_AI_API_KEY`, `OPENSKY_CLIENT_ID`/`SECRET`) - no new external service configuration introduced this session.

## Next Phase Readiness

- `npx tsc --noEmit` and `npx vitest run` (100/100) are clean on the full tree as of `9ac5f4b`.
- Requirement-level verification (all 10 phase requirement IDs, including the QUERY-03/QUERY-04 gaps flagged above) is deferred to the standard phase verifier step, not certified here.

---
*Phase: 04-conversational-agent*
*Completed: 2026-08-19*
