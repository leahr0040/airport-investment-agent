---
phase: 01-foundation-configuration-airport-registry-resolution
plan: 04
subsystem: domain
tags: [arcgis, registry, geometry, architecture-pivot]
superseded: true
superseded_at: "2026-08-13"

# Dependency graph
requires: []
provides: []
affects: [phase-02-live-data-adapters, phase-03-scoring-engine]

key-files:
  deleted:
    - src/domain/airports/fetchArcGis.ts
    - src/domain/airports/fetchArcGis.test.ts
    - src/domain/airports/geometry.ts
    - src/domain/airports/geometry.test.ts
    - src/domain/airports/registry.ts
    - src/domain/airports/registry.test.ts
    - src/domain/airports/registry.integration.test.ts
---

## What this plan built (2026-08-13, superseded same day)

This plan was executed in full and passing before being deleted a few hours later in the
architecture pivot recorded in `01-03-SUMMARY.md`. For the record:

- **`fetchArcGis.ts`** — a paginated FAA ArcGIS FeatureServer query helper.
- **`geometry.ts`** — runway heading and parallel-runway-group separation derivation.
- **`registry.ts`** — two-stage fetch (facility + runway layers), `ARPT_ID` join, per-row Zod
  validation with a drop-ratio guard, index construction (`byIcao`/`byIata`/`byState`/`all`), and
  the `initRegistry()`/`getRegistry()` boot singleton wired into `src/instrumentation.ts`.
- Live integration test against the real FAA endpoints (`registry.integration.test.ts`) confirmed
  ~500 Part 139 commercial-service airports, correct native ICAO codes for Alaska/Hawaii (no
  synthesised K-prefix), and at least 5 runways with a finite parallel-runway separation for ATL.

Commits: `a3c3951`, `58f8331`, `a792e51` (all still in git history).

## What happened to it

Deleted in the 2026-08-13 architecture pivot, by the same explicit user direction that removed the
resolver/allowlist (see `01-03-SUMMARY.md` for full rationale). `src/instrumentation.ts`'s boot
hook was edited to drop the `initRegistry()` call.

**Consequence, stated plainly:** this was the project's only live source for physical-capacity
data (runway count, length, width, and parallel-runway separation) — the "physical-capacity
denominator" this project's own research explicitly identified FAA ArcGIS as providing. No
replacement exists anywhere in the codebase as of this writing. `QUERY-04` (Phase 4) is specified
against exactly this data ("derived from runway geometry ... cross-referenced with observed delay
conditions") and currently has no source to read from. See `.planning/STATE.md` Blockers/Concerns
and `.planning/REQUIREMENTS.md` DATA-01 for the open decision this leaves for Phase 2/3 planning:
rebuild as a per-request live call, or drop the physical-capacity signal from scope.

## Verification (at time of deletion)

- `npx tsc --noEmit` — clean.
- `npx vitest run` — 44/44 tests passing (including the live ArcGIS integration test).
- `npm run build` — clean.

No verification applies now — the code no longer exists.
