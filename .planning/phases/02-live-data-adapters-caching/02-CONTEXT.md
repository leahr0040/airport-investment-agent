# Phase 2: Live Data Adapters & Caching - Context

**Gathered:** 2026-08-13
**Updated:** 2026-08-13 (Phase 1 architecture pivot sanity check)
**Status:** Ready for planning

<domain>
## Phase Boundary

Every live data source the scoring engine needs (OpenSky movements, FAA NAS delay/closure status) is fetched through its own adapter, cached per-source with a TTL matched to its actual volatility, and fails in isolation — one source timing out or erroring must not take down the rest of the answer. Zero UI, zero LLM, zero scoring math in this phase (those are Phase 3/4).

**Post-gathering update:** Phase 1 was retroactively simplified (commit `d96b2e2`, 2026-08-13) — the FAA ArcGIS registry, the `resolve.ts`/`registry.ts`/`allowlist.ts` resolution stack, and the `AirportRef` type were all deleted and replaced with a hardcoded `regions.ts` name→code lookup. That registry was never in this phase's scope, but two things it used to provide now have no source and had to be re-decided here: airport-identifier validation before an outbound call (SEC-02) and the IATA→ICAO mapping OpenSky needs. See D-08, D-09, D-10 below.

</domain>

<decisions>
## Implementation Decisions

### Cache implementation
- **D-01:** Use the `lru-cache` package, as already named in ROADMAP.md's Phase 2 success criteria and PROJECT.md's Key Decisions table. Claude flagged a contradiction — `.claude/CLAUDE.md`'s own tech-stack research recommends a hand-rolled `Map`+TTL instead, since the cache's key space is naturally bounded (~500 airports × 2 dynamic sources ≈ 1,000 entries) and LRU eviction never actually triggers at that scale — but the user explicitly chose to keep `lru-cache` after that tradeoff was explained. This resolves the doc conflict in favor of the package; no change needed to ROADMAP.md/PROJECT.md wording.
- **D-02:** The cache is in-memory only and empties on every process restart, for both cache options — already an accepted cost in PROJECT.md/REQUIREMENTS.md's deferred-items list (disk persistence deferred unless quota bites). Not something this phase's cache-library choice affects.
- **D-03:** Per-source TTLs, accepting ARCHITECTURE.md's research defaults: OpenSky movement-window data 5–10 minutes; FAA NAS delay/closure status 2–5 minutes. Phase 1's FAA ArcGIS registry data needs no TTL in this phase — it's already a boot-once singleton.

### OpenSky movement window (DATA-02)
- **D-04:** Query a trailing 24-hour window per airport for departures/arrivals — matches "how many flights departed/arrived today" style questions from the project brief. Whether OpenSky's `/flights/departure`/`/flights/arrival` endpoints require this to be split into multiple stitched calls (vs. one call) depending on their actual documented `begin`/`end` cap is a technical detail for the researcher to verify against live API docs, not a decision the user needed to make.

### OpenSky token refresh
- **D-05:** Lazy refresh — check the cached token's expiry before each OpenSky call and fetch a new one only when it's missing or expired. No background refresh timer. The token is valid 30 minutes per `.claude/CLAUDE.md`'s Q1 research.

