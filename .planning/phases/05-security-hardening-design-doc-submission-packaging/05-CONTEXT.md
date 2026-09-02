# Phase 5: Security Hardening, Design Doc & Submission Packaging - Context

**Gathered:** 2026-09-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove the security guardrails that already exist actually hold, and ship a design document plus
a repo a reviewer can clone, run, and understand without reading source code.

**Scouting finding that reshapes this phase:** two of the three requirements are largely already
met in code. This phase is mostly *documentation* with one small enforcement change — not a
security build-out.

| Requirement | State at discussion time |
|---|---|
| SEC-01 — no secret/upstream URL in browser-shipped code | **True by construction.** No `NEXT_PUBLIC_*` anywhere; `page.tsx` is the only client component and imports nothing from `domain/` or `config/`; it only calls `/api/chat`. `env.ts` and the three adapter wrappers import `server-only`, so a client import breaks the build. Gap: the three `.client.ts` files that actually hold the upstream base URLs are *not* guarded — only transitively protected. |
| SEC-03 — per-session rate limit | **Built and tested.** `proxy.ts` runs IP (30/min) → UUID validation → session (10/min) before the route handler. |
| DOC-01 — design document | **Does not exist.** No `docs/`, no `DESIGN.md`. This is the bulk of the phase. |

**Also found — REQUIREMENTS.md is stale on SEC-02.** It states "nothing in the codebase currently
validates an airport identifier's shape before it could reach an outbound URL." That is no longer
true: all three adapters regex-gate the code before URL construction
(`opensky.ts:16`, `nasStatus.ts:49`, `faaFacility.ts:36`, via `validate.ts`). The protection is
format-only, not the deleted registry allowlist — but the "no validation at all" claim should be
corrected rather than repeated in the design doc.

</domain>

<decisions>
## Implementation Decisions

### SEC-01 — proving no secrets reach the browser

- **D-01:** Add `import 'server-only';` to the three client files that hold upstream base URLs —
  `src/domain/adapters/opensky.client.ts`, `src/domain/adapters/nasStatus.client.ts`,
  `src/domain/adapters/faaFacility.client.ts`. This converts today's *transitive* protection
  (they are safe only because just the guarded wrappers import them) into direct enforcement:
  any future client-component import fails the build.
- **D-02:** **No bundle-scanning test.** A test that runs `next build` and greps `.next/static`
  was considered and declined — slow, and it needs valid credentials for the build to pass.
- **D-03:** **No documented manual verification either.** The `server-only` guard is the whole
  answer; nothing else is written up to prove SEC-01 to a reviewer.

### SEC-03 — rate limiting vs. the real quota ceiling

- **D-04:** **Leave the rate limiter exactly as it is; document the gap instead.** The per-minute
  session limit (10/min) does not protect the Gemini free tier's real ceiling of **20 requests per
  day** (confirmed live via a 429 `RESOURCE_EXHAUSTED`, `GenerateRequestsPerDayPerProjectPerModel-FreeTier`,
  2026-08-23). A reviewer can exhaust the day's quota in ~3 minutes without tripping any limit.
  A daily cap (global or per-session, ~2 lines using the existing `RateLimiterMemory` pattern in
  `rateLimiter.ts`) was presented and explicitly declined.
- **D-05:** `DESIGN.md` must name the 20/day ceiling as a known limitation, with its workaround
  (wait for the daily reset, or swap in a paid/alternate key).

> **Known consequence, accepted deliberately:** phase success criterion 2 reads *"Sending rapid
> repeated requests from one session hits a per-session rate limit before upstream API quota or
> LLM budget is exhausted."* A burst does trip the 10/min limit, so the criterion's literal
> wording holds — but the LLM *budget* is genuinely not protected. Do not quietly reinterpret
> this during planning or verification; it is a stated, accepted gap.

### DOC-01 — the design document

