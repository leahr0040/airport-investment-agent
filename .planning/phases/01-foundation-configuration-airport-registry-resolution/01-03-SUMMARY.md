---
phase: 01-foundation-configuration-airport-registry-resolution
plan: 03
subsystem: domain
tags: [zod, resolver, allowlist, ssrf, airports]

# Dependency graph
requires:
  - phase: 01-01
    provides: "src/domain/airports/types.ts — AirportRef, Registry, ResolveResult, RegionName, MatchKind contracts this plan implements against"
provides:
  - "src/domain/airports/regions.ts — 51-entry state-to-region table (D-03/D-04/D-05), STATE_NAME_TO_CODE, REGION_ALIASES, and airportsInRegion/airportsInState lookups over a Registry"
  - "src/domain/airports/metroClusters.ts — six hardcoded metro ambiguity clusters (D-06: la, nyc, sfbay, dc, chicago, southfl) with disclosure notes and METRO_ALIASES"
  - "src/domain/airports/aliases.ts — LEGACY_CODE_ALIASES/LEGACY_CODE_NOTES (PBI to DJT, KPBI to KDJT) with matchedVia-ready sentences"
  - "src/domain/airports/resolve.ts — pure resolve()/normalizeQuery(), zero I/O, 8-branch resolution order (icao, iata, alias, metro, region, state, name substring, none), deterministic iata-sorted output, D-07 miss-with-suggestions behaviour"
  - "src/domain/airports/allowlist.ts — SEC-02 SSRF choke point: AIRPORT_CODE_PATTERN, UnknownAirportError, isAllowedAirportCode, assertAllowedAirport, airportCodeSchema, backed only by registry.byIcao/byIata/LEGACY_CODE_ALIASES"
  - "src/domain/airports/fixtures/testRegistry.ts — shared makeTestRegistry() fixture (29 airports) used by every test suite in this plan and available to plan 01-04"
affects: [01-04-airport-registry-fetch, phase-02-live-data-adapters, all-future-phases-taking-analyst-location-input]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Resolver is a pure function of (query, registry) — no module-level state, no I/O — so it is trivially unit-testable against a hand-built fixture and safely reusable once plan 01-04 wires the live registry"
    - "Two separate query normalisers by design: normalizeQuery() (resolve.ts) strips punctuation aggressively for resolution convenience; the allowlist normalises with trim+uppercase ONLY, so a malformed identifier is never rehabilitated into a valid-looking one before the shape check runs"
    - "The allowlist IS the registry's own key set (byIcao/byIata via LEGACY_CODE_ALIASES) — no separately maintained hardcoded code list, so it cannot drift from the FAA data plan 01-04 fetches"
    - "Resolution branch order is documented in code as a decision: metro shorthands (branch 4) deliberately win over bare state codes/names (branch 6) so 'LA' surfaces the ambiguous Los Angeles cluster rather than silently picking the state of Louisiana"
    - "Table-driven branches (metro/region/state) commit to their kind once the query string matches the governing alias table, even if the current registry happens to hold zero airports for that entry — only the free-text substring branch (name/city) requires a non-empty result to fire, since it has no governing table of its own"

key-files:
  created:
    - src/domain/airports/regions.ts
    - src/domain/airports/regions.test.ts
    - src/domain/airports/metroClusters.ts
    - src/domain/airports/metroClusters.test.ts
    - src/domain/airports/aliases.ts
    - src/domain/airports/resolve.ts
    - src/domain/airports/resolve.test.ts
    - src/domain/airports/allowlist.ts
    - src/domain/airports/allowlist.test.ts
    - src/domain/airports/fixtures/testRegistry.ts
  modified: []

key-decisions:
  - "Table-driven resolution branches (metro, region, state) return their kind as soon as the query text matches the governing alias/name table, independent of whether the fixture registry currently contains any airports for that entry (e.g. resolve('Louisiana', reg) returns kind 'state' even though the fixture carries no Louisiana airports). Only the free-text substring branch requires a non-empty match set to fire, since 'the text appears in some airport's name/city' is itself the matching condition, not a lookup into a pre-existing table."
  - "airportCodeSchema(registry) reuses assertAllowedAirport internally inside its final .transform(), rather than re-implementing the lookup — keeps the allowlist's registry-lookup logic in exactly one place, per the plan's own 'allowlist IS the registry's own key set' framing."

requirements-completed: [RESOLVE-01, RESOLVE-02, RESOLVE-03, RESOLVE-04, SEC-02]

