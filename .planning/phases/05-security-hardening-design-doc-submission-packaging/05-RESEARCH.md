# Phase 5: Security Hardening, Design Doc & Submission Packaging - Research

**Researched:** 2026-09-02
**Domain:** Next.js server/client trust-boundary enforcement, rate-limit chain documentation, technical design-document authorship
**Confidence:** HIGH

## Summary

This phase is ~90% documentation authorship and ~10% a three-line code change. Two of the three
requirements (SEC-01, SEC-03) are already substantively met in code; the work is (a) closing one
real enforcement gap in SEC-01 by adding `import 'server-only';` to three files that currently
hold upstream base URLs but are only transitively protected, and (b) writing `DESIGN.md`, a single
root-level document that must explain the scoring methodology with a real worked example, name
tradeoffs, disclose AI usage on two axes (product runtime vs. build process), and enumerate
alternatives considered and declined. A stale README claim also needs a one-line correction.

Every canonical file reference and line number cited in `05-CONTEXT.md` was independently
re-read against the current file contents in this research pass and confirmed accurate — no
drift was found (see `## Canonical Reference Verification`). The scoring formula, the four
`server-only`-importing files, the rate-limit chain's three-check composition, and the README's
stale sentence all match exactly what CONTEXT.md describes. The one piece of genuine research
value added here beyond re-stating CONTEXT.md is: (1) the exact mechanism by which `server-only`
fails a client import — verified directly from `node_modules/server-only` and
`node_modules/next/dist/build/create-compiler-aliases.js` source, not assumed from memory — and
(2) fully worked, hand-verified arithmetic for the recommended `DESIGN.md` example, computed
independently from the raw fixture data in `expansionScore.test.ts` and cross-checked against
that file's own `toBeCloseTo` assertions.

**Primary recommendation:** Do the three-line `server-only` edit first (five minutes, zero risk,
mechanically verified by `npm run build` or `npm run typecheck` passing and by attempting — then
reverting — a throwaway client-component import of one `.client.ts` file to observe the failure
locally before writing DESIGN.md's security section). Then write `DESIGN.md` using the SMALL/BUSY/ANC
fixture from `expansionScore.test.ts`'s first test as the primary worked example (recommended
below with full arithmetic), and the P/Q fixture from the same file's second test as the secondary
example illustrating weight redistribution when a source is unavailable.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Secret/upstream-URL isolation (SEC-01) | API / Backend (server-only modules) | Browser / Client (must contain zero secrets or base URLs) | The guard lives in the modules that hold the secrets/URLs (`*.client.ts`, `env.ts`); the browser tier's job is simply to never import them — enforced by making violation a hard failure at the module boundary, not by anything the client tier does itself. |
| Per-session rate limiting (SEC-03) | API / Backend (`src/proxy.ts` + `src/lib/middleware/*`) | — | Runs entirely server-side, ahead of the route handler; no client-tier involvement. |
| Design documentation (DOC-01) | N/A — repository documentation, not a runtime tier | — | `DESIGN.md` describes tiers/behavior; it is not itself part of any runtime tier. |

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

- **D-01:** Add `import 'server-only';` to `src/domain/adapters/opensky.client.ts`,
  `src/domain/adapters/nasStatus.client.ts`, `src/domain/adapters/faaFacility.client.ts` —
  converting today's transitive protection into direct build-boundary enforcement.
- **D-02:** No bundle-scanning test (`next build` + grep `.next/static`) — declined.
- **D-03:** No documented manual SEC-01 verification either — the `server-only` guard is the
  whole answer; nothing else is written up to prove SEC-01 to a reviewer.
- **D-04:** Leave the rate limiter exactly as-is; document the Gemini 20-requests/day gap instead
  of adding a daily cap. A daily cap (global or per-session, ~2 lines) was presented and declined.
- **D-05:** `DESIGN.md` must name the 20/day ceiling as a known limitation, with its workaround
  (wait for daily reset, or swap in a paid/alternate key).
- **D-06:** One `DESIGN.md` at the repo root, beside `README.md`, linked from it. A `docs/`
  directory with split files was considered and declined.
- **D-07:** The worked example's numbers come from the existing test fixtures in
  `expansionScore.test.ts` — not a live API run, not hand-invented.
- **D-08:** "Where AI is used" is split into two explicit subsections: (a) in the product — LLM
  parses intent, selects tools, narrates, never computes a number, but does supply labeled
  estimates (long-haul threshold, runway separation); (b) in building the project — written with
  Claude Code.
- **D-09:** Fix `README.md`'s false "does not yet ship a chat UI or the scoring engine" claim;
  add a link to `DESIGN.md`.
- **D-10:** No sample-question list in the README, no sample chat transcript in the submission.

> **Accepted gap — do not reinterpret:** the 10/min session limit does not protect Gemini's real
> 20-requests-per-day free-tier ceiling. Phase success criterion 2's literal wording ("hits a
> per-session rate limit before upstream API quota or LLM budget is exhausted") holds for a burst
> (it does trip the 10/min limit), but the LLM *budget* itself is genuinely unprotected. This is a
> stated, deliberate, user-confirmed gap — document it, do not fix it, do not silently narrow the
> success criterion's meaning during planning or verification.

### Claude's Discretion

- Section ordering and headings inside `DESIGN.md`.
- Which fixture airport from `expansionScore.test.ts` carries the worked example, and whether the
  normalization step is presented as a table or prose (research recommendation given below).
- Exact wording of the README correction.
- Whether the stale SEC-02 note in `REQUIREMENTS.md` is corrected as part of this phase's
  bookkeeping.

### Deferred Ideas (OUT OF SCOPE)

- Daily quota cap (global and/or per-session `RateLimiterMemory` at `duration: 86400`) —
  presented with three variants, explicitly declined (D-04). Do not build it.
- Bundle-scanning SEC-01 test (`next build` + grep `.next/static`) — declined (D-02).
- Documented manual SEC-01 verification — declined (D-03).
- `docs/` directory with split design documents — declined (D-06).
- Sample questions in the README and a sample chat transcript in the submission — offered, not
  selected (D-10).
