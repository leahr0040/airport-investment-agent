# Phase 2: Live Data Adapters & Caching - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-13
**Phase:** 2-Live Data Adapters & Caching
**Areas discussed:** Cache implementation, OpenSky movement window, OpenSky token refresh, Adapter failure & staleness

---

## Cache implementation

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-rolled Map+TTL | ~15 lines, zero new dependency. Matches CLAUDE.md's explicit reasoning: no memory-bound eviction need at demo scale, correct TTL semantics is all that's required. | |
| lru-cache package | Matches the wording already locked in ROADMAP.md and PROJECT.md's Key Decisions table as-is. Pulls in a real dependency for eviction/memory-bound features this project doesn't need. | ✓ |

**User's choice:** lru-cache package.
**Notes:** Claude surfaced a contradiction between ROADMAP.md/PROJECT.md (name `lru-cache` explicitly) and `.claude/CLAUDE.md`'s tech-stack research (recommends against it). User asked two clarifying questions first — whether the cache is in-memory-only regardless of choice (confirmed yes, already an accepted cost in PROJECT.md/REQUIREMENTS.md, not a differentiator), and what the cache is actually used for in this project (explained: quota protection against OpenSky's 4,000 credits/day cap, and demo response speed, over a bounded ~1,000-entry key space). After that context, user explicitly chose to keep `lru-cache` over Claude's hand-rolled-Map recommendation.

Follow-up: TTL per source.

| Option | Description | Selected |
|--------|-------------|----------|
| ARCHITECTURE.md defaults | OpenSky movements ~5-10 min, FAA NAS status ~2-5 min. | ✓ |
| Different numbers | User specifies different TTL values. | |

**User's choice:** ARCHITECTURE.md defaults.

---

## OpenSky movement window

| Option | Description | Selected |
|--------|-------------|----------|
| Trailing 24 hours | Best match for "how many flights departed today" style questions. | ✓ |
| Trailing 2 hours | Matches the tighter cap CLAUDE.md's research noted for /flights/all specifically; cheaper in credits but noisier sample. | |

**User's choice:** Trailing 24 hours.
**Notes:** Question was first asked in English, then re-explained in Hebrew at the user's request before they answered.

---

## OpenSky token refresh

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy refresh on expiry check | Check cached token expiry before each call; fetch a new one only when needed. No background timer. | ✓ |
| Proactive refresh on a timer | Background interval refreshes before expiry so every request has a warm token. More moving parts for a benefit that doesn't matter in a request-driven demo. | |

**User's choice:** Lazy refresh on expiry check.

---

## Adapter failure & staleness

| Option | Description | Selected |
|--------|-------------|----------|
| Serve stale value, flagged | Return last successful cached value past TTL with `stale: true` rather than failing outright. Matches ARCHITECTURE.md's research. | |
| Hard-fail to unavailable | Any failure marks the KPI "unavailable" immediately, even if a stale cached value exists. | ✓ |

**User's choice:** Hard-fail to unavailable — overrides Claude's stale-serve recommendation.

Follow-up: timeout and retry policy.

| Option | Description | Selected |
|--------|-------------|----------|
| ~5s timeout, 1 retry | Matches ARCHITECTURE.md's suggested AbortController-based timeout with one retry. | |
| Different timeout/retry numbers | User specifies different numbers. | ✓ |

**User's choice:** 3 second timeout, no retry.

---

## Claude's Discretion

- Exact cache key format per source (e.g. `opensky:{icao}:{window}`, `nas:{icao}`).
- Whether OpenSky's 24-hour window requires multiple stitched API calls or fits in one call, based on the endpoint's actual documented time-span cap — verify during research.
- `AdapterResult<T>` exact TypeScript shape, following ARCHITECTURE.md Pattern 2 adjusted to drop the "stale" branch and accept a `{iata, icao}` pair instead of the deleted `AirportRef` type.
- Exact regex/shape for the SEC-02 format check (e.g. `^[A-Z]{3}$` IATA, `^[A-Z]{4}$` ICAO).

## Deferred Ideas

- Physical-capacity data source (DATA-01) — no replacement exists for the deleted FAA ArcGIS registry. Belongs to Phase 3 (scoring engine), already tracked in STATE.md's pending todos.

---

## Update — 2026-08-13 (Phase 1 architecture pivot sanity check)

**Trigger:** Between this discussion and now, Phase 1 was retroactively simplified (commit `d96b2e2`): the FAA ArcGIS registry, `resolve.ts`/`registry.ts`/`allowlist.ts`, and the `AirportRef` type were deleted and replaced with a hardcoded `regions.ts` lookup. User asked to check whether Phase 2's context needed updating as a result.

**Areas discussed:** SEC-02 validation gap, IATA→ICAO mapping, passthrough-code fallback.

### SEC-02 validation gap

| Option | Description | Selected |
|--------|-------------|----------|
| Format-check in adapter | Regex shape check (IATA/ICAO pattern) before any outbound URL is built. | ✓ |
| Rebuild a minimal allowlist | Static Set of known-valid codes, membership-checked. | |
| Accept the gap for now | Defer validation, revisit in Phase 5. | |

**User's choice:** Format-check in adapter (D-08).

### IATA→ICAO mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded K-prefix derivation rule | 'K' + IATA, with AK/HI exceptions, applied everywhere. | |
| Static IATA↔ICAO lookup table | Explicit data, no derivation rule. | |
| User's own proposal | Change `REGION_LOOKUP`'s value type to carry `{iata, icao}` pairs per entry, so the table itself is the source of truth. | ✓ |

**User's choice:** Extend `regions.ts`'s table shape to `{iata, icao}[]` (D-09).
**Notes:** User proposed this directly rather than picking from the offered options; Claude confirmed it was sound (single source of truth, no exception list to maintain) and flagged the remaining gap — the passthrough branch for codes not in the table has no row to pull an ICAO from.

### Passthrough-code fallback

| Option | Description | Selected |
|--------|-------------|----------|
| K-prefix rule as fallback only | Table entries use D-09's real data; only the passthrough branch (code not in the table) derives ICAO via K+IATA with AK/HI exceptions. | ✓ |
| Reject passthrough entirely | Bare codes not in the table return unresolved rather than guessing. | |

**User's choice:** K-prefix rule as fallback only (D-10).

### Deferred Ideas (this update)

None — both decisions stayed within Phase 2's boundary (validating/deriving identifiers before adapters use them), even though D-09's edit touches a Phase 1 file.
