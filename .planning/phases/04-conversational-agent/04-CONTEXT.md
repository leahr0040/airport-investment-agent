# Phase 4: Conversational Agent — Chat, Tool-Calling & Analyst Questions - Context

**Gathered:** 2026-08-20
**Status:** Ready for planning
**Source:** Interactive discussion during `/gsd-plan-phase 4 --gaps`

<domain>
## Phase Boundary

This is a **gap-closure** context, not a fresh-phase context. Phase 4 was already executed and verified (`04-VERIFICATION.md`, 2026-08-19). Verification found 4 failed success-criterion sub-clauses. This plan closes 3 of them (QUERY-03, QUERY-04, QUERY-05). The 4th (CHAT-02) is explicitly accepted as-is and out of scope — see decision below.

</domain>

<decisions>
## Implementation Decisions

### CHAT-02 — Explicitly Out of Scope (deliberate, not an oversight)
- The current architecture (LLM calls `score_airports`, code computes deterministically, LLM narrates from the real tool result; nothing else is rendered) is accepted as sufficient. The user's reasoning: the tool-calling pattern already satisfies "the code computes deterministically, the agent only narrates from real results" — the roadmap's stricter wording ("never parsed out of prose") is not being pursued further in this plan.
- Do **not** add a structured `scores` field to the `/api/chat` response or any structured score-rendering to `page.tsx` as part of this plan.

### QUERY-03 — Long-haul flight share
- Build a new tool (same declarative pattern as `resolve_region`/`score_airports` in `src/domain/agent/tools.ts`) that exposes **real** per-flight destination data for a given airport — the actual `estArrivalAirport` ICAO codes from `Movements.departures`, via the existing `fetchMovements` adapter. No new adapter needed.
- **Do NOT** implement a great-circle/haversine distance function or a destination-coordinate lookup (neither reusing `fetchFaaFacility` nor adding OurAirports) in code. Explicit user decision: the LLM itself estimates distance and classifies long-haul vs. short-haul from the real destination codes, using its own reasoning — not a code-computed distance. (Considered and explicitly rejected: code-side deterministic distance calc, in both a US-only and worldwide-coverage variant.)
- `SYSTEM_PROMPT` (`src/adapters/llm/google.ts`) must instruct the model to: (a) state the long-haul distance threshold it is using, (b) explicitly disclose that the long-haul classification is its own estimate, not a code-computed value — distinct from the movement counts and score, which are code-computed.

### QUERY-04 — Runway separation / unmet-demand physical cause
- Build a new tool that exposes **real** runway geometry for a given airport — `FaaFacility.runways[]` (`RunwayGeometry`: `runwayId`, `lengthFt`, `widthFt`, `end1`/`end2` lat/lon) via the existing `fetchFaaFacility` adapter — plus **real** active delay/closure events via the existing `fetchNasStatus` adapter (`NasStatus.events[]`). Both adapters already exist and are already called in `buildScoringInputs.ts`, just never exposed as raw data to any tool.
- **Do NOT** implement a parallel-runway-detection algorithm or a separation-distance computation in code. Explicit user decision: the LLM reasons over the real runway geometry + real delay events itself to produce the physical-cause narrative — not a code-computed separation distance. (Considered and explicitly rejected: RWY_ID-based parallel-pair grouping + haversine separation distance in code, cross-referenced against a cited FAA independent-approach threshold.)
- `SYSTEM_PROMPT` must instruct the model to disclose that any stated separation distance / parallel-runway judgment is its own geometric estimate from the provided coordinates, not a code-computed value, and to cross-reference it against any active delay events present in the tool result.

