# Phase 2: Live Data Adapters & Caching - Research

**Researched:** 2026-08-13
**Domain:** Server-side data adapters for two live aviation APIs (OpenSky OAuth2 flight movements, FAA NAS XML delay/closure status), per-source TTL caching via `lru-cache`, isolated-failure contract
**Confidence:** MEDIUM — core facts (OpenSky time-span caps, OAuth2 token shape, `nasstatus.faa.gov`'s current live schema, `lru-cache`'s TTL API) are corroborated against the same official-docs sources CLAUDE.md's own Q1 research already used (HIGH-confidence per CLAUDE.md's own methodology); this session's web-search-derived items (JS timeout idiom, XML-parser landscape) are standard, uncontroversial patterns but tagged at their honest tool-derived tier (see Sources).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Cache implementation**
- D-01: Use the `lru-cache` package, as already named in ROADMAP.md's Phase 2 success criteria and PROJECT.md's Key Decisions table. Claude flagged a contradiction — `.claude/CLAUDE.md`'s own tech-stack research recommends a hand-rolled `Map`+TTL instead, since the cache's key space is naturally bounded (~500 airports × 2 dynamic sources ≈ 1,000 entries) and LRU eviction never actually triggers at that scale — but the user explicitly chose to keep `lru-cache` after that tradeoff was explained. This resolves the doc conflict in favor of the package; no change needed to ROADMAP.md/PROJECT.md wording.
- D-02: The cache is in-memory only and empties on every process restart, for both cache options — already an accepted cost in PROJECT.md/REQUIREMENTS.md's deferred-items list (disk persistence deferred unless quota bites). Not something this phase's cache-library choice affects.
- D-03: Per-source TTLs, accepting ARCHITECTURE.md's research defaults: OpenSky movement-window data 5–10 minutes; FAA NAS delay/closure status 2–5 minutes. Phase 1's FAA ArcGIS registry data needs no TTL in this phase — it's already a boot-once singleton.

**OpenSky movement window (DATA-02)**
- D-04: Query a trailing 24-hour window per airport for departures/arrivals — matches "how many flights departed/arrived today" style questions from the project brief. Whether OpenSky's `/flights/departure`/`/flights/arrival` endpoints require this to be split into multiple stitched calls (vs. one call) depending on their actual documented `begin`/`end` cap is a technical detail for the researcher to verify against live API docs, not a decision the user needed to make. **[Resolved by this research below — one call each, no stitching needed.]**

**OpenSky token refresh**
- D-05: Lazy refresh — check the cached token's expiry before each OpenSky call and fetch a new one only when it's missing or expired. No background refresh timer. The token is valid 30 minutes per `.claude/CLAUDE.md`'s Q1 research.

