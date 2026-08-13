# Phase 2: Live Data Adapters & Caching - Context

**Gathered:** 2026-08-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Every live data source the scoring engine needs (OpenSky movements, FAA NAS delay/closure status) is fetched through its own adapter, cached per-source with a TTL matched to its actual volatility, and fails in isolation — one source timing out or erroring must not take down the rest of the answer. Phase 1's FAA ArcGIS registry (boot-once, no TTL) is out of scope here; this phase is the two *dynamic* sources plus the caching layer itself. Zero UI, zero LLM, zero scoring math in this phase (those are Phase 3/4).

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

### Claude's Discretion
- Exact cache key format per source (e.g. `opensky:{icao}:{window}`, `nas:{icao}`) — implementation detail, not surfaced as a user decision.
- Whether OpenSky's 24-hour window requires multiple stitched API calls or fits in one, based on the endpoint's actual documented time-span cap — verify during research.
- `AdapterResult<T>` exact TypeScript shape (`ok`/`fail` discriminated union fields) — follows the pattern already sketched in ARCHITECTURE.md Pattern 2, adjusted to drop the "stale" branch per D-06.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope & requirements
- `.planning/PROJECT.md` — Key Decisions table, esp. "Caching via the `lru-cache` package, in-memory, no database" and "Per-source cache TTLs rather than one global TTL" (both confirmed, not reopened, by this discussion)
- `.planning/REQUIREMENTS.md` — DATA-02, DATA-03, DATA-04, DATA-05 (this phase's requirements)
- `.planning/ROADMAP.md` §"Phase 2: Live Data Adapters & Caching" — goal, success criteria, dependencies

### Data source & architecture research
- `.claude/CLAUDE.md` §"Q1 — Live Public Aviation APIs" — OpenSky OAuth2 client-credentials flow, 30-minute token expiry, `/flights/departure`/`/flights/arrival` field behavior (nullable `estDepartureAirport`/`estArrivalAirport`), FAA NAS Status schema (`nasstatus.faa.gov`, keyless, XML)
- `.planning/research/ARCHITECTURE.md` §"Pattern 2: Adapter/port shape per upstream API" — `AdapterResult<T>` shape, cache-aside wrapper keyed by `${adapterName}:${icao}:${timeBucket}`; §"Caching strategy" — the TTL defaults accepted in D-03 (source of the 5-10min/2-5min numbers, now confirmed rather than superseded); note its stale-serve-on-failure suggestion is explicitly **overridden** by D-06

### Prior phase context
- `.planning/phases/01-foundation-configuration-airport-registry-resolution/01-CONTEXT.md` — D-02 (FAA ArcGIS is the sole registry source, `ARPT_ID` used as IATA field) and the registry's boot-once, no-TTL caching pattern this phase's adapters must NOT replicate for dynamic sources
- `.planning/phases/01-foundation-configuration-airport-registry-resolution/01-04-PLAN.md` — the `AirportRef`/`Registry` types this phase's adapters must accept as their only valid input (the SSRF allowlist established in Phase 1)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/config/env.ts` — validated env module already exposes `OPENSKY_CLIENT_ID`/`OPENSKY_CLIENT_SECRET`; the OpenSky adapter's token-fetch call reads these via `getEnv()`, not `process.env` directly.
- `src/domain/airports/types.ts` — `AirportRef` is the only type this phase's adapters should accept as input (never a raw string), matching Phase 1's SSRF allowlist contract.
- `src/domain/airports/fetchArcGis.ts` (from Phase 1, plan 01-04) — establishes the project's pattern for typed upstream-fetch errors (`ArcGisQueryError` with a named layer/status) and `AbortSignal`-based timeout plumbing; the OpenSky/FAA-NAS adapters should follow the same shape for their own typed errors, even though they're a different upstream.

### Established Patterns
- Pure-core discipline continues: adapters are the I/O boundary; nothing above them (metrics, scoring) does network calls. `AdapterResult<T>` is the seam.
- `server-only` import guard (used in `src/config/env.ts`) should also guard the new adapter modules, since they hold OpenSky credentials.
- No `lru-cache` dependency exists yet in `package.json` — this phase is what introduces it.

### Integration Points
- Adapters live under `src/domain/adapters/` per ARCHITECTURE.md's proposed layout (`opensky.ts`, `nasStatus.ts`, `cache.ts`, `types.ts`) — no such directory exists yet.
- `src/instrumentation.ts` currently awaits `initRegistry()` at boot (Phase 1); this phase's adapters are NOT boot-initialized — they're called per-request, cache-aside, unlike the registry singleton.

</code_context>

<specifics>
## Specific Ideas

No UI or exact message copy involved — this phase is server-side data plumbing only, consumed by Phase 3's scoring engine and Phase 4's chat layer, neither of which exist yet.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 2 scope. No todos existed to fold or review (`todo.match-phase` returned zero matches).

</deferred>

---

*Phase: 2-Live Data Adapters & Caching*
*Context gathered: 2026-08-13*
