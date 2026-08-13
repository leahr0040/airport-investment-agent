# Phase 3: Deterministic Scoring Engine - Context

**Gathered:** 2026-08-13
**Status:** Ready for planning

<domain>
## Phase Boundary

A pure, zero-I/O, zero-LLM TypeScript function that turns per-airport KPIs into an Expansion Opportunity Score with a fully inspectable formula, a component breakdown (which KPIs contributed and by how much), visible weights, and cargo/passenger separation — the non-negotiable graded core of the project. This phase also resolves a known data-source gap flagged since the Phase 1 architecture pivot: nothing in the codebase currently supplies runway/physical-capacity data or airport coordinates (DATA-01 was built then deleted).

</domain>

<decisions>
## Implementation Decisions

### Physical-capacity & coordinate data gap (DATA-01)
- **D-01:** Rebuild a minimal, **per-request** FAA ArcGIS fetch (Runways_View + NTAD_Aviation_Facilities) scoped to just the airports being scored/compared — not a full ~500-airport boot-time registry like the one deleted in the Phase 1 pivot. Cache with a long TTL (data only changes on the 28-day AIRAC cycle). Restores runway-count/length/separation data and airport lat/long coordinates.
- Architecturally, this fetch is an **adapter** (I/O layer), not part of the scoring function itself — SCORE-01 requires the scoring function to have zero network access. The new fetch supplies pre-computed capacity KPIs as input to the pure scorer, the same way OpenSky/NAS-status data does. It should follow the existing `AdapterResult<T>` contract (`src/domain/adapters/types.ts`) and the format-check-before-outbound-call pattern already established for OpenSky/NAS (Phase 2 D-08).

### What "Expansion Opportunity" means (KPI composition & direction)
- **D-02:** The score combines exactly three KPI groups: (1) traffic volume (OpenSky departure+arrival counts), (2) capacity headroom (traffic volume relative to the physical runway capacity from D-01), (3) delay/closure frequency (FAA NAS). No other KPI groups are folded into the score itself.
- **D-03:** A HIGH score means demand is outpacing capacity — a congested/strained airport that needs the investment. This directly mirrors the project brief's framing (renovations pay off most where flight and passenger capacity grows): the score identifies where capacity is the binding constraint, not simply where traffic is largest.
- **D-04:** The three KPI groups are weighted **equally** in the formula. Chosen for simplicity and auditability over a domain-tuned weighting — matches the project's honesty/SCORE-03 requirement (inspectable, one-place formula) and the one-day timeline. Not a data-fitted result (no labeled outcome data exists to fit against, per STATE.md's blockers) — it's a disclosed, defensible default.
- **D-05:** Long-haul flight share (QUERY-03, great-circle distance) is **not** part of the score. It stays a separate, on-demand metric answered directly in Phase 4. Keeps SCORE-03's formula to the three groups above and keeps QUERY-03 a direct-question feature rather than baking distance/threshold assumptions into the ranking.

