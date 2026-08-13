# Requirements — Airport Investment Intelligence Agent

**Milestone:** v1 (project deliverable)
**Defined:** 2026-08-12
**Source:** Project brief + `.planning/research/` + user scoping decisions

---

## v1 Requirements

### Configuration & Runnability

- [x] **SETUP-01**: App validates all required credentials at startup and refuses to start with a message naming the missing variable and where to obtain it
- [x] **SETUP-02**: Repo ships `.env.example` and a README such that a reviewer can go from `git clone` to a working app without reading source code
- [x] **SETUP-03**: Config is read through one validated env module that distinguishes required from optional keys, so optional keys can be added later without touching call sites

### Live Data Sources

- [ ] **DATA-01**: System fetches US airport facility and runway data from the FAA ArcGIS API at startup and caches it as the canonical airport registry, retaining per-runway geometry (count, length, and parallel-runway separation) since separation drives all-weather capacity — **built in Phase 1 plan 01-04 (`fetchArcGis.ts`/`geometry.ts`/`registry.ts`), then deleted 2026-08-13 in the architecture pivot below. No physical-capacity data source exists anywhere in the codebase right now; needs a decision (rebuild per-request in Phase 2/3, or drop the physical-capacity signal from scoring) before Phase 3 planning.**
- [ ] **DATA-02**: System fetches per-airport departures and arrivals from OpenSky over an explicit, stated time window using OAuth2 client credentials
- [ ] **DATA-03**: System fetches current delay and closure status from the FAA NAS Status API
- [ ] **DATA-04**: All upstream responses are cached via `lru-cache` with a TTL chosen per source, reflecting each source's actual volatility
- [ ] **DATA-05**: One failing or timing-out upstream source degrades its own KPIs to "unavailable" without failing the whole answer

### Airport Resolution

> **Architecture pivot — 2026-08-13.** The original Phase 1 design (plan 01-03: a pure `resolve()`
> dispatcher doing code/alias/metro/region/state/name-substring matching against a live ~500-airport
> registry, backed by a registry-membership SSRF allowlist in `allowlist.ts`) was replaced, by explicit
> user direction under the 24-hour deadline, with a single hardcoded lookup table
> (`src/domain/airports/regions.ts`, `lookupAirports(query): string[]`). Natural-language extraction
> (deciding what airport/region/metro the analyst meant) moves to the LLM in Phase 4; Phase 1's job is
> now just expanding a handful of known region/metro names to IATA codes, or passing an already-extracted
> code through uppercased. `resolve.ts`, `allowlist.ts`, `registry.ts`, `fetchArcGis.ts`, `geometry.ts`,
> `metroClusters.ts`, and `aliases.ts` were deleted; `types.ts` (Registry/AirportRef/ResolveResult/etc.)
> was deleted as no longer referenced. See `01-03-SUMMARY.md` for the full rationale and what was
> knowingly traded away (registry-wide coverage, ambiguity metadata, and the SEC-02 validation gate —
> flagged explicitly there since SEC-02 elsewhere in this document is called out as non-deferrable).
>
> The four checkboxes below are unchecked because the *originally specified* behavior (registry-backed,
> code-verified, covering the live ~500-airport dataset) no longer exists in code. What exists now is a
> much narrower substitute: a curated list of well-known regions/metros, with no formal ambiguity
> signal and no correctness guarantee beyond the hardcoded table.

- [ ] **RESOLVE-01**: Analyst can name an airport by IATA code, ICAO code, or common name and get the correct canonical airport — common-name/city matching no longer exists in code; deferred to the Phase 4 LLM
- [ ] **RESOLVE-02**: Resolution handles the Alaska and Hawaii ICAO prefixes correctly (PANC, PHNL — not KANC/KHNL) — no code-level ICAO validation exists anymore; a caller can pass any string through
- [ ] **RESOLVE-03**: Analyst can name a region ("New England") and get the correct set of airports — holds only for the ~15 hardcoded region/metro keys in `regions.ts`, not derived from a live dataset
- [ ] **RESOLVE-04**: When a reference is ambiguous across a metro cluster ("LA" → LAX/BUR/LGB/SNA/ONT), the agent surfaces the ambiguity rather than silently picking one — `lookupAirports` still returns all candidate codes as an array (never silently narrows to one), but there is no explicit `ambiguous` flag or disclosure note anymore

### Deterministic Scoring Engine

- [ ] **SCORE-01**: An Expansion Opportunity Score is computed for any US airport by a pure TypeScript function with no network access and no LLM involvement
- [ ] **SCORE-02**: Every score is returned together with its component breakdown — which KPIs contributed and by how much
- [ ] **SCORE-03**: Scoring weights and the normalization method are declared in one inspectable place, not scattered through the code
- [ ] **SCORE-04**: Cargo movements are identified and handled separately from passenger movements, so a cargo-dominated airport is not misread as passenger demand
- [ ] **SCORE-05**: Unit tests run the scoring engine against fixed fixtures and prove identical inputs produce identical scores

### Analyst Questions