### QUERY-05 — Universal assumptions/data-window/proxy disclosure
- `Movements.window` (already computed in the OpenSky adapter, `src/domain/adapters/opensky.types.ts`) is currently discarded in `computeVolumeKpi` (`src/domain/scoring/expansionScore.ts`) before it reaches `ExpansionScore`. Thread it through so it is present in the `score_airports` tool result.
- Add an explicit measured-vs-proxied label to `ExpansionScore`/`VolumeKpi` output — at minimum, flag that `passengerMovements`/`cargoMovements` are movement-count proxies for actual passenger/cargo volume, not measured passenger counts (consistent with CLAUDE.md's already-documented trade-off).
- Update `SYSTEM_PROMPT` to require every answer state: the data window used (from the tool result's `window` field), what's measured vs. proxied, and — per the QUERY-03/QUERY-04 decisions above — any distance/separation thresholds or estimates the model itself supplied (as opposed to code-computed figures).

### Claude's Discretion
- Exact tool names/shapes for the two new tools (e.g. `flight_destinations`, `runway_geometry` or similar) — follow the existing `TOOL_DECLARATIONS`/`TOOL_HANDLERS` pattern in `tools.ts`.
- Exact wording/placement of the new `SYSTEM_PROMPT` disclosure instructions.
- Whether the two new tools are separate or combined — stay consistent with the existing one-tool-per-capability pattern (`resolve_region`, `score_airports`) unless there's a strong reason to combine.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Gap source
- `.planning/phases/04-conversational-agent/04-VERIFICATION.md` — the verification report that found these gaps. Read the YAML frontmatter `gaps:` block for the precise failure descriptions for QUERY-03/QUERY-04/QUERY-05 (the CHAT-02 entry there is explicitly out of scope per the decision above).

### Requirements
- `.planning/REQUIREMENTS.md` lines 58-71 — QUERY-01 through QUERY-05, CHAT-01 through CHAT-04 (source: project brief + research + user scoping decisions).

### Existing code this plan builds on top of (read before modifying)
- `src/domain/agent/tools.ts` — existing `TOOL_DECLARATIONS`/`TOOL_HANDLERS` pattern to extend.
- `src/domain/adapters/opensky.types.ts` — `FlightMovement`/`Movements` types (`estArrivalAirport`, `window`).
- `src/domain/adapters/opensky.ts` — `fetchMovements` adapter (already fetches what QUERY-03 needs).
- `src/domain/adapters/faaFacility.ts` — `FaaFacility`/`RunwayGeometry` types, `fetchFaaFacility` adapter (already fetches what QUERY-04 needs).
- `src/domain/adapters/nasStatus.ts` — `NasStatus`/`NasStatusEvent` types, `fetchNasStatus` adapter (already fetches what QUERY-04 needs).
- `src/domain/scoring/expansionScore.ts` — `ScoringInput`/`ExpansionScore`/`VolumeKpi` types, `computeVolumeKpi` (where `window` is currently dropped).
- `src/domain/scoring/buildScoringInputs.ts` — fans out to the three adapters above.
- `src/adapters/llm/google.ts` — `SYSTEM_PROMPT`, `runAgent` tool-round loop.

</canonical_refs>

<specifics>
## Specific Ideas

None beyond the decisions above — this context was gathered through direct discussion during `/gsd-plan-phase --gaps`, not a separate ideation pass.

</specifics>

<deferred>
## Deferred Ideas

- CHAT-02 (structured score rendering independent of LLM prose) — explicitly deferred/accepted as-is; not part of this plan.
- Great-circle distance computation and destination-coordinate lookup (FaaFacility reuse or OurAirports) for QUERY-03 — considered and explicitly rejected in favor of LLM-estimated distance. Do not build this.
- Parallel-runway-detection and separation-distance computation for QUERY-04 — considered and explicitly rejected in favor of LLM-estimated separation. Do not build this.
- `MAX_AIRPORTS_PER_QUERY` cap (noted in `04-VERIFICATION.md` as a known, deliberately-deferred resource-control gap) — not a roadmap Success Criterion, out of scope for this plan.
- UI-SPEC.md — not generated. None of QUERY-03/QUERY-04/QUERY-05 touch the UI surface; the one gap that did (CHAT-02) is out of scope.

</deferred>

---

*Phase: 04-conversational-agent*
*Context gathered: 2026-08-20 via /gsd-plan-phase 4 --gaps interactive discussion*