coverage:
  - id: D1
    description: "IATA/ICAO/legacy-alias code resolution, including Alaska/Hawaii native ICAO handling and rejection of synthesised K-prefix forms (RESOLVE-01, RESOLVE-02)"
    requirement: RESOLVE-01
    verification:
      - kind: unit
        ref: "src/domain/airports/resolve.test.ts#resolve — code matching, resolve — legacy alias"
        status: pass
    human_judgment: false
  - id: D2
    description: "Region and bare-state resolution from one shared state-to-region table (RESOLVE-03)"
    requirement: RESOLVE-03
    verification:
      - kind: unit
        ref: "src/domain/airports/regions.test.ts; src/domain/airports/resolve.test.ts#resolve — region and state"
        status: pass
    human_judgment: false
  - id: D3
    description: "Metro ambiguity clusters return every candidate with ambiguous=true and a disclosure note, never a silent single pick (RESOLVE-04)"
    requirement: RESOLVE-04
    verification:
      - kind: unit
        ref: "src/domain/airports/metroClusters.test.ts; src/domain/airports/resolve.test.ts#resolve — metro clusters"
        status: pass
    human_judgment: false
  - id: D4
    description: "A miss returns an empty result with suggestions and never throws, for any input including empty string, long junk, and punctuation-only queries (D-07)"
    verification:
      - kind: unit
        ref: "src/domain/airports/resolve.test.ts#resolve — misses (D-07)"
        status: pass
    human_judgment: false
  - id: D5
    description: "An identifier absent from the registry is rejected by the allowlist before it could reach any outbound request; rejection never echoes untrusted input; the allowlist has no hardcoded code list separate from the registry (SEC-02)"
    requirement: SEC-02
    verification:
      - kind: unit
        ref: "src/domain/airports/allowlist.test.ts (all describe blocks)"
        status: pass
    human_judgment: false
  - id: D6
    description: "End-of-phase spot check: New England, LA, Santa Ana, Anchorage, PBI resolve to answers an analyst would accept, and matchedVia text for LA/PBI reads as a UI-ready sentence"
    verification:
      - kind: manual_procedural
        ref: "node --experimental-strip-types spot check via a scratch Vitest test run during execution (output captured, file removed before commit)"
        status: pass
    human_judgment: true
    rationale: "The plan's own <human-check> block asks whether the matchedVia sentence text 'reads as a sentence you would be willing to show in the UI' — a subjective wording judgment, not a property a script can assert. I ran the check and captured the output in this SUMMARY's Issues Encountered section for the record; config.json's human_verify_mode: end-of-phase defers the final sign-off to the phase-level checkpoint."

duration: 45min
completed: 2026-08-13
status: complete
---

# Phase 1 Plan 3: Airport Resolution Layer Summary

**Pure `resolve()` covering ICAO/IATA/legacy-alias/metro/region/state/name-substring/none across an 8-branch deterministic order, backed by a 51-entry state-to-region table and six hardcoded metro clusters, plus `allowlist.ts` as the sole SEC-02 SSRF choke point over the registry's own key set.**

## Performance

- **Duration:** ~45 min total across all three tasks (this session covered only Task 3: ~20 min)
- **Completed:** 2026-08-13
- **Tasks:** 3 (all auto/tdd)
- **Files created:** 10 (regions.ts + test, metroClusters.ts + test, aliases.ts, resolve.ts + test, allowlist.ts + test, fixtures/testRegistry.ts)

## Accomplishments
- `regions.ts`: 51-key `STATE_TO_REGION` (9 regions, DC folded into Mid-Atlantic per D-05), `STATE_NAME_TO_CODE`, `REGION_ALIASES`, and `airportsInRegion`/`airportsInState` lookups over a `Registry`
- `metroClusters.ts` + `aliases.ts`: six hardcoded metro clusters (D-06) each disclosing their own shadowing (LA/Louisiana, EWR/New York, BWI-DCA-IAD split-state, DJT/PBI rename) plus the `LEGACY_CODE_ALIASES` table carrying `PBI -> DJT` and `KPBI -> KDJT`
- `fixtures/testRegistry.ts`: `makeTestRegistry()` — 29-airport fixture Registry shared by every test suite in this plan (and available to plan 01-04)
- `resolve.ts`: pure `resolve(query, registry)` evaluating 8 branches in a documented, deliberate order (metro beats bare state codes), always returning `matches` sorted by `iata`, never throwing, with a deterministic suggestion algorithm on miss (D-07)
- `allowlist.ts`: `assertAllowedAirport`/`isAllowedAirportCode`/`airportCodeSchema` — trim+uppercase-only normalisation, `AIRPORT_CODE_PATTERN` shape check before any lookup, rejection never echoes untrusted input past the shape-check boundary
- 44 tests passing across `src/domain/airports/` (10 from Tasks 1-2, 34 new from Task 3); `npx tsc --noEmit` exits 0

## Task Commits

1. **Task 1: State-to-region table, region/state lookups, and the shared test fixture registry** - `b5a08cd` (feat)
2. **Task 2: Metro ambiguity clusters and the legacy-code alias table** - `d6602ad` (feat)
3. **Task 3: The pure resolver and the registry-backed SSRF allowlist** - `4a69104` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE.md + ROADMAP.md + REQUIREMENTS.md)

_Note: Tasks 1 and 2 were completed and committed in a prior session; this session executed only Task 3 and this plan-level wrap-up._