- **D-06:** **One `DESIGN.md` at the repo root**, beside `README.md`, with a link to it from the
  README. All four required parts live in that single file. A `docs/` directory with split files
  was considered and declined (fragments the argument across several reads).
- **D-07:** The worked example's numbers come from **the existing test fixtures in
  `src/domain/scoring/expansionScore.test.ts`** — not from a live API run, not hand-invented.
  Rationale: they are real engine output, deterministic, and a reviewer can re-verify them with
  `npm test` without credentials or spending OpenSky/Gemini quota.
- **D-08:** The "where AI is used" section is **split into two explicitly separate subsections**:
  (a) *in the product* — the LLM parses intent, selects tools, and narrates; it never computes a
  number; it does supply estimates (long-haul threshold, runway separation) which it must label
  as its own; and (b) *in building the project* — the code was written with Claude Code.
  Transparency preferred over omission for an FDE submission.

### Submission packaging

- **D-09:** **Fix `README.md`.** It currently states the repo *"is currently in early foundation
  work ... it does not yet ship a chat UI or the scoring engine"* — factually wrong; both ship.
  Correct that, and add a link to `DESIGN.md`.
- **D-10:** **No sample-question list in the README**, **no sample chat transcript** in the
  submission. Both were offered and not selected.

### Claude's Discretion

- Section ordering and headings inside `DESIGN.md`.
- Which fixture airport from `expansionScore.test.ts` carries the worked example, and how the
  normalization step is laid out (table vs. prose).
- Exact wording of the README correction.
- Whether the stale SEC-02 note in `REQUIREMENTS.md` is corrected as part of this phase's
  bookkeeping (the code-level facts are stated in `<domain>` above either way).

### Open — not decided

- **Does `.planning/` ship with the submitted repo?** Offered as a packaging option and not
  selected. It is already committed to git, so the current default is that it ships untouched.
  No deliberate curation was decided. Flagging rather than assuming: if the intent was to
  exclude it, that is a separate call to make before submission.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and scope
- `.planning/REQUIREMENTS.md` lines 74-82 — SEC-01, SEC-03, DOC-01 (and the stale SEC-02 note
  corrected in `<domain>` above).
- `.planning/ROADMAP.md` lines 148-159 — Phase 5 goal and the three success criteria.
- `.planning/PROJECT.md` — Core Value, Constraints, Out of Scope, and the Key Decisions table.
  The Out of Scope list is the raw material for `DESIGN.md`'s "alternatives considered and
  declined" section (BTS via Socrata, persistent DB, real financial modeling, second LLM provider,
  measured passenger volumes).
- `.claude/CLAUDE.md` — the research record behind the alternatives section: OpenSky auth
  findings, the Amadeus shutdown, AviationStack/AeroDataBox quota limits, LLM pricing comparison,
  and the "what NOT to install" table.

### Security surface to modify
- `src/domain/adapters/opensky.client.ts` — holds `TOKEN_ENDPOINT` and `FLIGHTS_BASE`; needs D-01.
- `src/domain/adapters/nasStatus.client.ts` — holds `NAS_FEED_URL`; needs D-01.
- `src/domain/adapters/faaFacility.client.ts` — holds `ARCGIS_BASE`; needs D-01.
- `src/config/env.ts` — existing `server-only` usage; the pattern D-01 copies.
- `src/proxy.ts` and `src/lib/rateLimiter.ts` — the rate-limiting chain being documented, not
  changed (D-04).

### Design-doc source material
- `src/domain/scoring/expansionScore.ts` — `SCORING_WEIGHTS` (line 8, all three components at
  1/3), `minMaxNormalize` (line 77), `scoreAirports` (line 126), `isCargoCallsign` (line 52).
  This is the formula the methodology section describes.
- `src/domain/scoring/expansionScore.test.ts` — the fixtures supplying the worked example (D-07).
- `src/adapters/llm/google.ts` — `SYSTEM_PROMPT` and the `runAgent` tool-round loop; the evidence
  for the "AI in the product" subsection.
