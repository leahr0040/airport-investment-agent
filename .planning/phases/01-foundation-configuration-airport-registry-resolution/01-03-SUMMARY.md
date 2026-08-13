---
phase: 01-foundation-configuration-airport-registry-resolution
plan: 03
subsystem: domain
tags: [airports, lookup, architecture-pivot]
superseded: true
superseded_at: "2026-08-13"

# Dependency graph
requires: []
provides:
  - "src/domain/airports/regions.ts — hardcoded Record<string, string[]> of ~15 region/metro names to IATA codes, plus lookupAirports(query): string[]"
affects: [phase-02-live-data-adapters, phase-04-conversational-agent, all-future-phases-taking-analyst-location-input]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "lookupAirports() is a pure function of one string argument — no registry, no I/O, no ambiguity metadata. A recognised region/metro name expands to its hardcoded code list; anything else is assumed to already be a code and passed through trimmed+uppercased, unvalidated."
    - "NLU (deciding what an analyst meant by free text) is explicitly NOT this module's job anymore — it moves to the Phase 4 LLM via tool-call extraction. This module only expands an already-decided name to codes."

key-files:
  created:
    - src/domain/airports/regions.ts
    - src/domain/airports/regions.test.ts
  deleted:
    - src/domain/airports/resolve.ts
    - src/domain/airports/resolve.test.ts
    - src/domain/airports/allowlist.ts
    - src/domain/airports/allowlist.test.ts
    - src/domain/airports/metroClusters.ts
    - src/domain/airports/metroClusters.test.ts
    - src/domain/airports/aliases.ts
    - src/domain/airports/types.ts
    - src/domain/airports/fixtures/testRegistry.ts
---

## What this plan originally built (2026-08-12/13, superseded)

The plan as written (`01-03-PLAN.md`) built a pure `resolve()` dispatcher (8-branch resolution
order: icao → iata → alias → metro → region → state → name-substring → none) over a live
`Registry`, a 51-entry state-to-region table, six metro ambiguity clusters with disclosure notes,
a legacy-code alias table (PBI → DJT), and a registry-backed SSRF allowlist (`allowlist.ts`,
SEC-02). All of it shipped and passed — 44/44 tests, `tsc --noEmit` clean — across two work
sessions (commits `b5a08cd`, `d6602ad`, `4a69104`). Full detail is in git history on those commits
and in `01-03-PLAN.md`'s `<behavior>`/`<acceptance_criteria>` blocks, which still describe that
original design even though the code no longer matches it.

## What actually exists now (2026-08-13 architecture pivot)

By explicit user direction, citing the 24-hour delivery deadline and a preference for shipping a
working end-to-end flow over registry-backed completeness, the entire resolver/registry/allowlist
subsystem was deleted and replaced with one file:

- **`src/domain/airports/regions.ts`** — a hardcoded `Record<string, readonly string[]>` mapping
  ~15 lowercased region and metro names (`new england`, `la`, `bay area`, `nyc`, `dc`, `chicago`,
  `south florida`, `pbi`, ...) to their IATA code lists, and `lookupAirports(query: string): string[]`
  which expands a known name or passes an unrecognised string through `trim().toUpperCase()`.

**What this trades away, stated plainly (this project's stated Core Value is that assumptions and
uncertainty must be stated out loud, not hidden):**

1. **No live registry.** The hardcoded lists are curated examples, not derived from the ~500-airport
   FAA Part 139 dataset. A real New England commercial airport not in the 3-code list (e.g. Manchester
   NH, Providence RI) will not be found.
2. **No common-name/city matching.** "Santa Ana" or "Anchorage" no longer resolve in code at all —
   that job is assumed to move to the Phase 4 LLM's own extraction.
3. **No Alaska/Hawaii ICAO-prefix handling.** Nothing checks that a code is well-formed or real.
4. **No ambiguity metadata.** `lookupAirports('LA')` still returns all 5 LA-area codes (never
   silently narrows to one), but there's no `ambiguous` flag or `matchedVia` disclosure anymore.
5. **No SEC-02 validation.** `allowlist.ts` is gone. An intermediate "format-only, not registry-backed"
   design was discussed and agreed, then cut one message later along with everything else. **Nothing
   in the codebase currently validates an airport identifier before it could reach an outbound
   request.** This is a real, currently-open gap against this project's own CLAUDE.md, which calls
   SEC-02-equivalent validation "not deferrable polish" — see `.planning/STATE.md` Blockers/Concerns
   and `.planning/REQUIREMENTS.md` SEC-02.
6. **No physical-capacity data.** Plan 01-04's FAA ArcGIS registry/runway-geometry fetch was built
   and working, then deleted in the same pivot (see `01-04-SUMMARY.md`). There is currently no live
   source for runway count/length/parallel-runway separation anywhere in the codebase.

## Verification

- `npx tsc --noEmit` — clean.
- `npx vitest run` — 4/4 tests pass (`regions.test.ts`: region expansion, metro expansion, legacy
  alias, raw-code passthrough).
- `npm run build` — clean.

## Issues Encountered

None technical — the cut-down code is simple and green. The issue, if any, is scope: three
successive rounds of "simplify further" each removed more than the previous round preserved,
ending well past the first proposed simplification (named matcher functions) into "delete the
registry, the allowlist, and the live data source entirely." Recorded here so a later reader
doesn't assume RESOLVE-01..04/DATA-01/SEC-02 are satisfied because a phase-1 SUMMARY.md exists —
see the requirement-level notes in REQUIREMENTS.md for what's actually true today.
