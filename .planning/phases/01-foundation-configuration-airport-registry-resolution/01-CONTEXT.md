# Phase 1: Foundation — Configuration, Airport Registry & Resolution - Context

**Gathered:** 2026-08-12
**Status:** Ready for planning

<domain>
## Phase Boundary

The app boots reliably with validated configuration (fail loud, name the missing variable), builds an in-memory US airport registry from the FAA ArcGIS API at startup, and resolves any analyst-supplied airport reference — IATA/ICAO code, common name, region, or ambiguous metro name — to the correct canonical airport(s), or surfaces the ambiguity instead of guessing. This is also the SSRF allowlist choke point: no unvalidated identifier may reach an outbound request. Zero UI, zero LLM, zero live-flight-data adapters in this phase (those are Phase 2+).

</domain>

<decisions>
## Implementation Decisions

### Registry scope & source
- **D-01:** Registry includes only Part 139 commercial-service, public-use facilities (filter on `FAR_139_TYPE_CODE` present + public use) — excludes GA airfields, heliports, private strips, closed fields. Keeps the registry small and matches what an investment analyst actually cares about.
- **D-02:** FAA ArcGIS is the sole registry source — no second live fetch (e.g. OurAirports) for identity data. `ARPT_ID` (FAA LID) is used directly as the IATA-code field. This holds for the vast majority of continental US commercial airports; documented as a known simplification in the design doc, not silently assumed.

### Region definitions (RESOLVE-03)
- **D-03:** Nine fixed US Census-style regions, each a hardcoded state→region list: New England, Mid-Atlantic, South, Midwest, Southwest, Mountain West, Pacific/West Coast, Alaska, Hawaii.
- **D-04:** A bare state name (e.g. "Texas") also resolves on its own, independent of the 9 named regions — the region map is built from a state→region table, so per-state lookup falls out of the same data structure.
- **D-05:** Washington D.C. is not a state; it is folded into the Mid-Atlantic region for lookup purposes.

### Metro ambiguity clusters (RESOLVE-04)
- **D-06:** Six hardcoded metro clusters, each with an explicit airport-code list: LA (LAX/BUR/LGB/SNA/ONT), NYC (JFK/LGA/EWR), SF Bay Area (SFO/OAK/SJC), DC (DCA/IAD/BWI), Chicago (ORD/MDW), South Florida (MIA/FLL/PBI). No geographic-proximity algorithm — a fixed lookup table only.

### Resolver miss & match behavior
- **D-07:** When an identifier matches nothing in the registry, `resolve()` returns an empty result plus nearest-candidate suggestions (not a thrown exception) — this is the contract Phase 4's chat layer will build "did you mean X?" on top of.
- **D-08:** Name matching (not code matching) uses substring/contains matching, not typo-tolerant fuzzy (Levenshtein) matching — simpler, predictable, sufficient for the demo's expected query patterns.

### Claude's Discretion
- Exact `.env` validation error-message wording and format (SETUP-01) — Claude designs a clear, actionable message naming the variable and where to get it.
- Whether `ARPT_ID`-as-IATA needs any hardcoded exception list for known FAA-LID/IATA mismatches — verify during research/planning; not surfaced as a user decision.
- Internal registry data structure / indexing approach (by code, by state, by region) — implementation detail.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope & requirements
- `.planning/PROJECT.md` — Key Decisions table, esp. "Airport identity/geometry sourced from the FAA ArcGIS API at startup, cached — no bundled CSV" (supersedes the bundled-CSV approach described in ARCHITECTURE.md research below)
- `.planning/REQUIREMENTS.md` — SETUP-01/02/03, DATA-01, RESOLVE-01/02/03/04, SEC-02 (this phase's requirements)
- `.planning/ROADMAP.md` §"Phase 1: Foundation — Configuration, Airport Registry & Resolution" — goal, success criteria, dependencies

### Data source research
- `.claude/CLAUDE.md` §"Q1 — Live Public Aviation APIs" — FAA ADIP/NASR via ArcGIS REST field list (35 fields incl. `ARPT_ID`, `ICAO_ID`, `ARPT_NAME`, `FACILITY_USE_CODE`, `FAR_139_TYPE_CODE`), confirms no enplanement/operations field exists despite the layer's marketing description
- `.planning/research/ARCHITECTURE.md` §"Recommended Project Structure" and §"Q6 — Build Order" — component layout (`src/domain/airports/registry.ts`, `resolve.ts`); note its "static bundled dataset" framing for the registry is **superseded** by PROJECT.md's later decision to fetch live from FAA ArcGIS at boot instead of bundling a CSV

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
None — repo contains only `README.md` and `.claude/CLAUDE.md`. This phase starts from an empty `src/`.

### Established Patterns
- `.planning/research/ARCHITECTURE.md` proposes `src/domain/airports/registry.ts` (registry) and `src/domain/airports/resolve.ts` (pure-function resolver) as the target file layout — no code exists yet to conform to, but this is the intended shape for the planner.
- Pure-core discipline applies from this phase onward: resolution must be a pure function over the in-memory registry, zero I/O per call (the registry itself is fetched once at boot, not per resolution).

### Integration Points
- The registry built here is the SSRF allowlist source for every later phase — adapters (Phase 2) must be typed to accept only a validated `AirportRef`, never a raw string.

</code_context>

<specifics>
## Specific Ideas

No UI mockups or exact message copy specified. The one concrete example driving RESOLVE-04 is the project brief's own "LA" reference, and RESOLVE-03's "New England" — both explicitly satisfied by D-03/D-06.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 1 scope. No todos existed to fold or review (`todo.match-phase` returned zero matches).

</deferred>

---

*Phase: 1-Foundation — Configuration, Airport Registry & Resolution*
*Context gathered: 2026-08-12*
