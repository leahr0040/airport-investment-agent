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
- `AdapterResult<T>` exact TypeScript shape, following ARCHITECTURE.md Pattern 2 adjusted to drop the "stale" branch.

## Deferred Ideas

None — discussion stayed within Phase 2 scope.