- `src/domain/agent/tools.ts` — the tool declarations; shows the LLM's actual capability boundary.
- `.planning/phases/04-conversational-agent/04-CONTEXT.md` — the explicit decisions that the LLM,
  not code, estimates long-haul distance and runway separation. These are the labeled-estimate
  cases the AI-usage section must disclose.
- `.planning/STATE.md` "Blockers/Concerns" — the Gemini 20/day finding (D-05) and the accumulated
  tradeoff history.

### README
- `README.md` — lines 9-10 carry the false "does not yet ship a chat UI or the scoring engine"
  claim (D-09).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server-only` is already a declared dependency (`package.json`) and already imported in four
  files — D-01 is a one-line copy of an established pattern, not a new mechanism.
- `RateLimiterMemory` from `rate-limiter-flexible` is already wired in `src/lib/rateLimiter.ts`
  with two tiers. Left untouched per D-04, but noted: a daily tier would be trivial if the
  decision is ever revisited.
- `src/domain/scoring/expansionScore.test.ts` already runs the engine against fixed fixtures for
  SCORE-05, so the worked example (D-07) needs no new test scaffolding — only extraction.

### Established Patterns
- **Server/client boundary:** `page.tsx` is the sole `'use client'` component and imports nothing
  from `domain/` or `config/`. Everything else is server-side. Preserving that separation is the
  whole of SEC-01.
- **Middleware chain:** `proxy.ts` composes one-function-per-file checks
  (`ipRateLimitCheck` → `sessionIdValidationCheck` → `sessionRateLimitCheck`), each with its own
  colocated test. Any future limiter would follow that shape.
- **Adapter split:** `X.ts` (guarded wrapper, validates input, returns `AdapterResult`) over
  `X.client.ts` (raw HTTP, holds the base URL). D-01 closes the guard gap on the lower half.

### Integration Points
- `DESIGN.md` at the repo root; `README.md` links to it.
- Three one-line import additions in `src/domain/adapters/*.client.ts`.
- No changes to the scoring engine, the agent, the chat route, or the rate limiter.

</code_context>

<specifics>
## Specific Ideas

- The design doc's job is stated plainly: the code shows *what* the system does, not *why*.
  Nobody reading `SCORING_WEIGHTS = { volume: 1/3, headroom: 1/3, delayFrequency: 1/3 }` learns
  that the weights are equal because **no labeled outcome data exists to fit them against**, and
  that visible weights are the substitute for statistical justification. That sentence is the
  kind of thing `DESIGN.md` exists to carry.
- The BTS-via-Socrata question is the sharpest one a reviewer can ask ("isn't there a live
  passenger-data API?"). The answer — yes, it is reachable live, and excluding it was a scoping
  decision rather than a data limitation — must appear in the alternatives section, not be left
  to look like an oversight.

</specifics>

<deferred>
## Deferred Ideas

- **Daily quota cap** (global and/or per-session `RateLimiterMemory` at `duration: 86400`) —
  presented with three variants and explicitly declined in favor of documenting the limitation
  (D-04). Do not build it in this phase.
- **Bundle-scanning SEC-01 test** (`next build` + grep over `.next/static`) — considered and
  declined (D-02).
- **Documented manual SEC-01 verification** — considered and declined (D-03).
- **`docs/` directory with split design documents** — considered and declined in favor of one
  root `DESIGN.md` (D-06).
- **Sample questions in the README** and **a sample chat transcript in the submission** — offered
  during packaging and not selected (D-10).
- **Reinstating a registry-backed airport allowlist** (the original SEC-02 design deleted in the
  2026-08-13 pivot) — out of this phase's scope; format-level validation is what exists and it is
  in place at every adapter entrypoint.

</deferred>

---

*Phase: 05-security-hardening-design-doc-submission-packaging*
*Context gathered: 2026-09-02*