- [ ] **QUERY-01**: Analyst can ask which airports in a region are the strongest expansion candidates and receive a ranked list with scores
- [ ] **QUERY-02**: Analyst can compare two named airports on a single KPI and see both values and the difference
- [ ] **QUERY-03**: Analyst can ask for the share of long-haul flights from an airport, computed by great-circle distance against a stated, cited threshold
- [ ] **QUERY-04**: Analyst can ask why an airport has unmet demand and receive an explanation naming the airport-specific physical cause, not a generic high-utilization statement — derived from runway geometry (parallel-runway separation from FAA ArcGIS) cross-referenced with observed delay conditions. The project asks "and why?"; an answer that does not explain *why this airport* has not answered it.
- [ ] **QUERY-05**: Every answer states the assumptions behind it, the data window used, and what is measured versus proxied

### Chat Interface

- [ ] **CHAT-01**: Analyst can ask a question in natural language through a chat interface and receive a narrated answer
- [ ] **CHAT-02**: Numeric values shown in the UI are rendered from the scoring engine's structured output, never parsed out of the LLM's prose
- [ ] **CHAT-03**: Analyst can ask follow-up questions that resolve against prior turns ("why?", "what about Boston?", "compare those two")
- [ ] **CHAT-04**: Chat transport sits behind an adapter interface with a single text implementation, so a voice adapter could be added without changing the agent

### Security

- [ ] **SEC-01**: Secrets and all upstream API calls are server-side only; no key or upstream endpoint is reachable from the browser
- [ ] **SEC-02**: Every user-supplied airport identifier is validated against the resolved airport allowlist before it can reach an outbound request — **the allowlist (`allowlist.ts`) was deleted in the 2026-08-13 architecture pivot by explicit user decision. Nothing in the codebase currently validates an airport identifier's shape or existence before it could reach an outbound URL. This directly contradicts this project's own CLAUDE.md, which calls SEC-02-style validation "not deferrable polish" — flagged here, not silently dropped. Needs a decision before Phase 2 wires any outbound call: reintroduce format-only validation at minimum, or accept the gap knowingly.**
- [ ] **SEC-03**: The chat endpoint is rate-limited per session so one client cannot exhaust the upstream quota or LLM budget
- [ ] **SEC-04**: Text from third-party API responses is treated as untrusted data when it enters LLM context and cannot act as instructions

### Deliverable

- [ ] **DOC-01**: Design document explains the scoring methodology, key tradeoffs, where and how AI is used, and the alternatives considered and declined

---

## v2 / Deferred

Table-stakes-adjacent items that users would eventually expect, deferred for the one-day budget:

- **Confidence tiering** — formal HIGH/MEDIUM/LOW rating per answer from an inspectable rule (sample size, data age). Assumption and uncertainty statements remain in v1 as prose (QUERY-05); only the formal tiering system is deferred.
- **Data-freshness stamps per KPI** — visible timestamp on each metric.
- **Slot-control flag (JFK/LGA/DCA)** — FAA Level 3 slot status as a verifiable unmet-demand signal. Would have been the strongest evidence for QUERY-04; unmet demand is answered from proxy KPIs instead.
- **Disk-persisted cache** — cache currently dies with the process, re-spending OpenSky quota on restart. Add behind the same interface if quota bites.

## Out of Scope

- **Sensitivity analysis** ("what would change this answer") — the most expensive item considered; the SCORE-02 component breakdown already delivers most of the explanatory value.
- **Voice input/output** — bonus item. CHAT-04 keeps the seam; no speech code ships.
- **Measured passenger volumes** — BTS passenger data is reachable live via Socrata REST, so this is a deliberate scoping choice, not a data limitation. Belongs in DOC-01's alternatives-considered section.
- **Persistent database** — no users, no joins, nothing too expensive to compute live; a required DB server would make the demo fragile on the reviewer's machine.
- **Second LLM provider** — Gemini 2.5 Flash only. The AI SDK makes a future swap a one-line change, which is exactly why building two paths now is unnecessary.
- **Degraded / no-credential mode** — all keys required for v1. Dropping the dual-path requirement buys hours for scoring depth.
- **Real financial modeling (NPV/IRR/construction cost)** — no cost data available; inventing it would be dishonest.
- **Map/GIS visualization** — looks impressive, adds nothing to the reasoning the project grades.
- **Authentication and multi-user accounts** — single-analyst demo tool.
- **Non-US airports** — the firm invests in US airports only.

---

## Traceability

| Requirement | Phase |
|-------------|-------|
| SETUP-01 | Phase 1 |
| SETUP-02 | Phase 1 |
| SETUP-03 | Phase 1 |
| DATA-01 | Phase 1 |
| RESOLVE-01 | Phase 1 |
| RESOLVE-02 | Phase 1 |
| RESOLVE-03 | Phase 1 |
| RESOLVE-04 | Phase 1 |
| SEC-02 | Phase 1 |
| DATA-02 | Phase 2 |
| DATA-03 | Phase 2 |
| DATA-04 | Phase 2 |
| DATA-05 | Phase 2 |
| SCORE-01 | Phase 3 |
| SCORE-02 | Phase 3 |
| SCORE-03 | Phase 3 |
| SCORE-04 | Phase 3 |
| SCORE-05 | Phase 3 |
| CHAT-01 | Phase 4 |
| CHAT-02 | Phase 4 |
| CHAT-03 | Phase 4 |
| CHAT-04 | Phase 4 |
| QUERY-01 | Phase 4 |
| QUERY-02 | Phase 4 |
| QUERY-03 | Phase 4 |
| QUERY-04 | Phase 4 |
| QUERY-05 | Phase 4 |
| SEC-04 | Phase 4 |
| SEC-01 | Phase 5 |
| SEC-03 | Phase 5 |
| DOC-01 | Phase 5 |