- Reinstating a registry-backed airport allowlist (the SEC-02 design deleted 2026-08-13) — out of
  this phase's scope; format-level validation (`validate.ts`) is what exists and stays.
- **Open, unresolved (not this phase's call to make silently):** whether `.planning/` ships with
  the submitted repo. It is already committed to git; the standing default is that it ships
  untouched. Flag this to the user before submission rather than assuming either way.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-01 | Secrets and all upstream API calls are server-side only; no key or upstream endpoint is reachable from the browser | `## Canonical Reference Verification` confirms the three `.client.ts` gap and the exact `server-only` failure mechanism (`## server-only Mechanics`), so the plan can write a precise, checkable acceptance criterion instead of "the guard works." |
| SEC-03 | The chat endpoint is rate-limited per session so one client cannot exhaust the upstream quota or LLM budget | `## Rate-Limiting Chain (As Built)` documents the exact three-check order, limiter parameters, and the Gemini 20/day gap with its verified source, ready to drop into DESIGN.md verbatim. |
| DOC-01 | Design document explains the scoring methodology, key tradeoffs, where and how AI is used, and the alternatives considered and declined | `## Scoring Methodology (Raw Material for DESIGN.md)`, `## Worked Example`, `## AI Usage Disclosure Source Material`, and `## Alternatives Considered Inventory` supply the verified raw content; the planner needs only to assign it to DESIGN.md sections. |

</phase_requirements>

## Canonical Reference Verification

Every file/line reference in `05-CONTEXT.md`'s `<canonical_refs>` block was re-read against the
current repository state. Result: **all references are accurate, no drift found.**

| CONTEXT.md claim | Verified against | Result |
|---|---|---|
| `expansionScore.ts:8` — `SCORING_WEIGHTS` | Read file, line 8: `export const SCORING_WEIGHTS = { volume: 1/3, headroom: 1/3, delayFrequency: 1/3 } as const;` | Confirmed exact line and content. |
| `expansionScore.ts:77` — `minMaxNormalize` | Line 77: `export function minMaxNormalize(value: number, dataset: number[]): number {` | Confirmed exact line. |
| `expansionScore.ts:126` — `scoreAirports` | Line 126: `export function scoreAirports(inputs: ScoringInput[]): ExpansionScore[] {` | Confirmed exact line. |
| `expansionScore.ts:52` — `isCargoCallsign` | Line 52: `export function isCargoCallsign(callsign: string \| null): boolean {` | Confirmed exact line. |
| `README.md:9-10` — stale "early foundation work ... does not yet ship a chat UI or the scoring engine" claim | Lines 9-10 of `README.md`, read verbatim | Confirmed exact text, unchanged. |
| Three `.client.ts` files hold base-URL constants and lack `server-only` | `opensky.client.ts:7-8` (`TOKEN_ENDPOINT`, `FLIGHTS_BASE`), `nasStatus.client.ts:5` (`NAS_FEED_URL`), `faaFacility.client.ts:6` (`ARCGIS_BASE`) | Confirmed all three constants present; confirmed via `grep -l "server-only"` across `src/` that none of these three files import it. |
| Four files already import `server-only` | Grep for `server-only` across `src/` | Confirmed exactly four source files: `src/config/env.ts`, `src/domain/adapters/opensky.ts`, `src/domain/adapters/nasStatus.ts`, `src/domain/adapters/faaFacility.ts` (the guarded wrappers, not the `.client.ts` files — matches CONTEXT.md's framing precisely). |
| `proxy.ts` composes `ipRateLimitCheck` → `sessionIdValidationCheck` → `sessionRateLimitCheck` | Read `src/proxy.ts` | Confirmed exact order and early-return-on-block structure. |
| `rateLimiter.ts` — IP 30/min, session 10/min | Read `src/lib/rateLimiter.ts` | Confirmed: `RateLimiterMemory({ points: 10, duration: 60 })` (session) and `RateLimiterMemory({ points: 30, duration: 60 })` (IP). |
| `google.ts` SYSTEM_PROMPT / `runAgent` loop | Read `src/adapters/llm/google.ts` | Confirmed; full text quoted below in `## AI Usage Disclosure Source Material`. |
| `tools.ts` tool declarations | Read `src/domain/agent/tools.ts` | Confirmed four tools: `resolve_region`, `score_airports`, `flight_destinations`, `runway_conditions`. |

**No corrections needed to any canonical reference.** The planner can write task acceptance
criteria directly against these line numbers without re-verification.

## server-only Mechanics (Precise, Source-Verified)

**What the package does, verified by reading its own source** (`node_modules/server-only/index.js`,
`node_modules/server-only/package.json` — `[VERIFIED: local package source]`):

- `server-only`'s `package.json` `exports` field maps the `"react-server"` condition to an empty
  no-op module (`empty.js`) and the `"default"` condition to `index.js`, whose entire content is:
  ```js
  throw new Error(
    "This module cannot be imported from a Client Component module. " +
      "It should only be used from a Server Component."
  );
  ```
- Next.js's own bundler config (`node_modules/next/dist/build/create-compiler-aliases.js`,
  function `createServerOnlyClientOnlyAliases(isServer)`) aliases `server-only$` to
  `next/dist/compiled/server-only/empty` **only** when compiling the RSC server layer
  (`isServer === true`). For every other compilation layer — the client bundle and the SSR layer
  used to render Client Components — it aliases to `next/dist/compiled/server-only/index`, i.e.
  the throwing module.

**Precise failure behavior (more exact than "the build breaks"):** the throw fires the instant
that module is evaluated in any non-RSC-server compilation graph. Concretely this means:
- If the importing Client Component is part of a route Next.js can statically prerender, the
  throw happens during `next build`'s prerender pass and **fails the build** with that exact error
  text in the terminal.
- If the route is rendered dynamically (this app's `page.tsx` chat UI is interactive and not a
  static prerender candidate), the throw instead surfaces on **the first server-render of that
  route** (first `npm run dev` request, or first production request after `next build`/`next
  start`) — same error text, but at request time rather than at `next build` compile time.

Either way, the practical guarantee D-01 buys is identical: no code path can ship a working build
that imports one of these three files from a Client Component — it always fails loudly, just at
slightly different points in the pipeline depending on whether the offending import lands on a
statically- or dynamically-rendered route. This distinction does not change any decision (D-02/D-03
already declined building a test or documenting a manual run either way) — it only means the
plan's acceptance criteria for D-01 should say "the import throws at module-evaluation time in any
client/SSR bundle (verified by reading the package source), not universally 'at `next build`'" if
it wants to be exact, rather than asserting a specific always-build-time failure.

**No test scaffolding needed or planned** — D-02 and D-03 both explicitly declined verification
of this mechanism; this section exists so the design doc's SEC-01 paragraph is technically
accurate rather than hand-waved.

## Scoring Methodology (Raw Material for DESIGN.md)

Full formula, verified by reading `src/domain/scoring/expansionScore.ts` in this session:

**Weights** (`SCORING_WEIGHTS`, line 8): `{ volume: 1/3, headroom: 1/3, delayFrequency: 1/3 }` —
equal weighting across three components. **Why equal, not fitted:** no labeled outcome data
exists to fit weights against (this exact framing is already captured in `05-CONTEXT.md`'s
`<specifics>` block and in `STATE.md`'s Blockers/Concerns — treat as a decision to restate in
DESIGN.md, not to re-derive).

**Per-component KPI definitions:**

| Component | KPI computed | Function | Inputs |
|---|---|---|---|
| Volume | `passengerMovements` (total movements minus cargo-classified movements) | `computeVolumeKpi` | `Movements` (OpenSky) |
| Headroom | `movementsPerRunway` = `totalMovements / max(1, runwayCount)` | `computeHeadroomKpi` | `Movements` + `FaaFacility.runways` |
| Delay frequency | `eventCount` = count of active NAS Status events | `computeDelayKpi` | `NasStatus.events` |

**Cargo classification** (`isCargoCallsign`, line 52): a flight's callsign is cargo if it starts
with any of `CARGO_CALLSIGN_PREFIXES = ['FDX','UPS','GTI','CKS','ABX','PAC','CLX','ACA','DAL','AAL']`
(line 6) after trim+uppercase; a `null` callsign is never classified as cargo.

**Normalization** (`minMaxNormalize`, line 77): min-max scaled to a 0–100 range **across the
current query's dataset**, not against any fixed/global reference range:
```ts
export function minMaxNormalize(value: number, dataset: number[]): number {
  if (dataset.length === 0) return 0;
  const min = Math.min(...dataset);
  const max = Math.max(...dataset);
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 100;
}
```
This has a direct consequence worth stating in DESIGN.md: **scores are relative to the airports in
the same query, not absolute** — the same airport can normalize to a different score depending on
what else is in its comparison set. A single-airport query returns `50` for every available
component (the `max === min` branch), which is itself worth one disclosure sentence.

**Reweighting when a source is unavailable** (`scoreAirports`, line 126): each of the three
components resolves independently to either a KPI or `null` (source failed/unavailable/no-data).
`weightPerComponent = availableCount > 0 ? 1 / availableCount : 0` — i.e., weight is redistributed
evenly across whatever *did* resolve, not left at a fixed 1/3 with a zero contribution for the
missing component. If every source fails, score is `0` with `weightPerComponent: 0` and
`coverage: '0 of 3 components available'`.

**Zero-traffic handling** (per `STATE.md` quick-task `260901-g0s`, confirmed present in the test
file's "ranks an airport with zero measured traffic below a busy one" test): an airport with zero
observed movements keeps all three components available (a measured zero, not a failure) and
normalizes to the bottom of the range — it is not excluded from scoring.

## Worked Example (Recommendation: Claude's Discretion, D-07)

**Recommendation: use the SMALL/BUSY/ANC three-airport fixture from the first test in
`expansionScore.test.ts`** ("separates cargo from passenger movements and normalizes every
component across the query set") as the primary worked example, presented as a table. Reasoning:

1. It is the only fixture with all three components available for every airport, so it
   demonstrates the full formula (weights, normalization, contribution, total score) without a
   footnote about a degraded case.
2. Min-max normalization is dataset-relative — it needs at least two data points to be
   illustrative at all (a single-airport example would trivially all resolve to `50`). This
   fixture has three, giving a low/mid/high spread on every axis.
3. ANC's fixture is deliberately the SCORE-04 (cargo-vs-passenger) illustration: it has the same
   raw movement count as SMALL's spread pattern but is dominated by cargo callsigns, so its
   headroom KPI (raw movement count) and its volume KPI (cargo-stripped) diverge sharply — this is
   the single clearest demonstration in the codebase of *why* cargo separation matters (a
   cargo-heavy airport is not misread as passenger demand), which is exactly the sentence
   `05-CONTEXT.md`'s `<specifics>` block singles out as worth stating in DESIGN.md.

**Full arithmetic, independently recomputed in this research pass and cross-checked against the
test file's own `toBeCloseTo` assertions (all matched exactly):**

| Airport | Raw movements | Cargo | Passenger (volume KPI) | Runways | Movements/runway (headroom KPI) | Delay events |
|---|---|---|---|---|---|---|
| SMALL | 10 (5×UAL1 + 5×SWA1) | 0 | 10 | 2 | 5.0 | 0 |
| BUSY | 100 (50×UAL2 + 50×SWA2) | 0 | 100 | 4 | 25.0 | 1 |
| ANC | 20 (8×FDX1 + 2×UAL3 + 8×FDX2 + 2×SWA3) | 16 | 4 | 3 | 6.667 | 0 |

Normalization (min-max across these three per component):

| Component | Dataset | SMALL normalized | BUSY normalized | ANC normalized |
|---|---|---|---|---|
| Volume (passenger movements) | [10, 100, 4] → min 4, max 100 | (10-4)/96×100 = **6.25** | (100-4)/96×100 = **100** | (4-4)/96×100 = **0** |
| Headroom (movements/runway) | [5, 25, 6.667] → min 5, max 25 | (5-5)/20×100 = **0** | (25-5)/20×100 = **100** | (6.667-5)/20×100 = **8.333** |
| Delay frequency (event count) | [0, 1, 0] → min 0, max 1 | **0** | **100** | **0** |

Final score (equal 1/3 weight per component, all three available for all three airports):

| Airport | Score | Arithmetic |
|---|---|---|
| SMALL | **2.083** | (6.25 + 0 + 0) / 3 |
| BUSY | **100.0** | (100 + 100 + 100) / 3 |
| ANC | **2.778** | (0 + 8.333 + 0) / 3 |

**Secondary example — reweighting when a source fails** (second test, "redistributes weight
across the surviving components when the delay source fails"): airports P (30 movements) and Q
(90 movements), both single-runway, both with `nasStatus` failing (`FailureKind.Unavailable`).
Volume dataset `[30, 90]` and headroom dataset `[30, 90]` (movements/runway = movements/1) both
normalize P to 0 and Q to 100 on both surviving components. `weightPerComponent` becomes `1/2 =
0.5` (not `1/3`) because only 2 of 3 components resolved. Final scores: P = `(0+0)×0.5 = 0`, Q =
`(100+100)×0.5 = 100`. **Use this as a one-paragraph supplementary illustration of the
reweighting mechanic**, not as the primary example — it's clean but has less to show (no cargo
split, only two components).

## Rate-Limiting Chain (As Built)

Verified by reading `src/proxy.ts`, `src/lib/middleware/ipRateLimitCheck.ts`,
`src/lib/middleware/sessionIdValidationCheck.ts`, `src/lib/middleware/sessionRateLimitCheck.ts`,
and `src/lib/rateLimiter.ts` in this session. **DESIGN.md documents this chain; it is not changed
by this phase (D-04).**

Order of checks in `proxy.ts` (each returns a `NextResponse` immediately on block, otherwise
`null` and falls through to the next check):

1. **`ipRateLimitCheck`** — keys on `x-forwarded-for` (first entry, trimmed; falls back to the
   literal string `'unknown'` if absent) against a `RateLimiterMemory({ points: 30, duration: 60 })`
   — 30 requests/minute per IP. Returns HTTP `429` with `{ ok: false, error: { code: 'rate_limited', message: 'Rate limit exceeded' } }` on block.
2. **`sessionIdValidationCheck`** — validates the `x-session-id` header is a strict UUID via
   `z.uuid().safeParse(...)`. Returns HTTP `400` with `{ ok: false, error: { code: 'invalid_session_id', ... } }` if missing or malformed. (This closed a prior session-hijack finding, CR-02 from
   `04-REVIEW.md` — the two downstream consumers no longer fall back to a spoofable
   `x-forwarded-for`/`'anon'` chain.)
3. **`sessionRateLimitCheck`** — keys on the now-validated `x-session-id` against a
   `RateLimiterMemory({ points: 10, duration: 60 })` — 10 requests/minute per session. Same `429`
   response shape as the IP check.

**Known, deliberately undocumented-until-now gap (D-04/D-05):** neither limiter has any per-day
window. Gemini's actual free-tier ceiling for the configured model is **20 requests/day**,
confirmed live via a `429 RESOURCE_EXHAUSTED` response naming
`GenerateRequestsPerDayPerProjectPerModel-FreeTier` (`STATE.md`, entry dated 2026-08-23 —
`[CITED: STATE.md, first-party live reproduction]`, not a vendor-documented number, since Google's
own published free-tier limits page does not appear to state this figure explicitly for this
model as of this research date). At 10 requests/minute, a single session can exhaust an entire
day's LLM quota in about 3 minutes without ever tripping either rate limiter. **This is the
literal content DESIGN.md's "known limitations" section must state per D-05** — including the
workaround (wait for the daily UTC reset, or provide an alternate/paid `GOOGLE_GENERATIVE_AI_API_KEY`).

## AI Usage Disclosure Source Material (D-08)

**(a) In the product** — verified by reading `src/adapters/llm/google.ts` `SYSTEM_PROMPT` in full
(quoted verbatim, current as of this research date):

> "You are an airport investment analyst assistant. For any question about specific airports or
> US regions, use the provided tools to resolve airport codes and compute scores - never invent
> scores, KPI numbers, or airport data yourself; only state numbers that came from a tool result.
> For any airport-specific answer, state the data window used (a tool result's window field) and
> which figures are measured versus proxied (a tool result's measuredVsProxied field). When
> answering a long-haul-flight-share question, call flight_destinations and state the long-haul
> distance threshold you use, explicitly labeling the long-haul/short-haul classification as your
> own estimate, not a code-computed value. When answering a why-does-this-airport-have-unmet-demand
> question, call runway_conditions and explicitly label any runway-separation or grouping judgment
> as your own estimate from the provided coordinates, not a code-computed value, cross-referenced
> against the result's delayEvents. If the question does not name or imply any airport or US
> region, answer directly without calling any tool."

This is the single source for two labeled-estimate cases the AI-usage section must name
specifically (also cross-confirmed against `04-CONTEXT.md`'s explicit decisions, which is why
these two tools compute *no* distance/separation in code at all):

- **Long-haul threshold and classification** (`flight_destinations` tool) — the LLM itself
  chooses and states a distance threshold and classifies each destination; no great-circle
  distance function exists anywhere in the codebase (confirmed: `tools.ts`'s
  `flightDestinationsTool` returns only real ICAO destination codes, no coordinates, no distance
  math).
- **Runway separation / parallel-runway judgment** (`runway_conditions` tool) — the LLM reasons
  over real runway endpoint coordinates (`RunwayGeometry.end1`/`end2`) and real, sanitized delay
  events; no parallel-runway-detection or separation-distance algorithm exists in code (confirmed:
  `runwayConditionsTool` returns raw `runways: RunwayGeometry[]` and `delayEvents` only).

**The tool boundary itself** (from `tools.ts`, `TOOL_DECLARATIONS`): four tools —
`resolve_region`, `score_airports`, `flight_destinations`, `runway_conditions` — each returns only
real, code-fetched/computed data; the LLM's role per `runAgent` (`google.ts`) is strictly:
send the query, receive up to `MAX_TOOL_ROUNDS - 1 = 3` rounds of tool calls, then narrate from
tool results. There is no code path by which the LLM's own generated text becomes a number shown
elsewhere in the app (CHAT-02's stricter "never parsed from prose" reading was explicitly accepted
as already-satisfied in `04-CONTEXT.md`, not revisited here).

**(b) In building the project** — per D-08 and this project's own `CLAUDE.md`
(`GSD Workflow Enforcement` section, plus the repo's actual `.claude/` GSD tooling), the codebase
was written using Claude Code. This is a one- or two-sentence disclosure, not a technical
subsection — no further research needed.

## Alternatives Considered Inventory (Raw Material for DESIGN.md)

The following were identified, evaluated, and explicitly declined during this project's build.
Source: `.planning/PROJECT.md` Out of Scope + Key Decisions, and `.claude/CLAUDE.md`'s research
record (both read in full this session). The planner should have the design-doc-writing task
select from this list rather than leave "alternatives considered" open-ended:

| Alternative | Why it was considered | Why it was declined | Source |
|---|---|---|---|
| BTS passenger data via Socrata REST (`data.transportation.gov`) | Genuinely live-queryable, would supply real (not proxied) passenger counts, arguably satisfies "live API" literally | Scoping choice to keep the one-day build's data story simple/consistent; flagged as the single sharpest question a reviewer is likely to ask | PROJECT.md Out of Scope; `.claude/CLAUDE.md` Q1 §6 |
| Amadeus for Developers Self-Service API | Would have been a credible commercial flight-data source | Fully decommissioned July 17, 2026 — not viable regardless of era of documentation consulted | `.claude/CLAUDE.md` Q1 §5 |
| AviationStack | Commercial flight-data API | 100 requests/**month** total — unusable for a chat agent fanning out multiple queries per turn | `.claude/CLAUDE.md` Q1 §5 |
| AeroDataBox (RapidAPI) | Commercial flight-data API, claims 100% US schedule coverage | 600 units/month, 1 req/sec, hard 2,400/month cap — another quota to babysit during live grading | `.claude/CLAUDE.md` Q1 §5 |
| FlightAware AeroAPI | Commercial flight-data API | No confirmed genuine free tier (the "100 free" figure is itself unverified/LOW confidence) | `.claude/CLAUDE.md` Q1 §5 |
| TSA per-airport wait-time API | Would answer unmet-demand questions with a direct signal | Only a national daily aggregate exists as a REST-queryable source; the old MyTSA per-airport tool is retired; no live per-airport API exists at all | `.claude/CLAUDE.md` Q1 §6 |
| FAA ASWS (`soa.smext.faa.gov`) instead of `nasstatus.faa.gov` | Documented on SwaggerHub, used by some open-source integrations, narrower per-airport JSON | DNS resolution failure in this environment plus multi-year community reports of instability; `nasstatus.faa.gov` is airport-agnostic and was live-verified working | `.claude/CLAUDE.md` Q1 §2 |
| Persistent database (MySQL or similar) | Would be the conventional choice for a data-backed app | No users, no joins, no query too expensive to compute live; a required DB server would make the demo fragile on the reviewer's machine — a cache, not a database, is what's needed | PROJECT.md Out of Scope + Key Decisions |
| Second LLM provider | Redundancy if Gemini free tier is rate-limited or down | The AI SDK's provider-swap is a one-line change — building two paths up front is self-defeating given that exact justification | PROJECT.md Out of Scope + Key Decisions |
| Real financial modeling (NPV/IRR/construction cost) | Would make "opportunity" scoring feel more concrete | No cost data available; inventing it would be dishonest — directly contradicts the project's honesty core value | PROJECT.md Out of Scope |
| Registry-backed SSRF allowlist for airport codes (original SEC-02 design) | Stronger validation than format-only regex | Deleted in the 2026-08-13 architecture pivot for build-time budget reasons; format-only validation (`validate.ts`) is the accepted substitute | REQUIREMENTS.md SEC-02 note; STATE.md 2026-08-13 entries |
| Daily rate-limit cap (this phase, D-04) | Would actually protect the Gemini 20/day ceiling | Explicitly declined in favor of documenting the gap — user's direct choice during `/gsd-discuss-phase` | `05-CONTEXT.md`, `05-DISCUSSION-LOG.md` |
| Bundle-scanning SEC-01 test / documented manual verification (D-02/D-03) | Would give a reviewer independently-checkable proof | Slow, needs valid credentials to build; prevention (the `server-only` throw) was judged sufficient without an accompanying proof artifact | `05-CONTEXT.md`, `05-DISCUSSION-LOG.md` |
| LangChain / LangGraph | Common agent-framework choice | Massive dependency surface for a job that is exactly two LLM calls (intent-parse, narrate); every abstraction layer is a debugging tax the 24-hour budget can't afford | `.claude/CLAUDE.md` Q3 "What NOT to install" |
| Redis-backed rate limiting (`@upstash/ratelimit`) | The "correct" production tool for multi-instance rate limiting | No persistent DB, no multi-instance deployment, single-analyst demo — an in-memory `RateLimiterMemory` fully satisfies the stated requirement without cross-instance correctness the app doesn't need | `.claude/CLAUDE.md` Q3 "What NOT to install" |

## Architecture Patterns

### System Architecture Diagram — SEC-01/SEC-03 Trust Boundary

```
Browser (page.tsx, sole 'use client' component)
    │  imports nothing from domain/ or config/
    │  fetch('/api/chat', { headers: { 'x-session-id': <uuid> } })
    ▼
┌─────────────────────────────────────────────────────────────┐
│ src/proxy.ts  (Next.js Proxy — runs before route handler)    │
│                                                               │
│  1. ipRateLimitCheck    → 429 if IP > 30 req/min             │
│  2. sessionIdValidationCheck → 400 if x-session-id not UUID  │
│  3. sessionRateLimitCheck → 429 if session > 10 req/min      │
│                                                               │
│  (No daily cap — accepted gap, see D-04/D-05)                │
└─────────────────────────────────────────────────────────────┘
    │  NextResponse.next()
    ▼
app/api/chat/route.ts → runAgent(sessionId, query)  [google.ts]
    │
    ├─ SYSTEM_PROMPT instructs: never invent numbers, only narrate
    │  tool results; label own estimates (long-haul, runway sep.)
    │
    ▼
Gemini tool-round loop (up to 3 rounds)
    │
    ├─ resolve_region ─────┐
    ├─ score_airports ─────┤→ domain/agent/tools.ts
    ├─ flight_destinations ┤   (bridges to pure domain logic)
    └─ runway_conditions ──┘
                            │
                            ▼
              domain/scoring/*, domain/adapters/*
              (server-only guarded: env.ts, opensky.ts,
               nasStatus.ts, faaFacility.ts — plus, after
               D-01, the three .client.ts files too)
                            │
                            ▼
              Live upstream APIs (OpenSky, FAA NAS Status,
              FAA ArcGIS) — secrets/base URLs never leave
              this tier
```

A reader can trace: browser → proxy (3 checks) → agent loop → tool dispatch → pure scoring/adapter
code → live APIs, and see exactly where the `server-only` boundary sits (everything below the
proxy line) and exactly where the two rate-limit checks intercept (both before the route handler
ever runs).

### Recommended Project Structure (no changes this phase)

No new files or directories beyond `DESIGN.md` at the repo root. The three `.client.ts` edits are
one-line additions to existing files.

### Pattern: `server-only` Direct Guard (D-01)

**What:** `import 'server-only';` as the first import in a module that must never reach a client
bundle.
**When to use:** Any module holding a secret, a raw upstream base URL, or credential-bearing
logic — copy the existing pattern already used in `env.ts`, `opensky.ts`, `nasStatus.ts`,
`faaFacility.ts`.
**Example (this phase's actual change, three files, one line each):**
```ts
// src/domain/adapters/opensky.client.ts (and nasStatus.client.ts, faaFacility.client.ts)
import "server-only";
import type { AxiosInstance } from 'axios';
// ...rest of file unchanged
```

### Pattern: One-Function-Per-File Middleware Chain

**What:** Each proxy check is its own file/function (`ipRateLimitCheck.ts`,
`sessionIdValidationCheck.ts`, `sessionRateLimitCheck.ts`), composed by simple sequential
early-return in `proxy.ts`.
**When to use:** This phase does not add a new check (D-04 declined a daily-cap check), but any
future limiter would follow this exact shape — noted for DESIGN.md's "how it's structured" prose,
not for new code.

### Anti-Patterns to Avoid

- **Documenting SEC-01 as "the build always fails":** overstates the guarantee. Per
  `## server-only Mechanics`, the failure point is module-evaluation time in any non-RSC-server
  bundle — this is `next build`-time for statically prerenderable routes and first-request-time
  for dynamic ones. State the mechanism, not a simplified always-build-time claim.
- **Treating the 10/min session limit as protecting the LLM budget:** it protects against burst
  abuse of the endpoint; it does not protect Gemini's 20/day ceiling. Do not conflate the two in
  DESIGN.md's rate-limiting section — name both explicitly.
- **Re-deriving the worked example's numbers from scratch:** D-07 requires using the existing test
  fixture verbatim; hand-inventing "cleaner" round numbers instead would violate the decision and
  reintroduce exactly the drift risk D-07 was chosen to avoid.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Proving a client bundle contains no secrets | A custom `next build` + grep-`.next/static` test | Nothing (D-02 declined this entirely) — rely on the `server-only` throw as prevention | Explicit user decision; slow and needs valid credentials to build. Only mentioned here so a future contributor doesn't "helpfully" add it outside this phase's scope. |
| Per-session/IP rate limiting | A hand-rolled token-bucket/sliding-window counter | `rate-limiter-flexible`'s `RateLimiterMemory` (already in use) | Already the established pattern in `rateLimiter.ts` — this phase documents it, does not touch it. |
| Distance/separation math for AI disclosure sections | Nothing — there is genuinely no code to reference here | N/A | The LLM computes these itself per explicit `04-CONTEXT.md` decision; DESIGN.md's job is to disclose that fact, not to describe a nonexistent algorithm. |

**Key insight:** the phase's engineering surface is intentionally almost zero — the "don't
hand-roll" discipline here is mostly about *not* building things that were already explicitly
declined (bundle scanning, daily quota cap, split docs directory), not about avoiding a reinvented
library.

## Common Pitfalls

### Pitfall 1: Overstating what `server-only` proves
**What goes wrong:** Writing DESIGN.md's SEC-01 section as if the guard were verified by a test,
or as if it always fails exactly at `next build` time.
**Why it happens:** "It breaks the build" is the easy mental shorthand; the real mechanism (throw
at module-evaluation time, timing depends on prerender-ability) is less catchy but is what's
actually true.
**How to avoid:** Use the precise phrasing from `## server-only Mechanics` above.
**Warning signs:** DESIGN.md claims a specific test or CI check exists for this (none does, by
D-02/D-03).

### Pitfall 2: Silently "fixing" the accepted LLM-budget gap during planning
**What goes wrong:** A planner or verifier reads success criterion 2's wording ("hits a
per-session rate limit before upstream API quota or LLM budget is exhausted") and infers a daily
cap is required to make the criterion literally true.
**Why it happens:** The wording is genuinely ambiguous read in isolation from CONTEXT.md.
**How to avoid:** CONTEXT.md and this research both state explicitly: the burst case satisfies the
criterion's literal wording; the LLM budget itself is a documented, accepted gap, not a defect to
fix in this phase.
**Warning signs:** A plan task proposes adding a `duration: 86400` limiter — this directly
contradicts D-04.

### Pitfall 3: Using invented or "cleaned up" numbers in the worked example
**What goes wrong:** Hand-adjusting the SMALL/BUSY/ANC numbers for readability (e.g., rounding
6.667 to 6.7, or picking different callsign counts) breaks D-07's re-verifiability guarantee — a
reviewer running `npm test` would then see numbers that don't match DESIGN.md.
**Why it happens:** The real fixture numbers are slightly less tidy than hand-picked ones would be.
**How to avoid:** Copy the arithmetic from `## Worked Example` above verbatim; it has already been
independently recomputed and cross-checked against the test file's assertions in this research
pass.
**Warning signs:** DESIGN.md states a score, KPI, or normalized value that does not appear in
`## Worked Example`'s tables.

### Pitfall 4: Missing one of the three `.client.ts` files
**What goes wrong:** D-01 requires editing all three files; missing one leaves a real,
undocumented gap in SEC-01 enforcement.
**Why it happens:** `nasStatus.client.ts` is much shorter (21 lines) than the other two and is
easy to skip if scanning quickly.
**How to avoid:** All three files and their exact base-URL constant names are listed in
`## Canonical Reference Verification` above — check off `opensky.client.ts` (`TOKEN_ENDPOINT`,
`FLIGHTS_BASE`), `nasStatus.client.ts` (`NAS_FEED_URL`), `faaFacility.client.ts` (`ARCGIS_BASE`).

## Code Examples

### The three `server-only` additions (exact diff shape for all three files)
```ts
// Before (opensky.client.ts, nasStatus.client.ts, faaFacility.client.ts — first lines)
import type { AxiosInstance } from 'axios';
// ...

// After
import "server-only";
import type { AxiosInstance } from 'axios';
// ...
```
Matches the existing convention exactly as written in `env.ts` line 1 (`import "server-only";`
using double quotes — the codebase is not fully consistent on quote style between files, but this
is the style already used in the four existing guarded files; follow it for consistency with
those four rather than the project's broader single-quote convention seen elsewhere).

### Existing rate-limit chain (reference only — not modified)
```ts
// src/proxy.ts
export async function proxy(req: NextRequest) {
  const ipBlocked = await ipRateLimitCheck(req);
  if (ipBlocked) return ipBlocked;

  const sessionIdBlocked = await sessionIdValidationCheck(req);
  if (sessionIdBlocked) return sessionIdBlocked;

  const sessionBlocked = await sessionRateLimitCheck(req);
  if (sessionBlocked) return sessionBlocked;

  return NextResponse.next();
}
export const config = { matcher: '/api/chat' };
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| SEC-02 registry-backed SSRF allowlist (`allowlist.ts`, code-verified against a live ~500-airport dataset) | Format-only regex validation (`validate.ts`: `ICAO_PATTERN = /^[A-Z]{4}$/`, `IATA_PATTERN = /^[A-Z]{3}$/`) at every adapter entrypoint | 2026-08-13 architecture pivot | Weaker guarantee (shape-only, not existence-verified), explicitly accepted tradeoff; not this phase's decision to revisit. `REQUIREMENTS.md`'s SEC-02 note describing "no validation at all" is itself now stale and should be corrected (Claude's Discretion, per CONTEXT.md). |
| README claiming no chat UI / scoring engine shipped | Both ship and are functional (Phases 3-4 complete) | Phase 4 completion, 2026-08-23 | README is currently actively misleading a reviewer; D-09 fixes this. |

**Outdated documentation still live in the repo (to be fixed this phase):**
- `README.md:9-10` — the stale "early foundation work" claim (D-09).
- `REQUIREMENTS.md` SEC-02 note — describes a "no validation at all" state that is no longer
  accurate (format validation exists); correcting this is Claude's Discretion, not mandatory.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Google's published Gemini free-tier documentation does not itself state a clean "20 requests/day" figure for the configured model as a standing, stable number (the 20/day figure used here comes from one first-party live 429 reproduction on 2026-08-23, not from reading Google's current rate-limit docs page in this research session) | Rate-Limiting Chain / D-05 | If Google's free-tier limits have since changed (raised, lowered, or made per-key rather than per-project-per-model), DESIGN.md's stated workaround/number could be stale by the time a reviewer reads it. Low risk for a one-day project artifact graded shortly after submission, but worth one hedge sentence ("as observed on 2026-08-23") rather than stating 20/day as a permanent vendor guarantee. |
| A2 | The precise point at which `next build` vs. first-request throws the `server-only` error for *this specific app's* routing (page.tsx as a dynamic, non-prerendered route) was reasoned from Next.js's general bundler-aliasing mechanism, not observed by actually triggering the failure end-to-end in this app during this research session | server-only Mechanics | If `page.tsx` is in fact statically prerenderable in this app's current config (not verified either way this session), the failure could occur at `next build` time rather than first-request time, or vice versa. Either way the practical guarantee (D-01) is unaffected — only the exact wording of "when" the failure surfaces could be imprecise. A five-minute manual check (temporarily add and then revert a throwaway client import of one `.client.ts` file, run `npm run build`) would fully resolve this before writing DESIGN.md's exact phrasing, if the planner wants zero ambiguity. |

**If this table is short:** most other claims in this research were verified directly by reading
the current source files, package sources, or `STATE.md`'s own recorded live-test results in this
session — see `## Canonical Reference Verification` and the `[VERIFIED]`/`[CITED]` tags inline
above.

## Open Questions

1. **Does `.planning/` ship with the submitted repo?**
   - What we know: it is already committed to git; CONTEXT.md flags this as offered-and-not-decided
     during discussion, not resolved.
   - What's unclear: whether the user wants it curated/excluded before final submission, or
     genuinely wants it to ship as evidence of the reasoning process.
   - Recommendation: the planner should not silently decide this either way — surface it as an
     explicit question in the phase's final human-review step, not bury it in a task's assumptions.

2. **Is `REQUIREMENTS.md`'s stale SEC-02 note corrected in this phase?**
   - What we know: it's Claude's Discretion per CONTEXT.md; the underlying code-level facts are
     already stated correctly in CONTEXT.md's `<domain>` section regardless of whether the
     REQUIREMENTS.md file itself is edited.
   - What's unclear: whether "bookkeeping cleanliness" is worth a task in an otherwise
     documentation-focused phase.
   - Recommendation: low cost, low risk — a single-line edit. Worth including as a small task
     rather than leaving REQUIREMENTS.md self-contradictory with the corrected narrative in
     DESIGN.md.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| `server-only` npm package | D-01's three-file edit | Yes | `^0.0.1` (already in `package.json` dependencies; no install needed) | — |
| `next build` / `npm run typecheck` | Verifying D-01 doesn't break the build | Yes (established in prior phases) | Next.js 16.3.0 | — |
| `npm test` (Vitest) | D-07's worked example must remain re-verifiable | Yes | Vitest `^4.1.10` | — |

No missing dependencies. This phase introduces no new external tool, service, or package
requirement.

## Security Domain

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | No | Single-analyst demo tool, no login (explicit Out of Scope in PROJECT.md) |
| V3 Session Management | Partial | `x-session-id` is a client-supplied UUID validated by `sessionIdValidationCheck` (zod `z.uuid()`) before any downstream use — this is request correlation, not an authenticated session; already built, not modified this phase |
| V4 Access Control | No | No user roles or protected resources beyond the single chat endpoint |
| V5 Input Validation | Yes | `validate.ts` (`ICAO_PATTERN`/`IATA_PATTERN` regex) gates every airport identifier before it reaches an outbound URL; `sessionIdValidationCheck` gates the session header via zod; both already built, unchanged this phase |
| V6 Cryptography | No | No cryptographic operations in this phase's scope (OAuth2 bearer tokens are handled by the OpenSky client, out of this phase) |
| V10 Malicious/SSRF | Yes | Format-only allowlist (regex shape check) on airport codes before URL construction is the accepted, current mitigation (registry-backed allowlist was deliberately removed 2026-08-13); this phase does not change it, only documents it accurately |
| V13 API and Web Service | Yes | `server-only` module boundary (D-01) is the concrete control for "no secret/endpoint reachable from the browser" — this phase's actual code change |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation (as built, unchanged this phase) |
|---|---|---|
| Secret/base-URL exfiltration via accidental client-component import | Information Disclosure | `server-only` marker package throwing at module-evaluation time in any non-RSC-server bundle (this phase closes the last gap: the three `.client.ts` files) |
| SSRF via malformed/attacker-controlled airport identifier reaching an outbound URL | Tampering | Regex shape validation (`validate.ts`) before URL construction in every adapter; format-only, not existence-verified (accepted, documented tradeoff) |
| Single-session resource exhaustion of upstream API quota or LLM budget | Denial of Service | Two-tier `RateLimiterMemory` (IP 30/min, session 10/min) ahead of the route handler; does **not** cover the Gemini 20/day ceiling — accepted, documented gap (D-04/D-05) |
| Session-ID spoofing/collision (prior finding, already fixed) | Spoofing | `x-session-id` strict UUID validation via zod, both downstream consumers dropped their spoofable `x-forwarded-for`/`'anon'` fallback (fixed in quick task `260820-lx1`, unrelated to this phase but relevant context for DESIGN.md's session-management paragraph) |
| Prompt injection via untrusted third-party API text reaching LLM context | Tampering (of LLM behavior) | SEC-04, already verified in Phase 4 — out of this phase's scope but worth one cross-reference sentence in DESIGN.md since it's adjacent to the AI-usage disclosure section |

## Sources

### Primary (HIGH confidence — verified this session by direct file/source read)
- `src/domain/scoring/expansionScore.ts` — full formula, line-by-line read
- `src/domain/scoring/expansionScore.test.ts` — fixture data and arithmetic, independently recomputed and cross-checked
- `src/domain/adapters/opensky.client.ts`, `nasStatus.client.ts`, `faaFacility.client.ts` — base-URL constants and current lack of `server-only`
- `src/config/env.ts`, `src/domain/adapters/{opensky,nasStatus,faaFacility}.ts` — confirmed existing `server-only` usage pattern
- `node_modules/server-only/index.js`, `node_modules/server-only/package.json` — exact throw mechanism
- `node_modules/next/dist/build/create-compiler-aliases.js` — `createServerOnlyClientOnlyAliases` bundler-aliasing logic
- `src/proxy.ts`, `src/lib/rateLimiter.ts`, `src/lib/middleware/{ipRateLimitCheck,sessionIdValidationCheck,sessionRateLimitCheck}.ts` — full rate-limit chain
- `src/adapters/llm/google.ts` — `SYSTEM_PROMPT`, `runAgent` loop, full read
- `src/domain/agent/tools.ts` — all four tool declarations and handlers, full read
- `README.md`, `package.json`, `.env.example` — current submission-facing state

### Secondary (MEDIUM confidence)
- `.planning/PROJECT.md` — Out of Scope and Key Decisions tables (project's own prior research, not independently re-verified against live vendor pages this session)
- `.claude/CLAUDE.md` — research record for the alternatives inventory (OpenSky, FAA, commercial APIs, LLM pricing, "what NOT to install" table); this document itself states confidence levels per finding (e.g., FlightAware's free tier explicitly flagged LOW confidence there already)
- `.planning/STATE.md` — Gemini 20/day live-429 finding (first-party observation, dated 2026-08-23, not cross-checked against Google's current published docs this session)

### Tertiary (LOW confidence)
- None used without an accompanying HIGH/MEDIUM-confidence corroboration in this research pass.

## Metadata

**Confidence breakdown:**
- Canonical reference accuracy (line numbers, file contents): HIGH — every claim re-read against live files in this session
- `server-only` failure mechanics: HIGH — verified from package and bundler source directly, not from memory or docs
- Scoring formula and worked-example arithmetic: HIGH — recomputed independently and matched against the test file's own assertions
- Rate-limiting chain description: HIGH — read all four composing files directly
- Alternatives inventory: MEDIUM — sourced from the project's own prior (already-dated) research record, not re-verified against live vendor pages this session
- Gemini 20/day figure: MEDIUM — a real, first-party live reproduction, but not cross-checked against Google's current published rate-limit documentation in this session

**Research date:** 2026-09-02
**Valid until:** Indefinite for the code-derived findings (formula, fixtures, file structure — these only change if the code changes, which this phase does not do beyond the three-line D-01 edit). ~30 days for the vendor-quota and alternatives-inventory findings (LLM pricing/quotas and commercial API tiers can change without notice).
