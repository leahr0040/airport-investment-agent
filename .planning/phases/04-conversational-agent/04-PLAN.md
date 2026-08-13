Phase 4 — Plan: Conversational Agent (Chat, Tool-Calling & Analyst Questions)

Goal
- Deliver an analyst-facing chat path that (A) accepts plain-English queries, (B) resolves/validates airport identifiers, (C) calls deterministic data+scoring tools, and (D) returns narrated, traceable answers whose numeric values are taken from the scoring engine's structured output.

Dependencies
- Phase 1 (complete): config, env validation, regions resolver
- Phase 2 (complete): OpenSky, FAA NAS, ArcGIS adapters and caching
- Phase 3 (required): Deterministic scoring engine (pure, zero-I/O function). Phase 3 must be completed or a minimal scoring shim provided for the tracer slice.

Strategy: Tracer-First
- Lead with one end-to-end production-quality tracer (text-only) that proves the full UX: chat → intent parse → airport resolution → upstream calls → scoring → narrated answer. Only after tracer verification expand horizontally.

Wave A — Tracer (must pass before expansion)
1. Scoring shim / phase-3 gate
  - If Phase 3 not finished, add a minimal `scoring/shim.ts` that wraps the intended scoring function signature and returns deterministic fixture outputs for tracer verification. Mark as temporary and gated for removal when Phase 3 completes.
  - Files: `.planning/phases/03-...` cross-link, `src/domain/scoring/index.ts` (adapter shim)

2. Chat transport & server route
  - Add `/api/chat` server route (Next.js server handler) that accepts session-scoped requests and returns streaming text (simple text fallback acceptable for tracer).
  - Rate-limit per-session via in-memory token-bucket middleware: default conservative params (5 req/min, burst 10). Implement in `src/instrumentation.ts` or `src/lib/rateLimiter.ts`.
  - Tests: unit tests for rate limiter behavior and server response mocking.

3. Intent parser + structured output schema
  - Implement an intent parse call that uses the configured LLM adapter to output a JSON schema: { intent: 'compare|rank|describe', airports: [resolved ids], timeWindow: {begin,end}, kpis: [] }
  - Use `zod` schemas for both LLM response validation and user input allowlist checks before any upstream call (SSRF prevention).
  - Files: `src/domain/intent/parse.ts`, `src/domain/intent/schemas.ts`.

4. LLM provider wiring
  - Add `ai@7.x` plus `@ai-sdk/google` (provider adapter) OR add `@google/generative-ai` direct SDK. Provide a small adapter `src/adapters/llm/google.ts` exposing `parseIntent()` and `narrateAnswer()` convenience functions.
  - Add `zod` for schema validation. Update `package.json` and `.env.example` to document `GOOGLE_GENERATIVE_AI_API_KEY` or provider variable chosen.

5. Chat orchestration (server-side)
  - Orchestrate: parseIntent → validate/allowlist airports → fetch adapters (OpenSky/NAS/FAA) under TTL/caching → call scoring engine → assemble structured result → call `narrateAnswer()` to produce natural prose tied to structured numbers.
  - Ensure all textual upstream data is treated as untrusted; only numeric fields from the scoring engine are used in narration substitutions.

6. Tests & verification (tracer)
  - Unit tests for `parseIntent()` using deterministic LLM responses (mock adapter).
  - Integration smoke test for `/api/chat` that uses the scoring shim and mocked upstream adapters (Vitest). Add `smoke` script if not present.

Wave B — Expand & Harden
1. Replace scoring shim with Phase 3 scoring engine and run full deterministic tests.
2. Implement session persistence (in-memory at demo scale) to support follow-ups and conversation state.
3. Improve narration to stream partial results and attach structured metadata JSON to responses for UI rendering.
4. Implement opt-in upstream live smoke tests gated by env var (e.g., `SMOKE_LIVE=true`) to avoid accidental quota usage.

Acceptance Criteria (must be TRUE)
- `npm test` includes unit tests proving `parseIntent()` and `scoring` outputs for tracer fixtures.
- `/api/chat` returns a narrated answer given a simple query like "Compare KATL and KSFO for expansion" where numeric values in the narration are taken from scoring output programmatically (not parsed from LLM text).
- Per-session rate limiting prevents more than the configured turns over the measurement window.
- All user-supplied identifiers are validated against the allowlist/OurAirports-derived table before any outbound URL or upstream call.

Deliverables
- `.planning/phases/04-conversational-agent/04-PLAN.md` (this file)
- `src/pages/api/chat.ts` (server chat handler) or `src/app/api/chat/route.ts` depending on routing style
- `src/domain/intent/*`, `src/adapters/llm/*`, rate limiter file, and tests under `src/` with Vitest coverage for the tracer.
- `04-VERIFICATION.md` checklist completed and checked-in when tracer passes.

Next Steps
- Researcher: complete `04-RESEARCH.md` fixtures (see researcher tasks) and confirm OpenSky/ArcGIS samples.
- Planner/engineer: implement tracer wave per tasks above. Prefer small, reviewable commits each implementing one task.
