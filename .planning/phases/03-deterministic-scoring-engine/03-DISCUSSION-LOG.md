# Phase 3: Deterministic Scoring Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-13
**Phase:** 3-Deterministic Scoring Engine
**Areas discussed:** Physical-capacity & coordinate data gap, What "Expansion Opportunity" means

---

## Physical-capacity & coordinate data gap (DATA-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Rebuild a minimal per-request FAA ArcGIS fetch | Call Runways_View + NTAD_Aviation_Facilities live, keyless endpoints, but only for airports actually being scored/compared — not a full boot-time registry. Long TTL (28-day AIRAC cycle). | ✓ |
| Use OurAirports CSV as a cached reference table | One-time fetch, gives coordinates + basic runway length/width/surface, but not FAA ArcGIS's parallel-runway-separation geometry QUERY-04 was written around. | |
| Drop the physical-capacity signal entirely | Score from movement volume + delay/closure frequency only; QUERY-04 falls back to a generic high-utilization explanation. | |

**User's choice:** Rebuild a minimal per-request FAA ArcGIS fetch (recommended option).
**Notes:** User asked for questions in Hebrew partway through this area; subsequent questions in this session were presented in Hebrew. No further sub-questions needed in this area — user confirmed the decision was locked and moved to the next area.

---

## What "Expansion Opportunity" means (KPI composition & direction)

| Question | Option | Selected |
|----------|--------|----------|
| Which KPIs compose the score? | Traffic volume + capacity headroom + delay/closure frequency (three groups) | ✓ |
| | Traffic volume + delay/closure only; capacity shown as context, not scored | |
| | Claude decides | |
| What should a HIGH score mean? | Demand outpacing capacity — congested/strained airport needing investment | ✓ |
| | High raw traffic level regardless of strain | |
| | Claude decides | |
| How should the three KPI groups be weighted? | Equal weight per group — simplest to explain/audit | ✓ |
| | Delay/closure signal weighted heaviest | |
| | Claude decides | |
| Is long-haul share (QUERY-03) part of the score? | Separate on-demand metric only — not part of the score | ✓ |
| | Fold into score as a 4th component | |

**User's choice:** Recommended option selected for all four sub-questions.
**Notes:** User confirmed ready to write CONTEXT.md rather than discuss the two unselected areas (cargo/passenger separation, missing-KPI handling) further — both deferred to Claude's Discretion in CONTEXT.md.

---

## Claude's Discretion

- **Cargo/passenger separation (SCORE-04):** callsign-prefix heuristic against a documented (non-exhaustive) list of known cargo carriers; cargo movements excluded from the passenger-volume KPI and reported as their own count. Not discussed live — user chose to defer straight to CONTEXT.md rather than open this area.
- **Missing-KPI handling:** when a KPI group is `"unavailable"` (per Phase 2's hard-fail-no-stale-serve contract), exclude it and redistribute weight across the remaining groups rather than failing the whole score; must be named in the component breakdown. Not discussed live — same deferral as above.
- Exact capacity-headroom formula, normalization method, new adapter's cache TTL/key shape, and adapter file naming — implementation details left to research/planning.

## Deferred Ideas

None — discussion stayed within Phase 3 boundaries.