**Adapter failure & staleness (DATA-05)**
- D-06: On any adapter failure or timeout, hard-fail that source's data to `"unavailable"` immediately — no stale-cache-serve fallback, even if a stale cached value exists. This overrides Claude's ARCHITECTURE.md-sourced recommendation (serve stale value with a `stale: true` flag); the user chose the simpler hard-fail contract instead. Downstream (Phase 3's metric layer) must treat "unavailable" as the only failure state an adapter can report — there is no "stale" state to design for.
- D-07: Timeout is 3 seconds per adapter call, with no retry. Overrides ARCHITECTURE.md's suggested ~4–5s + one retry. Worst-case added latency per failing source is bounded to 3s, not ~10s.

**Airport-identifier validation (SEC-02 gap, re-opened by the Phase 1 pivot)**
- D-08: Phase 1's allowlist (`allowlist.ts`) was deleted along with the rest of the resolver stack — nothing in the codebase currently validates an airport identifier's shape before it could reach an outbound URL, contradicting CLAUDE.md's "SEC-02 is not deferrable polish." Phase 2 closes this at the adapter boundary: each adapter format-checks its input (regex shape check — 3-letter IATA and/or 4-letter ICAO as applicable to that adapter) before constructing any outbound request, and rejects anything that doesn't match rather than reintroducing a separate allowlist module. This is the SSRF-prevention gate CLAUDE.md requires; it now lives in the adapter layer instead of a Phase 1 resolution layer.

**IATA→ICAO mapping (source lost when Phase 1's FAA registry was deleted)**
- D-09: OpenSky requires ICAO codes (`KATL`), but `regions.ts`'s `REGION_LOOKUP` only carries IATA codes, and the FAA ArcGIS registry that used to supply the `ARPT_ID`↔`ICAO_ID` join no longer exists in the codebase. Fix at the data level, not with a derivation rule: change `REGION_LOOKUP`'s value type from `readonly string[]` to `readonly {iata: string; icao: string}[]`, so every hardcoded region/metro entry carries its correct ICAO code as data. This is a small edit to Phase 1's `regions.ts` made as part of this phase's plan, not a new Phase 1 discussion — the ~40 codes already in the table get their ICAO filled in once.
- D-10: `lookupAirports()`'s passthrough branch (a bare code the analyst types that isn't one of the hardcoded table entries) has no table row to pull an ICAO from. For that branch only, derive ICAO via the K+IATA prefix rule with explicit Alaska/Hawaii exceptions hardcoded alongside it (`ANC`→`PANC`, `HNL`→`PHNL`, per CLAUDE.md's documented exceptions) — never applied to table entries, which already carry the real value from D-09.

### Claude's Discretion

- Exact cache key format per source (e.g. `opensky:{icao}:{window}`, `nas:{icao}`) — implementation detail, not surfaced as a user decision. **[Resolved below — see Architecture Patterns / Pitfall 1.]**
- Whether OpenSky's 24-hour window requires multiple stitched API calls or fits in one, based on the endpoint's actual documented time-span cap — verify during research. **[Resolved below.]**
- `AdapterResult<T>` exact TypeScript shape (`ok`/`fail` discriminated union fields) — follows the pattern already sketched in ARCHITECTURE.md Pattern 2, adjusted to drop the "stale" branch per D-06 and to accept a `{iata, icao}` pair (or format-checked code) instead of the now-deleted `AirportRef` type per D-08/D-09. **[Resolved below — see Code Examples.]**
- Exact regex/shape used for the D-08 format check (e.g. `^[A-Z]{3}$` for IATA, `^[A-Z]{4}$` for ICAO) — implementation detail for the researcher/planner, not a user decision. **[Resolved below.]**

### Deferred Ideas (OUT OF SCOPE)

- **Physical-capacity data source (DATA-01)** — the FAA ArcGIS runway/facility registry that used to supply runway count/length/parallel-separation was deleted in the Phase 1 pivot; no replacement exists. This is a Phase 3 (scoring engine) decision — rebuild as a per-request live call there, or drop the physical-capacity signal from scope — not something this phase's OpenSky/NAS adapters need to solve. Flagged here so it isn't lost; tracked in `.planning/STATE.md`'s pending-todos.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-02 | System fetches per-airport departures and arrivals from OpenSky over an explicit, stated time window using OAuth2 client credentials | OpenSky OAuth2 token-exchange shape confirmed (Code Examples); `/flights/departure`/`/flights/arrival` 2-day time-span cap confirmed — a 24h window fits one call each (Architecture Patterns, Pitfall 1); nullable `estDepartureAirport`/`estArrivalAirport` handling documented (Common Pitfalls) |
| DATA-03 | System fetches current delay and closure status from the FAA NAS Status API | `nasstatus.faa.gov/api/airport-status-information` live-reconfirmed today (2026-08-13) — XML root schema, no query parameters (whole-feed fetch); XML-parsing approach recommended (Standard Stack, Don't Hand-Roll) |
| DATA-04 | All upstream responses are cached via `lru-cache` with a TTL chosen per source, reflecting each source's actual volatility | `lru-cache` v11.5.2 TTL API confirmed (construction-time default + per-`set()` override); per-source TTL/key-bucketing strategy specified (Architecture Patterns, Pitfall 1) |
| DATA-05 | One failing or timing-out upstream source degrades its own KPIs to "unavailable" without failing the whole answer | `AdapterResult<T>` shape (ok/fail, no stale branch per D-06); `AbortSignal.timeout(3000)` pattern for the D-07 3s no-retry timeout (Code Examples) |
</phase_requirements>

## Summary

This phase builds two independent, format-validated, cache-wrapped HTTP adapters — OpenSky (OAuth2, JSON) and FAA NAS Status (keyless, XML) — behind a shared `AdapterResult<T>` contract, plus the `lru-cache`-backed cache-aside helper and the D-08 regex validation gate that both adapters share. All five of CONTEXT.md's open technical questions resolve cleanly against live/official documentation:

1. **OpenSky's airport-keyed endpoints cap at 2 days, not 2 hours** — the 2-hour cap is specific to `/flights/all` only. A trailing 24-hour window fits in **one** call to `/flights/departure` and one to `/flights/arrival`; no stitching required. This directly resolves D-04's open question.
2. **OAuth2 token exchange is a standard client-credentials POST**: form-encoded `grant_type=client_credentials`, `client_id`, `client_secret` to `https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token`; response is `{access_token, expires_in: 1800, token_type: "Bearer"}`. D-05's lazy-refresh design (check cached expiry before each call) is directly supported — no need to rely on reactive 401 handling as the primary mechanism, though catching a 401 as a defensive fallback costs nothing.
3. **FAA NAS Status is XML with no built-in Node.js parser to lean on** — `DOMParser` does not exist in the Node runtime (browser-only API). Recommend `fast-xml-parser` (small, zero-dependency, standard choice) over hand-rolling a regex extractor, despite the project's stated dependency-minimalism preference, because XML has enough edge cases (CDATA, entity escaping, attribute quoting) that a regex parser is a classic "deceptively complex, looks fine until the schema changes slightly" hand-roll trap — see Don't Hand-Roll. This package was flagged `[SUS]` by the automated legitimacy check on a heuristic that appears to be a false positive (see Package Legitimacy Audit) but must still go through a human-verify checkpoint per protocol.
4. **`lru-cache` v11.5.2's TTL API**: `ttl` (ms) set at construction is the default for all entries; can be overridden per-entry via `cache.set(key, value, { ttl })`. `updateAgeOnGet` defaults to `false` — correct for this project (a cached value should expire on a fixed schedule matching source volatility, not get its clock reset just because someone asked about that airport again).
5. **The D-08 regex format-check is sufficient for OpenSky but the FAA NAS adapter has no injection surface at all to gate** — see Common Pitfalls / Pitfall 3 for why, and Security Domain for the full ASVS mapping. The regex check still belongs on both adapters' *inputs* for shape correctness and defense-in-depth, but only OpenSky actually interpolates the code into an outbound URL.

**Primary recommendation:** Build one shared `cache.ts` (`lru-cache`-backed, generic `withCache<T>(key, ttlMs, fn)` cache-aside wrapper) and one shared `types.ts` (`AdapterResult<T>`, no `stale` branch), then two adapter files (`opensky.ts`, `nasStatus.ts`) that both format-check their airport-code input, both use `AbortSignal.timeout(3000)` with no retry, and both return `AdapterResult<T>` — never throw past their own boundary.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OpenSky OAuth2 token acquisition/refresh | API/Backend | — | Server-only credential exchange; `server-only` import guard required (secrets never reach the browser, per SEC-01) |
| OpenSky movement-window fetch | API/Backend | — | Server-side `fetch` to a hardcoded upstream base URL; airport code is the only variable input, gated by D-08's regex check before URL construction |
| FAA NAS Status fetch + XML parse | API/Backend | — | Server-side `fetch` to a fixed, parameter-less URL (no per-request variable input at all — see Pitfall 3); XML→JS parsing happens here, before any data reaches the LLM (Phase 4) |
| TTL cache-aside wrapper | API/Backend | Database/Storage (in-process only) | `lru-cache` instance lives in server process memory — functions as this phase's only "storage" tier, but it is not a persistence layer (D-02: empties on restart) |
| Airport-identifier format validation (D-08) | API/Backend | — | Lives at the adapter boundary, not a separate resolution/allowlist layer (per the Phase 1 pivot); this is the SSRF gate for the one adapter that actually needs it (OpenSky) |
| `AdapterResult<T>` failure isolation (DATA-05) | API/Backend | — | Each adapter catches its own errors/timeouts and returns a typed `fail`, never throws past its call site — this is what lets Phase 3's metric layer degrade one KPI without failing the whole request |

No Browser/Client, Frontend-Server(SSR), or CDN/Static tier work exists in this phase — it is zero-UI by design (see CONTEXT.md's Phase Boundary).

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `lru-cache` | 11.5.2 [VERIFIED: npm registry] | Cache-aside wrapper for both adapters, per-source TTL | Locked by D-01 (user decision); `isaacs/node-lru-cache`, the de facto standard Node LRU/TTL cache, 531.8M weekly downloads, created 2011 — long-established, not a hand-roll risk |
| `fast-xml-parser` | 5.10.1 [ASSUMED — discovered via WebSearch this session, not an official-docs/Context7 source; registry-checked OK but see Package Legitimacy Audit for the `[SUS]` flag] | Parse the FAA NAS Status XML response into a JS object | Node has no built-in XML parser (`DOMParser` is browser-only — confirmed absent from the Node runtime); this is the standard zero-dependency choice (81.8M weekly downloads, created 2017, `NaturalIntelligence/fast-xml-parser`) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `server-only` | already installed (`^0.0.1`) | Build-time guard preventing adapter modules (which hold OpenSky credentials indirectly via `getEnv()`) from being imported into a client component | Already used in `src/config/env.ts`; apply the same import at the top of every new adapter file per CONTEXT.md's "Established Patterns" |
| `zod` | already installed (`^4.4.3`) | Optional: validate the shape of OpenSky's JSON response and the parsed NAS XML object before treating it as trusted data | Not strictly required by DATA-02–05, but consistent with the project's existing "validate at every trust boundary" posture (SEC-04) — recommended, not mandated by this phase's success criteria |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `lru-cache` | Hand-rolled `Map<string, {data, expiresAt}>` | Simpler, zero-dependency, and objectively sufficient at this project's ~1,000-entry key space (CLAUDE.md's own STACK.md research recommends this) — but D-01 is a locked user decision overriding that recommendation. Do not reopen. |
| `fast-xml-parser` | Hand-rolled regex extraction over the FAA NAS XML | Zero dependencies, and the current live schema (`Update_Time`, `Delay_type[]>Airport_Closure_List>Airport[]>ARPT,Reason,Start,Reopen`) is flat enough that a regex extractor could work today — but XML has enough edge cases (CDATA in a future `Reason` field, `&`/`<` entity-escaping, added attributes) that this is the kind of "looks done, silently breaks later" hand-roll CLAUDE.md's "Don't Hand-Roll" philosophy warns against for XML/date/URL parsing generally. Recommended only if the planner wants to avoid the `[SUS]`-flagged dependency entirely — see Package Legitimacy Audit before deciding. |
| `AbortSignal.timeout(3000)` | Manual `AbortController` + `setTimeout`/`clearTimeout` | Functionally equivalent; `AbortSignal.timeout()` is the newer one-line idiom (Node 24 supports it natively) and produces a distinguishable `TimeoutError` in the catch block — no reason to hand-write the older pattern |

**Installation:**
```bash
npm install lru-cache fast-xml-parser
```

**Version verification:** Verified via `npm view lru-cache version` → `11.5.2`, `npm view fast-xml-parser version` → `5.10.1` (checked live 2026-08-13; both current as of this research date). No `postinstall` scripts on either package (`npm view <pkg> scripts.postinstall` returned empty for both).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|--------------|---------|-------------|
| `lru-cache` | npm | ~15 yrs (created 2011-07-16) | 531.8M/wk | github.com/isaacs/node-lru-cache | OK | Approved — locked by D-01 |
| `fast-xml-parser` | npm | ~9 yrs (created 2017-01-28) | 81.8M/wk | github.com/NaturalIntelligence/fast-xml-parser | SUS (reason: "too-new" — heuristic reads the *latest version's* publish date, 2026-07-16, not package age; package itself predates this by 9 years) | Flagged — planner must add `checkpoint:human-verify` before this install, per protocol, despite the download count and package age suggesting the automated verdict is a false positive here |

**Packages removed due to `[SLOP]` verdict:** none

**Packages flagged as suspicious `[SUS]`:** `fast-xml-parser` — planner inserts `checkpoint:human-verify` before `npm install fast-xml-parser`. Human reviewer note for that checkpoint: this package has 81.8M weekly downloads and a 9-year-old public GitHub repo; the `SUS` verdict traces specifically to the "too-new" signal firing on the latest-version publish date rather than package age. Recommend approving after a 10-second glance at the repo, but the checkpoint must still occur per the Package Legitimacy Gate protocol — do not silently downgrade the verdict.

## Architecture Patterns

### System Architecture Diagram

```
Tool/metric layer (Phase 3, not built yet)
   │  calls with a validated {iata, icao} pair
   ▼
┌─────────────────────────── Adapter Boundary (this phase) ───────────────────────────┐
│                                                                                        │
│  opensky.ts                                    nasStatus.ts                           │
│  ┌──────────────────────────┐                  ┌──────────────────────────┐          │
│  │ 1. regex-validate icao    │                  │ 1. regex-validate icao    │          │
│  │    (^[A-Z]{4}$) — reject  │                  │    (^[A-Z]{4}$) — reject  │          │
│  │    before any I/O         │                  │    before any I/O         │          │
│  │ 2. token cache: expired?  │                  │ 2. withCache("nas:feed",  │          │
│  │    → POST auth token      │                  │    TTL 2-5min, fetch)     │          │
│  │    endpoint (D-05 lazy)   │                  │    — ONE shared cache      │          │
│  │ 3. withCache(             │                  │    entry for ALL airports  │          │
│  │    "opensky:{icao}:       │                  │    (see Pitfall 2)         │          │
│  │    {bucketed 24h window}",│                  │ 3. fetch (no query params, │          │
│  │    TTL 5-10min, fetch)    │                  │    whole feed) — 3s timeout│          │
│  │ 4. fetch x2 (departure +  │                  │    via AbortSignal.timeout │          │
│  │    arrival), 3s timeout   │                  │ 4. fast-xml-parser → JS    │          │
│  │    each, no retry (D-07)  │                  │ 5. filter parsed feed for  │          │
│  │ 5. normalize → typed      │                  │    this airport's ARPT     │          │
│  │    Movements object       │                  │    code                    │          │
│  └────────────┬───────────────┘                  └────────────┬───────────────┘          │
│               │ AdapterResult<Movements>                        │ AdapterResult<NasStatus>│
└───────────────┴───────────────────────────────────────────────┴──────────────────────────┘
                │ ok:true → {data, fetchedAt, source}   or   ok:false → {reason: "timeout"|"rate_limited"|"invalid_input"|"error"}
                ▼
        Metric layer (Phase 3) marks the corresponding KPI "unavailable" on any fail — never crashes the whole answer (DATA-05)

Shared:
  cache.ts   — withCache<T>(key, ttlMs, fn): lru-cache-backed cache-aside, generic across both adapters
  types.ts   — AdapterResult<T> (ok | fail, no "stale" branch per D-06)
  validate.ts — isValidIcao(code), isValidIata(code) — the D-08 regex gate, shared by both adapters
```

### Recommended Project Structure

```
src/domain/adapters/
├── types.ts          # AdapterResult<T> — shared discriminated union
├── validate.ts        # D-08 regex format-checks (isValidIcao/isValidIata), shared
├── cache.ts            # withCache<T>(key, ttlMs, fn) — lru-cache-backed cache-aside wrapper
├── opensky.ts           # token management + fetchMovements(icao)
├── opensky.test.ts
├── nasStatus.ts          # fetchNasStatus(icao) — fetches+caches the whole feed once, filters per airport
└── nasStatus.test.ts
```

### Pattern 1: Cache-aside with a bucketed time window (resolves D-04 + the cache-key discretion item)

**What:** A generic `withCache<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>` wraps every upstream call. For OpenSky specifically, the `begin`/`end` Unix timestamps for the "trailing 24h" window must be **rounded down to a fixed bucket boundary** (e.g., the nearest 5-minute mark, matching the TTL) before being used both in the outbound URL and in the cache key — computing `end = Math.floor(Date.now() / 1000)` fresh on every call produces a different cache key every single request, which defeats caching entirely (DATA-04's "repeated requests ... served from cache" success criterion would silently fail).
**When to use:** Any adapter whose query parameters include the current time.
**Example:**
```typescript
// domain/adapters/cache.ts
import { LRUCache } from "lru-cache";

const cache = new LRUCache<string, unknown>({ max: 2000 });

export async function withCache<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key);
  if (hit !== undefined) return hit as T;
  const value = await fn();
  cache.set(key, value, { ttl: ttlMs });
  return value;
}

// domain/adapters/opensky.ts (window bucketing)
const BUCKET_SECONDS = 5 * 60; // matches the OpenSky TTL
function bucketedWindow(): { begin: number; end: number } {
  const nowSec = Math.floor(Date.now() / 1000);
  const end = Math.floor(nowSec / BUCKET_SECONDS) * BUCKET_SECONDS;
  const begin = end - 24 * 60 * 60; // trailing 24h, per D-04
  return { begin, end };
}
const { begin, end } = bucketedWindow();
const cacheKey = `opensky:${icao}:${begin}-${end}`;
```
Source: pattern adapted from `.planning/research/ARCHITECTURE.md` Pattern 2's `${adapterName}:${icao}:${timeBucket}` key sketch [CITED: `.planning/research/ARCHITECTURE.md`], combined with `lru-cache`'s documented per-`set()` TTL override [CITED: isaacs.github.io/node-lru-cache/].

### Pattern 2: One shared cache entry for a whole-feed source (FAA NAS Status)

**What:** `nasstatus.faa.gov/api/airport-status-information` takes **no query parameters at all** — it always returns the full current status document for every affected US airport in one response (live-reconfirmed 2026-08-13: two `Delay_type` blocks covering 11 airports total, no `ARPT`-scoped filtering server-side). The adapter should therefore cache the **entire parsed feed under one fixed key** (e.g. `"nas:feed"`), not a per-`{icao}` key, and filter the cached/parsed object for the requested airport's `ARPT` code on every call. Per-airport cache keys for this source would be functionally identical to the shared-key approach but would issue no additional upstream calls savings — the shared-key form is simply more honest about what's actually being cached and guarantees the TTL is measured from one shared fetch, not N independent staggered ones.
**When to use:** Any upstream source whose response already contains data for every entity you might query, rather than being queryable per-entity.
**Trade-offs:** None meaningful — this is strictly better than a per-airport key for this specific source (fewer upstream calls, simpler invalidation).

### Anti-Patterns to Avoid

- **Un-bucketed "trailing 24h" cache keys:** computing `Date.now()` fresh inside the cache-key string on every call makes every request a cache miss, silently failing DATA-04's "served from cache without a duplicate upstream call" success criterion. See Pattern 1.
- **Per-airport cache keys for FAA NAS Status:** wastes cache entries and creates N independent TTL clocks for data that is fetched as a single atomic document. See Pattern 2.
- **Letting a hand-rolled regex XML "parser" silently mis-parse an unexpected but well-formed FAA schema change** (e.g., a `Reason` field containing `&` or a `<` character inside free text) — see Don't Hand-Roll.
- **One shared generic `fetchExternal(url)` helper for both adapters** — already called out in `.planning/research/ARCHITECTURE.md` Anti-Pattern 2; keep OpenSky and FAA NAS Status as separate files sharing only `AdapterResult<T>`, `withCache`, and the regex validators, not a shared HTTP client, so a fix to one adapter's retry/timeout/parsing logic can never accidentally change the other's.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| XML parsing of the FAA NAS Status response | A regex-based extractor pulling `ARPT`/`Reason`/`Start`/`Reopen` out of the raw XML string | `fast-xml-parser` (flagged `[SUS]` by legitimacy heuristic — see audit; approve via checkpoint) | XML has real edge cases a regex will get wrong the first time the schema drifts even slightly (entity-escaped `&` inside a `Reason` string, an added attribute, whitespace/CDATA) — Node has zero built-in XML support to fall back on, unlike JSON |
| OAuth2 token lifecycle (expiry tracking, lazy refresh) | A background `setInterval` timer refreshing the token proactively | A simple `{token, expiresAt}` module-level variable checked-and-refreshed lazily before each call (per D-05, already the locked decision) | D-05 already forbids the timer approach; the "don't hand-roll" risk here is over-building (a timer, a retry-with-backoff wrapper) beyond what D-05/D-07 actually ask for |
| Per-source TTL cache with eviction | Hand-rolled `Map` + manual `setTimeout` cleanup | `lru-cache` (D-01, locked) | Already decided; noted here only so the planner doesn't second-guess D-01 mid-implementation |

**Key insight:** This phase's hand-roll risk is concentrated entirely in XML parsing — everything else (caching, timeouts, token refresh) has either a locked decision or a one-line native-API idiom (`AbortSignal.timeout`) that is strictly simpler and safer than hand-rolling.

## Common Pitfalls

### Pitfall 1: Un-bucketed time windows silently defeat caching (DATA-04)

**What goes wrong:** The OpenSky adapter computes `begin`/`end` fresh from `Date.now()` on every call, producing a different cache key (and a different upstream URL) every time — the cache never hits, OpenSky's daily credit quota burns fast, and DATA-04's success criterion ("repeated requests ... served from cache without a duplicate upstream call") silently fails despite `lru-cache` being correctly wired.
**Why it happens:** "Trailing 24 hours" reads as "compute it live," and the obvious implementation does exactly that.
**How to avoid:** Round `end` down to the nearest TTL-sized bucket (e.g., 5 minutes) before using it in both the cache key and the outbound URL. See Architecture Patterns / Pattern 1.
**Warning signs:** In manual testing, two requests for the same airport seconds apart both show up as OpenSky network calls in logs/dev-tools instead of the second one being a cache hit.

### Pitfall 2: Treating FAA NAS Status as if it needed a per-airport request

**What goes wrong:** Building the NAS adapter to construct a per-airport URL or cache key (mirroring the OpenSky pattern) when the endpoint takes no query parameters and always returns every affected airport in one document — wastes cache slots, and worse, invites a future contributor to "fix" it by adding a fake `?ARPT=` query param that the FAA endpoint silently ignores (returning the same full document regardless), masking the bug rather than catching it.
**Why it happens:** Pattern-matching to OpenSky's per-airport-endpoint shape without checking that FAA NAS Status is architecturally different (whole-feed vs. queryable).
**How to avoid:** Cache the whole parsed feed under one fixed key (`"nas:feed"`); filter for the requested `ARPT` after the cache read. See Pattern 2.
**Warning signs:** Adapter code builds a URL string containing the airport code for the NAS Status call — that's a signal the shape has been copied from OpenSky incorrectly, since the real endpoint accepts no such parameter.

### Pitfall 3: Assuming D-08's regex gate is an SSRF control for both adapters

**What goes wrong:** Believing the airport-code format check is "the SSRF gate" uniformly for every adapter. It genuinely is one for OpenSky (the ICAO code is interpolated directly into the outbound query string: `?airport=KATL&begin=...&end=...`). It is **not** one for FAA NAS Status, because that endpoint's URL is a fixed constant with no query parameters at all — no user-influenced value ever reaches that `fetch()` call. Treating the NAS adapter's format check as a security control (rather than a correctness/defense-in-depth check) can create false confidence that "SEC-02 is handled uniformly" when the actual risk profile of the two adapters is different.
**Why it happens:** The two adapters look structurally similar (`fetch(airport) → AdapterResult<T>`), so it's natural to assume they share the same threat model.
**How to avoid:** Document explicitly (in code comments and in the plan's verification steps) that the OpenSky format check is genuinely SSRF-relevant (gates a value that reaches an outbound URL) while the NAS Status format check is correctness-only (gates which airport's data gets filtered out of an already-fetched, already-static document). Both checks should still exist and both should still reject malformed input early — but the security narrative for DOC-01 should be accurate about *why*.
**Warning signs:** A design doc or code comment claiming "SEC-02 is enforced identically across all adapters" without noting this asymmetry.

### Pitfall 4: `estDepartureAirport`/`estArrivalAirport` nullability silently corrupting movement counts

**What goes wrong:** OpenSky infers the origin/destination airport from ADS-B proximity, not a filed flight plan — these fields can be `null` in a flight record even though the record itself is real and belongs to the queried airport's departure/arrival list. Code that filters, groups, or joins on `estDepartureAirport`/`estArrivalAirport` without a null-check will silently drop or miscount these flights.
**Why it happens:** Easy to assume "this endpoint is airport-keyed, so every record obviously has that airport filled in" — but the *query* is airport-keyed (`?airport=KATL`), the *response field* is independently inferred and can still be null.
**How to avoid:** Treat `estDepartureAirport`/`estArrivalAirport` as `string | null` in the adapter's normalized output type from day one; count/label nulls explicitly rather than filtering them out silently. This was already flagged as a day-one concern in CLAUDE.md's Q1 research [CITED: `.claude/CLAUDE.md` §Q1] — repeated here because it is this phase's normalization step, specifically, that must implement it.
**Warning signs:** A movement count that's suspiciously lower than expected with no "N records had unknown origin/destination" note anywhere in the output.

### Pitfall 5: Secrets or full response bodies leaking into logs

**What goes wrong:** Logging the OpenSky `client_secret`, the bearer token, or the raw upstream response body (which could contain a delay `Reason` string with unexpected content) during adapter debugging.
**Why it happens:** Convenient during development ("just log the whole response to see what came back") and easy to forget to remove.
**How to avoid:** Log only structured, non-secret fields (status code, cache hit/miss, timing, airport code) — never the token, the client secret, or unfiltered response bodies. This is a direct extension of SEC-01 ("no key or upstream endpoint reachable from the browser") into "no key reachable from logs" and sets up SEC-04 (untrusted-text-to-LLM) for Phase 4 by establishing the habit of not treating upstream text as safe-to-print-verbatim.
**Warning signs:** `console.log(response)` or `console.log(token)` anywhere in adapter code, even temporarily.

## Code Examples

### `AdapterResult<T>` shape (resolves the D-06/D-08/D-09 discretion item)

```typescript
// domain/adapters/types.ts
export type AdapterFailReason = "timeout" | "invalid_input" | "rate_limited" | "no_data" | "error";

export type AdapterResult<T> =
  | { ok: true; data: T; fetchedAt: string; source: string }
  | { ok: false; reason: AdapterFailReason; detail?: string };
// No "stale" branch — D-06 overrides ARCHITECTURE.md's stale-serve suggestion.
// Input to every adapter function is a format-checked code (validate.ts), not the
// deleted AirportRef type — per D-08/D-09.
```
Source: adapted from `.planning/research/ARCHITECTURE.md` Pattern 2, with the `stale` branch removed per D-06 [CITED: `.planning/research/ARCHITECTURE.md`].

### D-08 format-check gate

```typescript
// domain/adapters/validate.ts
const ICAO_PATTERN = /^[A-Z]{4}$/;
const IATA_PATTERN = /^[A-Z]{3}$/;

export function isValidIcao(code: string): boolean {
  return ICAO_PATTERN.test(code);
}
export function isValidIata(code: string): boolean {
  return IATA_PATTERN.test(code);
}
```
Both regexes only admit uppercase A–Z, so no URL-reserved or control characters can pass through even without additional encoding — but call `encodeURIComponent(icao)` when building the OpenSky query string anyway, as defense-in-depth, in case the regex is ever loosened later.

### OpenSky adapter: token lifecycle + timeout + cache

```typescript
// domain/adapters/opensky.ts
import "server-only";
import { getEnv } from "@/config/env";
import { withCache } from "./cache";
import { isValidIcao } from "./validate";
import type { AdapterResult } from "./types";

const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) return cachedToken.token;

  const { OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET } = getEnv();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: OPENSKY_CLIENT_ID,
      client_secret: OPENSKY_CLIENT_SECRET,
    }),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`OpenSky token exchange failed: ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  // expires_in is seconds (1800 = 30min); subtract a small safety margin
  cachedToken = { token: body.access_token, expiresAt: now + (body.expires_in - 30) * 1000 };
  return cachedToken.token;
}

export async function fetchMovements(icao: string): Promise<AdapterResult<unknown>> {
  if (!isValidIcao(icao)) return { ok: false, reason: "invalid_input" };
  try {
    const token = await getToken();
    const BUCKET_S = 5 * 60;
    const end = Math.floor(Date.now() / 1000 / BUCKET_S) * BUCKET_S;
    const begin = end - 24 * 60 * 60;
    const key = `opensky:${icao}:${begin}-${end}`;

    const data = await withCache(key, 5 * 60 * 1000, async () => {
      const [dep, arr] = await Promise.all([
        fetch(
          `https://opensky-network.org/api/flights/departure?airport=${encodeURIComponent(icao)}&begin=${begin}&end=${end}`,
          { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) },
        ),
        fetch(
          `https://opensky-network.org/api/flights/arrival?airport=${encodeURIComponent(icao)}&begin=${begin}&end=${end}`,
          { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) },
        ),
      ]);
      if (!dep.ok || !arr.ok) throw new Error(`OpenSky ${dep.status}/${arr.status}`);
      return { departures: await dep.json(), arrivals: await arr.json() };
    });
    return { ok: true, data, fetchedAt: new Date().toISOString(), source: "opensky" };
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError" ? "timeout" : "error";
    return { ok: false, reason, detail: err instanceof Error ? err.message : String(err) };
  }
}
```
Source: OpenSky endpoint shapes, OAuth2 fields, and time-span caps [CITED: openskynetwork.github.io/opensky-api/rest.html — verified live 2026-08-13]; `AbortSignal.timeout` idiom [CITED: developer.mozilla.org/docs/Web/API/AbortSignal/timeout_static]; `lru-cache` per-entry TTL [CITED: isaacs.github.io/node-lru-cache/].

### FAA NAS Status adapter: whole-feed fetch + XML parse + per-airport filter

```typescript
// domain/adapters/nasStatus.ts
import "server-only";
import { XMLParser } from "fast-xml-parser";
import { withCache } from "./cache";
import { isValidIcao } from "./validate"; // used for input-shape correctness, not SSRF here — see Pitfall 3
import type { AdapterResult } from "./types";

const FEED_URL = "https://nasstatus.faa.gov/api/airport-status-information";
const parser = new XMLParser();

async function fetchFeed(): Promise<unknown> {
  return withCache("nas:feed", 3 * 60 * 1000, async () => {
    const res = await fetch(FEED_URL, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`FAA NAS Status ${res.status}`);
    const xml = await res.text();
    return parser.parse(xml);
  });
}

export async function fetchNasStatus(icao: string): Promise<AdapterResult<unknown>> {
  if (!isValidIcao(icao)) return { ok: false, reason: "invalid_input" };
  try {
    const feed = await fetchFeed();
    // filter `feed` for entries whose ARPT matches the FAA 3-letter LID derived from icao
    // (note: FAA feed keys by 3-letter ARPT, not 4-letter ICAO — a mapping step is needed here)
    return { ok: true, data: feed, fetchedAt: new Date().toISOString(), source: "faa-nas-status" };
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError" ? "timeout" : "error";
    return { ok: false, reason, detail: err instanceof Error ? err.message : String(err) };
  }
}
```
Source: FAA NAS Status root schema and current live content [CITED: nasstatus.faa.gov/api/airport-status-information — verified live 2026-08-13, two `Delay_type` blocks covering PVD/LMT/LFT/SNA and LAX/HNL/PHL/LAS/ASE/SAN present at fetch time]; `fast-xml-parser` basic usage is standard/well-documented [ASSUMED — package choice not verified against an official-docs/Context7 source this session, see Package Legitimacy Audit].

**Note for the planner:** the FAA feed keys airports by the 3-letter `ARPT` (FAA LID, e.g. `ATL`), while this phase's adapters otherwise operate on ICAO (`KATL`, per D-09's `regions.ts` edit). The `regions.ts` table already carries `iata` alongside `icao` per D-09 — use the `iata` value (which is usually, but not always, identical to the FAA LID) to filter the NAS feed, and flag any mismatch as an open item rather than assuming IATA and FAA LID are always the same 3 letters.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| Manual `AbortController` + `setTimeout`/`clearTimeout` for fetch timeouts (as sketched in `.planning/research/ARCHITECTURE.md`'s Pattern 2 example) | `fetch(url, { signal: AbortSignal.timeout(ms) })` | `AbortSignal.timeout()` has been broadly available in Node.js for several major versions and is fully supported in Node 24 | One line instead of four; a distinguishable `TimeoutError` name in the catch block instead of manually checking `err.name === "AbortError"` |

**Deprecated/outdated:** None specific to this phase's stack — `lru-cache` v11.x and `fast-xml-parser` v5.x are both current majors, not superseded APIs.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `fast-xml-parser` is the right XML-parsing dependency (as opposed to another package or a hand-rolled extractor) | Standard Stack, Don't Hand-Roll, Code Examples | Low-moderate — the package is registry-verified `OK`-adjacent (flagged `[SUS]` only on a "too-new" heuristic reading the latest version's publish date), 81.8M weekly downloads, 9-year-old repo. If wrong, swapping to another zero-dependency XML parser (e.g. `xml2js`, `fast-xml-parser`'s own sibling packages) is a contained, one-file change |
| A2 | `lru-cache`'s TTL/`updateAgeOnGet` API details (construction-time default, per-`set()` override, `updateAgeOnGet` default `false`) as reported by this session's WebSearch results | Standard Stack, Pattern 1, Code Examples | Low — these are long-stable, widely-documented API surface details of a 15-year-old package; even if a minor detail is imprecise, the plan should include a quick check against the installed package's own TypeScript types during implementation |
| A3 | The FAA feed's 3-letter airport identifier (`ARPT`) is usually but not always identical to a US airport's IATA code | Code Examples (planner note) | Moderate — if FAA LID and IATA diverge for any airport in `regions.ts`'s table, the NAS Status adapter would silently return no match for that airport instead of "unavailable" with a clear reason; flagged explicitly as an open item for the plan to address (e.g., a spot-check against a few known airports during implementation) rather than left implicit |

## Open Questions

1. **Does the FAA LID (`ARPT` in the NAS feed) ever diverge from the IATA code for any airport in `regions.ts`'s ~40-entry table?**
   - What we know: For major airports (ATL, JFK, LAX, etc.) FAA LID and IATA are identical in the common case; CLAUDE.md's own research flagged ATL's `ARPT_ID='ATL'` as the FAA LID field distinctly from `ICAO_ID='KATL'`, without asserting LID always equals IATA.
   - What's unclear: Whether any of `regions.ts`'s ~40 codes are among the known exceptions (there are a handful of US airports where FAA LID and IATA differ, historically a source of integration bugs in aviation-data tooling).
   - Recommendation: The plan should include a one-time spot-check (a short script or a manual test) comparing `regions.ts`'s IATA codes against a couple of live NAS Status responses (or a static FAA LID reference) for divergence, rather than assuming equality silently. Given DATA-03's success criterion only requires the feature to work for the airports actually exercised, this can be a lightweight verification step, not a blocking full-audit.

2. **Should the OpenSky adapter's `Movements` normalized shape distinguish `departureAirportCandidatesCount > 1` (ambiguous inference) from a clean single-candidate match?**
   - What we know: OpenSky's flight-response schema includes `departureAirportCandidatesCount`/`arrivalAirportCandidatesCount` alongside the nullable `estDepartureAirport`/`estArrivalAirport` fields (per CLAUDE.md's Q1 research).
   - What's unclear: Whether Phase 3's metric layer wants this confidence signal now or can treat "non-null estimated airport" as sufficient for v1's movement-count KPI.
   - Recommendation: This phase's adapter should pass the raw `*CandidatesCount` fields through in its normalized output (cheap to include, costs nothing) even if Phase 3 doesn't consume them yet — cheaper to carry the field forward now than to re-fetch/re-parse later if Phase 3 decides it wants it.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Entire adapter layer (`AbortSignal.timeout`, native `fetch`) | ✓ | v24.18.0 (checked live in this environment) | — |
| `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` env vars | OpenSky OAuth2 token exchange (DATA-02) | ✓ (`.env` present in project root with these keys already required by `src/config/env.ts`, in place since Phase 1) | — (values not read/printed by this research session) | None — SETUP-01 already makes the app refuse to start without these; no degraded mode is in scope for v1 |
| `nasstatus.faa.gov` reachability | FAA NAS Status fetch (DATA-03) | ✓ — live-fetched successfully during this research session (2026-08-13), real current data returned | — | None needed; `soa.smext.faa.gov` is explicitly NOT a fallback per CLAUDE.md's own finding (DNS failure + community-reported instability) |
| `auth.opensky-network.org` / `opensky-network.org` reachability | OpenSky token exchange + flight endpoints (DATA-02) | ✓ — live-fetched during this research session (docs page reachable; the actual authenticated endpoints were not exercised in this research pass since no test credentials were used, only the public docs) | — | None in scope for v1 (SETUP-01 requires credentials at startup) |

**Missing dependencies with no fallback:** none identified.

**Missing dependencies with fallback:** none identified.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|-----------------|---------|---------------------|
| V5 Input Validation | Yes | D-08's regex format-check (`^[A-Z]{4}$` ICAO / `^[A-Z]{3}$` IATA) at the adapter boundary, before any value is interpolated into an outbound URL |
| V9 Communication Security | Yes | Both upstream APIs are called exclusively over HTTPS (`fetch` to `https://...` hardcoded base URLs — never derived from user input); no TLS configuration needed beyond Node's default `fetch` behavior |
| V13 API and Web Service | Yes | SSRF prevention: outbound URLs are built from hardcoded base URLs plus, for OpenSky only, a regex-validated + `encodeURIComponent`-escaped airport code (never a raw, unchecked user string); the FAA NAS Status URL takes no variable input at all (see Pitfall 3) |
| V14 Configuration | Yes | OpenSky credentials read exclusively via `getEnv()` (never `process.env` directly, per CONTEXT.md's "Established Patterns"); every new adapter module imports `server-only` at the top, matching the existing `src/config/env.ts` pattern |
| V7 Error Handling and Logging | Yes | `AdapterResult<T>`'s `fail` branch must carry a safe, non-secret `detail` string; raw upstream response bodies, the OAuth2 `client_secret`, and bearer tokens must never be logged (see Pitfall 5) |
| V2 Authentication | Partial | Not user-facing auth — this is server-to-server OAuth2 client-credentials for the OpenSky API only; standard client-credentials grant, no custom auth logic to review |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| SSRF via unchecked airport-code interpolation into the OpenSky query string | Tampering | D-08 regex gate (`isValidIcao`) rejects anything not matching `^[A-Z]{4}$` before URL construction; `encodeURIComponent` as defense-in-depth |
| Credential/token leakage via logging | Information Disclosure | Never log `client_secret`, `access_token`, or raw response bodies (Pitfall 5); log only status codes, timing, cache hit/miss, and the (already-validated, non-secret) airport code |
| Prompt-injection-via-upstream-text, staged at this layer for Phase 4's benefit | Tampering (of LLM context, downstream) | Not this phase's job to sanitize for the LLM (that's Phase 4/SEC-04), but this phase's adapters are the first point where a free-text field (FAA's `Reason` string) enters the system — worth passing it through as a plain string field (not HTML/markup-rendered) so Phase 4 has an easy, already-isolated field to sanitize/truncate later, per `.planning/research/ARCHITECTURE.md`'s Q5 guidance |
| Upstream quota exhaustion (OpenSky's 4,000 credits/day, 4 credits per `/flights/*` call) causing a denial-of-service against the app's own feature availability | Denial of Service | Aggressive TTL caching (D-03) plus bucketed cache keys (Pitfall 1) are the actual mitigation here — not a security control per se, but directly protects DATA-05's "one failing source degrades gracefully" contract from being triggered by self-inflicted quota exhaustion |

## Sources

### Primary (HIGH confidence, carried forward from CLAUDE.md's own live-verified research — not re-verified live in this session but cross-checked and consistent with this session's fetch)
- `.claude/CLAUDE.md` §"Q1 — Live Public Aviation APIs" — OpenSky OAuth2 flow, endpoint caps, nullable field behavior, FAA NAS schema; originally live-tested 2026-08-12
- `.planning/research/ARCHITECTURE.md` §"Pattern 2", §"Q5 — Security Architecture" — `AdapterResult<T>` shape origin, SSRF/allowlist reasoning, prompt-injection-surface guidance

### Secondary (MEDIUM confidence — this session's own tool-fetched, official-documentation sources)
- [openskynetwork.github.io/opensky-api/rest.html](https://openskynetwork.github.io/opensky-api/rest.html) — live-fetched 2026-08-13, confirmed the `/flights/departure`/`/flights/arrival` 2-day cap (vs. `/flights/all`'s 2-hour cap) and the OAuth2 token-exchange request/response shape
- [nasstatus.faa.gov/api/airport-status-information](https://nasstatus.faa.gov/api/airport-status-information) — live-fetched 2026-08-13, confirmed the feed is currently live and returning real closure data, takes no query parameters
- [developer.mozilla.org/docs/Web/API/AbortSignal/timeout_static](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static) — `AbortSignal.timeout()` behavior
- [isaacs.github.io/node-lru-cache/](https://isaacs.github.io/node-lru-cache/) — `lru-cache`'s TTL/`updateAgeOnGet` API, referenced via this session's WebSearch results

### Tertiary (LOW confidence — WebSearch aggregation only, marked for validation; verify against the installed package's own type definitions during implementation)
- `fast-xml-parser` as "the standard choice" for Node XML parsing — WebSearch-derived, package-provenance-tagged `[ASSUMED]` per the Package Legitimacy Gate protocol regardless of its `OK`-adjacent registry signals
- The precise wording of `lru-cache`'s `updateAgeOnGet` default behavior — corroborated across multiple WebSearch results but not independently re-verified against the package's own README in this session

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM — `lru-cache` is a locked decision with registry-verified version; `fast-xml-parser` is `[ASSUMED]`/`[SUS]`-flagged and needs the planner's `checkpoint:human-verify`
- Architecture: MEDIUM-HIGH — the adapter/cache-aside shape is a direct extension of already-HIGH-confidence ARCHITECTURE.md patterns, adjusted for D-06/D-08/D-09's locked overrides; the two new findings (2-day vs 2-hour cap split, whole-feed vs per-airport NAS caching) are this session's own live-verified additions
- Pitfalls: MEDIUM — five pitfalls identified from direct reasoning over the confirmed API shapes (time-bucketing, whole-feed caching, SSRF-surface asymmetry, nullable fields, secret logging); none are speculative, all trace to a specific confirmed API behavior

**Research date:** 2026-08-13
**Valid until:** 30 days (2026-09-12) for the architectural/pattern guidance; OpenSky/FAA API shapes should be treated as stable but were only spot-checked today, not monitored — re-verify if either upstream API returns unexpected error codes during implementation