### Claude's Discretion
- **Cargo/passenger separation (SCORE-04):** No cargo-carrier callsign heuristic exists in the codebase yet (confirmed by scanning `src/domain/adapters/opensky*`). Design a documented ICAO-callsign-prefix allowlist (e.g. FedEx `FDX`, UPS `UPS`, Atlas Air `GTI`, Kalitta `CKS`, ABX Air `ABX`) with a stated confidence caveat (not exhaustive) during planning/research — not surfaced as a further user decision. Cargo-matched movements are excluded from the passenger-volume KPI (D-02's traffic-volume group) and reported as their own count, not folded into the score.
- **Missing-KPI handling:** Given Phase 2's adapters hard-fail to `"unavailable"` with no stale-serve fallback (Phase 2 D-06), and the score is an equal-weighted average of three groups (D-04): when one group is unavailable for an airport, exclude it and redistribute weight across the remaining available groups, rather than failing the whole score — mirrors DATA-05's "one failing source degrades its own KPIs, not the whole answer" philosophy. The score's component breakdown (SCORE-02) must name which group(s) were unavailable, consistent with QUERY-05's requirement to state assumptions and what's measured vs. unavailable. Not surfaced as a further user decision; researcher/planner should design and document this explicitly as part of SCORE-03's inspectable module.
- Exact capacity-headroom formula (e.g. movements per runway, movements relative to runway-length-weighted capacity) — research/planner detail, informed by D-01's fetched fields.
- Normalization method (min-max vs. percentile rank across the compared set) for combining the three groups into one 0–100-style score — research/planner detail; must live in the same "one inspectable place" as the weights (SCORE-03).
- Exact TTL for the new FAA facility/runway fetch and its cache key shape — implementation detail, not a user decision (long TTL justified by the 28-day AIRAC refresh cycle).
- New adapter file location/name (e.g. `src/domain/adapters/faaFacility.ts`) — implementation detail, follows the existing `opensky.ts`/`nasStatus.ts` sibling pattern.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope & requirements
- `.planning/PROJECT.md` — Key Decisions table, esp. the reversed "Airport identity/geometry sourced from the FAA ArcGIS API at startup, cached" decision (D-01 above restores a narrower, per-request version of this) and "Scoring engine is pure TypeScript, zero LLM involvement"
- `.planning/REQUIREMENTS.md` — SCORE-01, SCORE-02, SCORE-03, SCORE-04, SCORE-05 (this phase's requirements); DATA-01's annotation describing the deleted registry and the "needs a decision before Phase 3 planning" flag this discussion resolves
- `.planning/ROADMAP.md` §"Phase 3: Deterministic Scoring Engine" — goal, success criteria, dependencies
- `.planning/STATE.md` — Blockers/Concerns section: "Exact scoring weights and the cargo-carrier callsign list are undetermined" (resolved here via D-04 for weights; cargo list deferred to Claude's Discretion above) and the DATA-01 gap flag this discussion closes

### Data source research
- `.claude/CLAUDE.md` §"Q1 — Live Public Aviation APIs" → "3. FAA ADIP / NASR via ArcGIS REST" — live-verified field list (35 fields incl. `ARPT_ID`, `ICAO_ID`, runway length/width/surface, lat/long), confirms no enplanement/operations field exists despite the layer's marketing description; keyless, no auth, standard Esri REST query syntax — the source D-01's new adapter fetches from

### Prior phase context (adapter contract & data shapes this phase consumes)
- `.planning/phases/02-live-data-adapters-caching/02-CONTEXT.md` — D-06 (hard-fail to `"unavailable"`, no stale-serve — governs the Claude's-Discretion missing-KPI handling above), D-08 (format-check-before-outbound-call pattern the new FAA adapter must follow), D-09/D-10 (IATA/ICAO pairing already carried on every `regions.ts` entry — the key the new adapter looks up by)
- `src/domain/adapters/types.ts` — `AdapterResult<T>` / `AdapterFailReason` discriminated union — the contract the new FAA facility adapter must conform to
- `src/domain/adapters/errors.ts` — `toAdapterFailure()` error-mapping pattern to reuse
- `src/domain/adapters/opensky.types.ts` — `Movements` shape (`departureCount`, `arrivalCount`, `unknownDestinationCount`, `unknownOriginCount`) — the traffic-volume KPI's actual input shape
- `src/domain/adapters/nasStatus.ts` — `NasStatus` shape; currently parses only `Airport_Closure_List` (no ground-delay/ground-stop blocks yet — flagged MEDIUM confidence in CLAUDE.md's Q1 research) — the delay/closure-frequency KPI's actual, currently-narrower-than-ideal input shape
- `src/domain/airports/regions.ts` — `AirportCodes` (`{iata, icao}`) — the key type every per-airport KPI (including the new capacity fetch) is looked up by

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/domain/adapters/types.ts` (`AdapterResult<T>`) and `errors.ts` (`toAdapterFailure`) — the new FAA capacity adapter should return the same discriminated union and reuse the same error-mapping helper as `opensky.ts`/`nasStatus.ts`.
- `src/domain/adapters/opensky.types.ts` (`Movements`) and `nasStatus.ts` (`NasStatus`) — these are the two KPI input shapes the scoring function already has available; no changes needed to consume them.
- `src/domain/airports/regions.ts` (`AirportCodes`) — every KPI fetch, including the new one, keys off this `{iata, icao}` pair.

### Established Patterns
- Pure-core discipline: adapters are the I/O boundary; the scoring function itself must do zero network calls (SCORE-01) — reconfirmed by D-01's note that the new FAA fetch is architecturally an adapter, invoked before scoring runs, not inside it.
- `server-only` import guard convention on adapter modules — apply to the new FAA facility adapter too, consistent with `nasStatus.ts`/`opensky.client.ts`.
- Format-check gate at the adapter boundary before any outbound request is constructed (Phase 2 D-08) — the new adapter validates its icao/iata input the same way.
- No `lru-cache` usage pattern conflict: Phase 2 already introduced per-source TTL caching via `src/domain/adapters/cache.ts`; the new FAA facility fetch reuses that cache wrapper with its own (long) TTL.

### Integration Points
- No `src/domain/adapters/faaFacility.ts` (or equivalent) exists yet — this phase's plan creates it, sibling to `opensky.ts`/`nasStatus.ts`.
- No `src/domain/scoring/` (or equivalent) directory exists yet — this phase's plan creates the pure scoring module, structurally separate from `src/domain/adapters/` (I/O) per the pure-core discipline above.
- No cargo-carrier callsign list exists anywhere in the codebase (confirmed via grep across `src/domain/adapters/`) — this phase's plan introduces it fresh.

</code_context>

<specifics>
## Specific Ideas

No exact formula constants, weight percentages, or worked examples specified beyond D-02/D-03/D-04 above (three equally-weighted KPI groups; high score = demand outpacing capacity). Exact normalization method and capacity-headroom formula are left to research/planning per Claude's Discretion.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 3 boundaries. No todos existed to fold or review (`todo.match-phase` returned zero matches for Phase 3).

</deferred>

---

*Phase: 3-Deterministic Scoring Engine*
*Context gathered: 2026-08-13*