## Files Created/Modified
- `src/domain/airports/regions.ts` - 51-entry state-to-region table, state-name and region-alias lookups
- `src/domain/airports/regions.test.ts` - Coverage for the region/state behaviour bullets
- `src/domain/airports/metroClusters.ts` - Six metro ambiguity clusters with disclosure notes
- `src/domain/airports/metroClusters.test.ts` - Cluster/alias consistency checks against the fixture registry
- `src/domain/airports/aliases.ts` - Legacy identifier alias table (PBI -> DJT, KPBI -> KDJT) with narration-ready notes
- `src/domain/airports/resolve.ts` - Pure resolver: `resolve()`, `normalizeQuery()`
- `src/domain/airports/resolve.test.ts` - Full RESOLVE-01..04 and D-07/D-08 behaviour coverage (34 cases)
- `src/domain/airports/allowlist.ts` - SEC-02 SSRF choke point: pattern, error class, guard functions, Zod schema
- `src/domain/airports/allowlist.test.ts` - Rejection coverage for URL/traversal/CRLF/hyphen/whitespace-shaped input
- `src/domain/airports/fixtures/testRegistry.ts` - Shared 29-airport fixture Registry builder

## Decisions Made
- Table-driven resolution branches (metro/region/state) commit to their `kind` as soon as the query matches the governing alias table, even when the fixture registry has zero airports for that entry — see key-decisions in frontmatter for the full rationale and the `resolve('Louisiana', reg)` example this decision makes correct.
- `airportCodeSchema()` calls `assertAllowedAirport()` internally in its final `.transform()` rather than duplicating the lookup logic, keeping the registry-lookup path singular.
- Branch order in `resolve()` is recorded as an explicit one-line code comment (not left implicit) per the plan's instruction, since metro-over-state is a decision with user-facing consequences (LA vs Louisiana).

## Deviations from Plan

None - plan executed exactly as written. `resolve.ts` and `allowlist.ts` implement every export, branch, and validation step specified in Task 3's `<action>` block; all `<behavior>` bullets have a corresponding test in `resolve.test.ts`/`allowlist.test.ts`.

## Issues Encountered

None blocking. One clarification surfaced during implementation and resolved by re-reading the plan text carefully: the top-level phrase "return on the first [branch] that produces matches" initially suggested guarding every branch (including region/state) on a non-empty result before returning. Re-reading branches 4-6 (metro/region/state) against branch 7 (substring name matching) showed only branch 7's condition is itself a search ("some airport's name or city contains it") — branches 4-6 are keyed off static alias/name tables independent of registry contents, so they correctly return their `kind` even when the registry happens to hold zero matching airports for that entry (relevant to the fixture's own gaps, e.g. no Louisiana airports are in `testRegistry.ts`). This reading is what makes `resolve('Louisiana', reg) -> kind 'state'` (an explicit behaviour bullet) achievable without special-casing.

**Human-check spot-check output** (run via a scratch Vitest test during execution, not committed):
```
{"query":"New England","kind":"region","matches":["BDL","BOS","PWM"],"ambiguous":false,"matchedVia":"Matched the New England region (3 airports)."}
{"query":"LA","kind":"metro","matches":["BUR","LAX","LGB","ONT","SNA"],"ambiguous":true,"matchedVia":"Los Angeles metro: LA is also the USPS code for Louisiana; the state is reachable by typing \"Louisiana\"."}
{"query":"Santa Ana","kind":"name","matches":["SNA"],"ambiguous":false,"matchedVia":null}
{"query":"Anchorage","kind":"name","matches":["ANC"],"ambiguous":false,"matchedVia":null}
{"query":"PBI","kind":"alias","matches":["DJT"],"ambiguous":false,"matchedVia":"Interpreted the legacy West Palm Beach identifier PBI as the current one, DJT, following the FAA's 2026 rename (the IATA passenger-facing code changes on 2026-08-18)."}
```
All five answers read as an analyst would accept; the `matchedVia` sentences for `LA` and `PBI` read as UI-ready prose, not code comments.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `resolve()` and `assertAllowedAirport()` are pure, I/O-free, and fully unit-tested against a realistic `Registry` shape — plan 01-04 (live registry fetch) can wire its fetched `Registry` directly through both without any interface changes.
- The allowlist is the sole SEC-02 choke point: any Phase 2+ outbound adapter must call `assertAllowedAirport()` (or `airportCodeSchema()`) before constructing an outbound URL from analyst input. No raw string should reach an adapter.
- `AIRPORT_CODE_PATTERN` (`/^[A-Z0-9]{3,4}$/`) is the exact shape gate Phase 2 adapters must assume already ran on any `AirportRef.iata`/`.icao` value that reached them.
- `fixtures/testRegistry.ts` is reusable as-is by plan 01-04's own tests if a lightweight non-network fixture is useful there.
- End-of-phase `<human-check>` (New England/LA/Santa Ana/Anchorage/PBI spot check) was exercised programmatically in this session; a human eyeball pass is still open per `config.json`'s `human_verify_mode: end-of-phase`, same status as 01-01 and 01-02's own deferred human-checks.

## Self-Check: PASSED

All 10 claimed files verified present on disk; all three claimed commit hashes (`b5a08cd`, `d6602ad`, `4a69104`) verified present in `git log`; `npx vitest run src/domain/airports/` (44/44 passing) and `npx tsc --noEmit` (exit 0) both re-run clean as part of this session.