### Adapter failure & staleness (DATA-05)
- **D-06:** On any adapter failure or timeout, hard-fail that source's data to `"unavailable"` immediately — no stale-cache-serve fallback, even if a stale cached value exists. This overrides Claude's ARCHITECTURE.md-sourced recommendation (serve stale value with a `stale: true` flag); the user chose the simpler hard-fail contract instead. Downstream (Phase 3's metric layer) must treat "unavailable" as the only failure state an adapter can report — there is no "stale" state to design for.
- **D-07:** Timeout is 3 seconds per adapter call, with no retry. Overrides ARCHITECTURE.md's suggested ~4–5s + one retry. Worst-case added latency per failing source is bounded to 3s, not ~10s.

### Airport-identifier validation (SEC-02 gap, re-opened by the Phase 1 pivot)
- **D-08:** Phase 1's allowlist (`allowlist.ts`) was deleted along with the rest of the resolver stack — nothing in the codebase currently validates an airport identifier's shape before it could reach an outbound URL, contradicting CLAUDE.md's "SEC-02 is not deferrable polish." Phase 2 closes this at the adapter boundary: each adapter format-checks its input (regex shape check — 3-letter IATA and/or 4-letter ICAO as applicable to that adapter) before constructing any outbound request, and rejects anything that doesn't match rather than reintroducing a separate allowlist module. This is the SSRF-prevention gate CLAUDE.md requires; it now lives in the adapter layer instead of a Phase 1 resolution layer.

### IATA→ICAO mapping (source lost when Phase 1's FAA registry was deleted)
- **D-09:** OpenSky requires ICAO codes (`KATL`), but `regions.ts`'s `REGION_LOOKUP` only carries IATA codes, and the FAA ArcGIS registry that used to supply the `ARPT_ID`↔`ICAO_ID` join no longer exists in the codebase. Fix at the data level, not with a derivation rule: change `REGION_LOOKUP`'s value type from `readonly string[]` to `readonly {iata: string; icao: string}[]`, so every hardcoded region/metro entry carries its correct ICAO code as data. This is a small edit to Phase 1's `regions.ts` made as part of this phase's plan, not a new Phase 1 discussion — the ~40 codes already in the table get their ICAO filled in once.
- **D-10:** `lookupAirports()`'s passthrough branch (a bare code the analyst types that isn't one of the hardcoded table entries) has no table row to pull an ICAO from. For that branch only, derive ICAO via the K+IATA prefix rule with explicit Alaska/Hawaii exceptions hardcoded alongside it (`ANC`→`PANC`, `HNL`→`PHNL`, per CLAUDE.md's documented exceptions) — never applied to table entries, which already carry the real value from D-09.

### Claude's Discretion
- Exact cache key format per source (e.g. `opensky:{icao}:{window}`, `nas:{icao}`) — implementation detail, not surfaced as a user decision.
- Whether OpenSky's 24-hour window requires multiple stitched API calls or fits in one, based on the endpoint's actual documented time-span cap — verify during research.
- `AdapterResult<T>` exact TypeScript shape (`ok`/`fail` discriminated union fields) — follows the pattern already sketched in ARCHITECTURE.md Pattern 2, adjusted to drop the "stale" branch per D-06 and to accept a `{iata, icao}` pair (or format-checked code) instead of the now-deleted `AirportRef` type per D-08/D-09.
- Exact regex/shape used for the D-08 format check (e.g. `^[A-Z]{3}$` for IATA, `^[A-Z]{4}$` for ICAO) — implementation detail for the researcher/planner, not a user decision.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope & requirements
- `.planning/PROJECT.md` — Key Decisions table, esp. "Caching via the `lru-cache` package, in-memory, no database" and "Per-source cache TTLs rather than one global TTL" (both confirmed, not reopened, by this discussion)
- `.planning/REQUIREMENTS.md` — DATA-02, DATA-03, DATA-04, DATA-05 (this phase's requirements)
- `.planning/ROADMAP.md` §"Phase 2: Live Data Adapters & Caching" — goal, success criteria, dependencies

### Data source & architecture research
- `.claude/CLAUDE.md` §"Q1 — Live Public Aviation APIs" — OpenSky OAuth2 client-credentials flow, 30-minute token expiry, `/flights/departure`/`/flights/arrival` field behavior (nullable `estDepartureAirport`/`estArrivalAirport`), FAA NAS Status schema (`nasstatus.faa.gov`, keyless, XML), and the documented IATA/ICAO Alaska/Hawaii exceptions used in D-10
- `.planning/research/ARCHITECTURE.md` §"Pattern 2: Adapter/port shape per upstream API" — `AdapterResult<T>` shape, cache-aside wrapper keyed by `${adapterName}:${icao}:${timeBucket}`; §"Caching strategy" — the TTL defaults accepted in D-03 (source of the 5-10min/2-5min numbers, now confirmed rather than superseded). Two of this doc's assumptions are now **stale and superseded**: its stale-serve-on-failure suggestion is overridden by D-06, and every place it types adapter input as `AirportRef` (§"Pattern 1", the SSRF section) refers to a type deleted in the Phase 1 pivot — adapters now accept a `{iata, icao}` pair per D-08/D-09/D-10 instead.

### Prior phase context
- `.planning/phases/01-foundation-configuration-airport-registry-resolution/01-CONTEXT.md` — historical only; its D-02 (FAA ArcGIS registry, `ARPT_ID`/`ICAO_ID` join) describes code that was deleted in the 2026-08-13 architecture pivot and no longer exists
- `src/domain/airports/regions.ts` — the actual current Phase 1 output: hardcoded `REGION_LOOKUP` name→codes table and `lookupAirports()`. This phase's plan edits this file per D-09 (add `icao` alongside `iata` per entry) and D-10 (K-prefix fallback for the passthrough branch)
- `.planning/ROADMAP.md` §"Phase 1" architecture-pivot note and `.planning/REQUIREMENTS.md` SEC-02/DATA-01 annotations — record what Phase 1 traded away (registry coverage, the allowlist, physical-capacity data) and flag DATA-01's replacement as a Phase 3 decision, not this phase's

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/config/env.ts` — validated env module already exposes `OPENSKY_CLIENT_ID`/`OPENSKY_CLIENT_SECRET`; the OpenSky adapter's token-fetch call reads these via `getEnv()`, not `process.env` directly.
- `src/domain/airports/regions.ts` — the current Phase 1 output (`AirportRef`/`types.ts`/`fetchArcGis.ts` no longer exist, deleted in the 2026-08-13 pivot). `lookupAirports()` returns codes for a name/region query; per D-09/D-10 this phase edits it so each result carries `{iata, icao}` instead of a bare IATA string. Adapters accept that shape (format-checked per D-08) as their only valid input — the equivalent of the old `AirportRef` contract, just sourced differently.

### Established Patterns
- Pure-core discipline continues: adapters are the I/O boundary; nothing above them (metrics, scoring) does network calls. `AdapterResult<T>` is the seam.
- `server-only` import guard (used in `src/config/env.ts`) should also guard the new adapter modules, since they hold OpenSky credentials.
- No `lru-cache` dependency exists yet in `package.json` — this phase is what introduces it.
- No established pattern yet for typed upstream-fetch errors or `AbortSignal`-based timeout plumbing — Phase 1's `fetchArcGis.ts` used to be the reference example but was deleted; this phase's OpenSky/FAA-NAS adapters are establishing that pattern fresh, not following a precedent.

### Integration Points
- Adapters live under `src/domain/adapters/` per ARCHITECTURE.md's proposed layout (`opensky.ts`, `nasStatus.ts`, `cache.ts`, `types.ts`) — no such directory exists yet.
- `src/instrumentation.ts` no longer calls `initRegistry()` at boot (that call was removed along with the registry in the Phase 1 pivot) — there is currently nothing airport-related to await at boot. This phase's adapters are NOT boot-initialized regardless; they're called per-request, cache-aside.

</code_context>

<specifics>
## Specific Ideas

No UI or exact message copy involved — this phase is server-side data plumbing only, consumed by Phase 3's scoring engine and Phase 4's chat layer, neither of which exist yet.

</specifics>

<deferred>
## Deferred Ideas

- **Physical-capacity data source (DATA-01)** — the FAA ArcGIS runway/facility registry that used to supply runway count/length/parallel-separation was deleted in the Phase 1 pivot; no replacement exists. This is a Phase 3 (scoring engine) decision — rebuild as a per-request live call there, or drop the physical-capacity signal from scope — not something this phase's OpenSky/NAS adapters need to solve. Flagged here so it isn't lost; tracked in `.planning/STATE.md`'s pending-todos.

No other scope creep — discussion stayed within Phase 2 boundaries otherwise. No todos existed to fold or review (`todo.match-phase` returned zero matches).

</deferred>

---

*Phase: 2-Live Data Adapters & Caching*
*Context gathered: 2026-08-13*
