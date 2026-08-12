# Phase 1: Foundation — Configuration, Airport Registry & Resolution - Research

**Researched:** 2026-08-12
**Domain:** Server-boot config validation (Next.js + Zod) and a live-fetched, in-memory US airport reference/resolution registry (FAA ArcGIS REST). Zero UI, zero LLM.
**Confidence:** HIGH — every data-shape claim in this document was confirmed with a live query against the actual production ArcGIS endpoints during this research session (not training-data recall), and the Next.js startup-hook claim was confirmed against the current (v16.3.0) official docs page.

## Summary

This phase has three concrete deliverables, in dependency order: (1) a Zod-validated env module that throws a specific, actionable error naming the missing variable before the server accepts any request; (2) a boot-time fetch of two FAA ArcGIS FeatureServer layers (`NTAD_Aviation_Facilities`, `Runways_View`) that together become the in-memory canonical airport registry, joined by `ARPT_ID`; and (3) a pure-function resolver over that registry that turns IATA/ICAO/name/region/metro-cluster references into `AirportRef[]`, and is simultaneously the SSRF allowlist gate for every later phase.

The single most consequential finding from live-testing the ArcGIS endpoints today: the naive `FAR_139_TYPE_CODE IS NOT NULL` filter implied by D-01 does **not** work as written — ArcGIS/Esri text fields store "no value" as an empty string, not SQL `NULL`, so that filter alone returns 5,167 rows (all facilities with *any* non-null value in the field, including blanks) instead of the ~500 real Part 139 commercial-service airports. The correct filter requires an explicit additional `<> ''` clause, verified live to return exactly 516 rows. This is a plan-breaking detail if missed — a naive port of D-01's stated filter would build a registry 10x too large, including uncertified GA fields.

The second consequential, time-sensitive finding: **West Palm Beach International formally changed its FAA identifier from `PBI`/`KPBI` to `DJT`/`KDJT` this year**, and the live ArcGIS registry already reflects `DJT` — `PBI` returns zero rows today. The IATA passenger-facing code does not flip to `DJT` until August 18, 2026 (six days from this research date), so analysts, the project brief's own conventions, and D-06's hardcoded South Florida metro cluster (`MIA/FLL/PBI`) will all keep referring to `PBI` for some time after the registry itself stops recognizing it. This is a concrete, live instance of exactly the "known FAA-LID/IATA mismatch" question the phase's discretion item asked about — it needs an explicit alias, not silent breakage.

**Primary recommendation:** Build the registry with a two-stage fetch (facilities first, single page; runways second, paginated and filtered by joining against the facility `ARPT_ID` set) and gate one hardcoded alias (`PBI → DJT`) into the metro-cluster/lookup table so D-06's literal `PBI` reference keeps resolving. Validate env vars in a module that is eagerly imported from `instrumentation.ts`'s `register()` export — this is the one Next.js 16 hook confirmed to run once per server instance and to block request-serving until it completes, which is what "fails at startup" requires; a top-of-file `throw` in a module nobody eagerly imports will not fire until something happens to import that module.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Env/config validation at boot | API / Backend (process startup) | — | Runs once per Node process before any request; no browser or DB involvement |
| Airport registry fetch (FAA ArcGIS) | API / Backend | — | Server-side-only fetch at boot per SEC-01's later constraint; browser never calls FAA directly |
| In-memory registry storage/indexing | API / Backend (process memory) | — | No persistent DB in scope; registry lives for the process lifetime, rebuilt on restart |
| Airport resolution (`resolve()`) | API / Backend | — | Pure function, zero I/O; consumed by tool layer in later phases, never by the browser directly |
| SSRF allowlist enforcement | API / Backend | — | Enforced at the same boundary as resolution — the registry's key set *is* the allowlist; adapters (Phase 2+) accept only a validated `AirportRef` |

No capability in this phase touches Browser/Client, CDN/Static, or Database/Storage tiers — this phase is entirely server-process, in-memory, boot-time work, consistent with the project's no-persistent-DB, no-UI-yet scope.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Registry scope & source**
- D-01: Registry includes only Part 139 commercial-service, public-use facilities (filter on `FAR_139_TYPE_CODE` present + public use) — excludes GA airfields, heliports, private strips, closed fields.
- D-02: FAA ArcGIS is the sole registry source — no second live fetch (e.g. OurAirports) for identity data. `ARPT_ID` (FAA LID) is used directly as the IATA-code field. This holds for the vast majority of continental US commercial airports; documented as a known simplification in the design doc, not silently assumed.

**Region definitions (RESOLVE-03)**
- D-03: Nine fixed US Census-style regions, each a hardcoded state→region list: New England, Mid-Atlantic, South, Midwest, Southwest, Mountain West, Pacific/West Coast, Alaska, Hawaii.
- D-04: A bare state name (e.g. "Texas") also resolves on its own, independent of the 9 named regions — the region map is built from a state→region table, so per-state lookup falls out of the same data structure.
- D-05: Washington D.C. is not a state; it is folded into the Mid-Atlantic region for lookup purposes.

**Metro ambiguity clusters (RESOLVE-04)**
- D-06: Six hardcoded metro clusters, each with an explicit airport-code list: LA (LAX/BUR/LGB/SNA/ONT), NYC (JFK/LGA/EWR), SF Bay Area (SFO/OAK/SJC), DC (DCA/IAD/BWI), Chicago (ORD/MDW), South Florida (MIA/FLL/PBI). No geographic-proximity algorithm — a fixed lookup table only.

**Resolver miss & match behavior**
- D-07: When an identifier matches nothing in the registry, `resolve()` returns an empty result plus nearest-candidate suggestions (not a thrown exception) — this is the contract Phase 4's chat layer will build "did you mean X?" on top of.
- D-08: Name matching (not code matching) uses substring/contains matching, not typo-tolerant fuzzy (Levenshtein) matching — simpler, predictable, sufficient for the demo's expected query patterns.

### Claude's Discretion
- Exact `.env` validation error-message wording and format (SETUP-01) — Claude designs a clear, actionable message naming the variable and where to get it.
- Whether `ARPT_ID`-as-IATA needs any hardcoded exception list for known FAA-LID/IATA mismatches — verify during research/planning; not surfaced as a user decision. **See Finding below — this research surfaced one live, currently-active exception (PBI/DJT) that directly affects D-06's literal cluster list.**
- Internal registry data structure / indexing approach (by code, by state, by region) — implementation detail. **See "In-Memory Registry Indexing" below.**

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within Phase 1 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SETUP-01 | App validates all required credentials at startup, names the missing variable and where to get it | `instrumentation.ts` `register()` hook confirmed (Next.js 16.3.0 official docs) as the correct fail-loud boot point; Zod v4 error-formatting helpers (`z.prettifyError`, `z.treeifyError`) give per-field messages to build the error string from |
| SETUP-02 | `.env.example` + README, reviewer goes clone→running without reading source | Env schema (below) enumerates every required var; `.env.example` content derives directly from the schema's keys and descriptions |
| SETUP-03 | One validated env module, required vs optional distinguished | Zod `.object({ required fields, optional fields with `.optional()` })` pattern (below); single `src/config/env.ts` module, all other modules import from it, never read `process.env` directly |
| DATA-01 | Fetch FAA ArcGIS facility+runway data at startup, retain per-runway geometry incl. parallel-runway separation | Exact endpoints, `where`/`outFields` clauses, and pagination mechanics verified live (below); parallel-runway separation derivation approach documented (below) |
| RESOLVE-01 | IATA/ICAO/name → canonical airport | Registry keyed by `ARPT_ID` (IATA stand-in per D-02) and `ICAO_ID`; name matching per D-08 (substring/contains) |
| RESOLVE-02 | Alaska/Hawaii ICAO prefixes (PANC/PHNL, not KANC/KHNL) | Confirmed live: `ICAO_ID` field on the facility layer already carries the correct `PANC`/`PHNL` values natively from FAA data — no derivation/string-concat needed, only correct field consumption |
| RESOLVE-03 | Region name → airport set | State→region table (proposed below) built once at boot from the same `STATE_CODE` field already fetched; region and per-state lookup fall out of the same map (D-04) |
| RESOLVE-04 | Ambiguous metro name → candidate list, not silent pick | D-06's 6 clusters, with the one required correction (`PBI` → `DJT` alias) documented below |
| SEC-02 | Every user-supplied identifier validated against the resolved registry before reaching any outbound request | Registry's key `Set`/`Map` *is* the allowlist; Zod `.refine()` against that set, not a regex or a separately maintained hardcoded list |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | 4.4.3 [VERIFIED: npm registry, published 2026-05-04, 254M weekly downloads] | Env schema validation; airport-identifier allowlist validation | Already the project's chosen validation library (STACK.md); one schema library serves both the SETUP-03 config job and the SEC-02 security-boundary job |
| `server-only` | 0.0.1 [VERIFIED: npm registry, 11.4M weekly downloads; SUS-flagged by the automated legitimacy check for having no `repository` field in its `package.json` — this is a known false positive: it is the official Vercel/Next.js-maintained import-guard package, referenced directly in Next.js's own docs] | Build-time guard preventing the env/config module (and later, adapters) from being imported into a client component | Standard Next.js idiom for "this file must never ship to the browser"; zero runtime cost, throws at build time on violation |
| Next.js (built-in `instrumentation.ts`) | 16.3.0 [VERIFIED: npm registry; behavior confirmed against official docs, `nextjs.org/docs/app/api-reference/file-conventions/instrumentation`, "stable since v15.0.0"] | The boot hook that runs config validation once, before the server accepts any request | No third-party package needed — this is a first-class Next.js file convention |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node 24 native `fetch` | built-in (Node 24.18.0 confirmed installed on this machine) | Fetching both FAA ArcGIS FeatureServer endpoints | No HTTP client library needed; `fetch` is a Node 24 global, live-tested in this session against both feature layers with real results |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled Zod env schema in `src/config/env.ts` | `@t3-oss/env-nextjs` | t3-env adds automatic client/server split and tree-shaking guarantees, but this project has zero `NEXT_PUBLIC_*` vars in this phase and STACK.md already committed to minimal dependencies — the extra package buys nothing not already achieved by `server-only` + one Zod schema |
| Equirectangular flat-earth projection for runway separation | Full geodesic (Vincenty) distance | At airport scale (runways are hundreds of meters to ~2km apart), the equirectangular approximation's error is on the order of centimeters — using full geodesic math is unjustified precision for a capacity-classification signal, not a navigation system |

**Installation:**
```bash
npm install zod server-only
```

**Version verification:** `npm view zod version` → `4.4.3` (published 2026-05-04). `npm view server-only version` → `0.0.1` (published 2022-09-03, unchanged for 4 years — a `0.0.1`-forever version is this package's own convention, not a staleness signal; it's a one-file compile-time guard with no surface area to version). Both confirmed live against the npm registry during this research session, not from training data.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `zod` | npm | ~6 yrs (created 2020-03-07) | 254M/wk | github.com/colinhacks/zod | OK | Approved |
| `server-only` | npm | ~4 yrs (created 2022-09-03) | 11.4M/wk | none listed in package.json | SUS | Flagged — see note below; planner should still add a `checkpoint:human-verify` before install per protocol, but this is a well-known, official Vercel-maintained package with no postinstall script and is directly documented on nextjs.org itself |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `server-only` — flagged solely because its `package.json` omits a `repository` field (common for tiny single-purpose packages maintained inside a monorepo, in this case Vercel's `next.js` repo, where the standalone npm package doesn't carry a back-link). No `postinstall` script; downloads and age are consistent with a legitimate, widely-used package. Recommend the planner add a lightweight `checkpoint:human-verify` step (e.g., "confirm `npm view server-only repository` shows nothing suspicious and the package is imported only for its documented side-effect-free build guard") rather than treating this as a real risk signal.

## Architecture Patterns

### System Architecture Diagram

```
BOOT SEQUENCE (once per Node process)
┌─────────────────────────────────────────────────────────────────────┐
│ instrumentation.ts → register()                                      │
│   1. import "./src/config/env.ts"  ── eager import forces Zod parse  │
│      ├─ success → env frozen, available via getEnv()                 │
│      └─ failure → throw with "Missing FOO_KEY — get one at <url>"    │
│                     → Next.js server never becomes ready              │
│   2. import "./src/domain/airports/registry.ts" → buildRegistry()    │
│      ├─ fetch NTAD_Aviation_Facilities (1 page, ~516 rows)           │
│      ├─ fetch Runways_View (paginated, ~6446 PU rows, filtered       │
│      │   client-side to the 516 ARPT_IDs from step above)            │
│      ├─ group runways per airport → derive parallel-runway           │
│      │   separation (heading bucket + perpendicular distance)        │
│      └─ freeze in-memory Registry { byIcao, byIata, byState,         │
│          byRegion, all: AirportRef[] }                               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Registry is now a module-level singleton
REQUEST-TIME (every call into this phase's code)
┌─────────────────────────────────────────────────────────────────────┐
│ Caller supplies a raw string ("LA", "PANC", "New England", "SFO")    │
│         │                                                             │
│         ▼                                                             │
│ resolve(query: string, registry: Registry): ResolveResult             │
│   ├─ exact ICAO/IATA(ARPT_ID) match → single AirportRef              │
│   ├─ region/state name match (byRegion map) → AirportRef[]           │
│   ├─ metro-cluster alias match (incl. PBI→DJT) → AirportRef[]        │
│   ├─ substring name match (D-08) → AirportRef[] (possibly empty)     │
│   └─ no match → { matches: [], suggestions: nearestCandidates() }    │
│         │                                                             │
│         ▼ ONLY validated AirportRef values leave this boundary        │
│ Every later phase's adapter/tool signature accepts AirportRef,        │
│ never a raw string — this IS the SEC-02 SSRF allowlist gate           │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
src/
├── config/
│   ├── env.ts              # Zod schema, parse-or-throw, getEnv() accessor
│   └── env.test.ts          # missing-var / present-var cases
├── domain/
│   └── airports/
│       ├── types.ts          # AirportRef, Registry, ResolveResult
│       ├── regions.ts        # STATE_TO_REGION table (D-03/D-04/D-05)
│       ├── metroClusters.ts  # D-06 clusters + PBI→DJT alias
│       ├── fetchArcGis.ts    # paginated ArcGIS query helper (shared by both layers)
│       ├── registry.ts       # buildRegistry(): fetch both layers, join, index
│       ├── geometry.ts       # bearing/heading + parallel-runway separation math
│       ├── resolve.ts        # pure function: string → ResolveResult
│       └── resolve.test.ts
instrumentation.ts             # register(): imports env.ts and registry.ts eagerly
.env.example
```

### Pattern 1: Eager-import-at-boot (the actual "fail loud at startup" mechanism)

**What:** Next.js does not evaluate arbitrary modules at process boot — it lazily compiles/imports whatever a given request path needs. A Zod schema that throws at the top of `env.ts` only fires the **first time something imports `env.ts`**, which in dev could be delayed until the first request hits a route handler that happens to import it. `instrumentation.ts`'s exported `register()` function is the one Next.js hook documented to run exactly once when a new server instance starts, and **must complete before the server is ready to handle requests** — including in `next dev`.
**When to use:** Always, for this phase's SETUP-01 requirement. This is not optional polish; without it, "starting the app with a required credential missing fails immediately" is only true by accident (only if some other early-loaded module happens to import `env.ts` first).
**Example:**
```typescript
// instrumentation.ts — Source: nextjs.org/docs/app/api-reference/file-conventions/instrumentation (v16.3.0 docs, confirmed live 2026-08-12)
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./src/config/env');      // throws here if invalid — blocks boot
    await import('./src/domain/airports/registry').then(m => m.buildRegistry());
  }
}
```
```typescript
// src/config/env.ts
import 'server-only';
import { z } from 'zod';

const schema = z.object({
  OPENSKY_CLIENT_ID: z.string().min(1, 'OPENSKY_CLIENT_ID is required — register a free OpenSky OAuth2 client at opensky-network.org (Account → API Client)'),
  OPENSKY_CLIENT_SECRET: z.string().min(1, 'OPENSKY_CLIENT_SECRET is required — see OPENSKY_CLIENT_ID'),
  // LLM key: exact var name depends on the provider decision made in a later phase (ANTHROPIC_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY)
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // z.prettifyError (Zod v4) — Source: zod.dev/error-formatting, confirmed current for zod@4.4.3
  throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
}
export const env = parsed.data;
```

### Pattern 2: Two-stage fetch, join by ARPT_ID, then geometry derivation

**What:** Fetch the facility layer first (single page, ~516 rows after the corrected filter) to get the authoritative set of in-scope `ARPT_ID`s. Fetch the runway layer second, filtered only by `FACILITY_USE_CODE='PU'` (the runway layer has no `FAR_139_TYPE_CODE` field — confirmed live, see Pitfall 1 below), paginated across ~4 requests (6,446 PU rows ÷ 2,000/page), then discard any runway row whose `ARPT_ID` isn't in the facility set from stage one.
**When to use:** This is the only correct order — attempting the reverse (filter runways first by ARPT_ID IN (...) with a 516-item list) risks URL length limits on a GET request and gains nothing, since the runway layer must be paginated regardless.
**Example — pagination loop, verified against live `maxRecordCount: 2000` on both layers:**
```typescript
// src/domain/airports/fetchArcGis.ts
// Source: developers.arcgis.com/rest/services-reference — exceededTransferLimit is the
// documented signal to keep paging (confirmed via WebSearch against Esri's own docs, 2026-08-12)
const BASE = 'https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services';

async function queryAll(layer: string, where: string, outFields: string): Promise<any[]> {
  const results: any[] = [];
  let offset = 0;
  while (true) {
    const url = new URL(`${BASE}/${layer}/FeatureServer/0/query`);
    url.searchParams.set('where', where);
    url.searchParams.set('outFields', outFields);
    url.searchParams.set('f', 'json');
    url.searchParams.set('returnGeometry', 'false');
    url.searchParams.set('resultRecordCount', '2000');
    url.searchParams.set('resultOffset', String(offset));
    url.searchParams.set('orderByFields', 'OBJECTID');   // stable paging order

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`ArcGIS ${layer} query failed: ${res.status}`);
    const body = await res.json();
    results.push(...body.features.map((f: any) => f.attributes));
    if (!body.exceededTransferLimit) break;
    offset += 2000;
  }
  return results;
}

// Stage 1 — facilities, single page in practice (516 < 2000), but the loop is defensive
const facilities = await queryAll(
  'NTAD_Aviation_Facilities',
  "FACILITY_USE_CODE='PU' AND FAR_139_TYPE_CODE IS NOT NULL AND FAR_139_TYPE_CODE<>''",  // ← the corrected filter
  'ARPT_ID,ICAO_ID,ARPT_NAME,CITY,STATE_CODE,LAT_DECIMAL,LONG_DECIMAL,FACILITY_USE_CODE,FAR_139_TYPE_CODE'
);
const arptIds = new Set(facilities.map(f => f.ARPT_ID));

// Stage 2 — runways, paginated, then filtered client-side against arptIds
const allPuRunways = await queryAll(
  'Runways_View',
  "FACILITY_USE_CODE='PU'",   // no FAR_139_TYPE_CODE field on this layer — join, don't refilter here
  'ARPT_ID,RWY_ID,RWY_LEN,RWY_WIDTH,LAT1_DECIMAL,LONG1_DECIMAL,LAT2_DECIMAL,LONG2_DECIMAL,SURFACE_TYPE_CODE,COND'
);
const runways = allPuRunways.filter(r => arptIds.has(r.ARPT_ID));
```

### Pattern 3: Parallel-runway separation from raw endpoint coordinates

**What:** Neither ArcGIS layer publishes a "parallel-runway separation" field. Each runway row is one physical strip (`RWY_ID` like `"08L/26R"`) with two endpoint coordinates. Derive heading from the endpoints, bucket runways at the same airport whose headings are within a tolerance of each other (or of each other's reciprocal) as "parallel candidates," then compute the perpendicular lateral distance between candidate pairs using a local flat-earth (equirectangular) projection centered on the airport.
**Why not rely on the `L`/`C`/`R` suffix alone:** It's a strong signal (e.g. `08L`/`08R` at the same airport are almost always the intended parallel pair) but not sufficient — ATL's real-world 5th runway (`10/28`) has no L/C/R suffix yet sits close enough to `09R/27L` to function as a closely-spaced parallel pair in FAA capacity terms; heading+geometry catches this, naming convention alone would miss it. This matters directly for QUERY-04 in a later phase (runway separation → capacity → unmet-demand explanation), so getting the geometry right here, not just the naming heuristic, is worth the extra ~20 lines.
**Example:**
```typescript
// src/domain/airports/geometry.ts
function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Local flat-earth projection, meters, centered on the airport reference point.
// Accurate to centimeters at runway-separation scale (hundreds of meters to ~2km) —
// full geodesic math (Vincenty) is unjustified precision here.
function toLocalMeters(lat: number, lon: number, lat0: number, lon0: number) {
  const x = (lon - lon0) * Math.cos((lat0 * Math.PI) / 180) * 111_320;
  const y = (lat - lat0) * 110_540;
  return { x, y };
}

export function deriveParallelGroups(runways: RunwayRow[], lat0: number, lon0: number) {
  const withGeometry = runways.map(r => {
    const heading = bearingDeg(r.LAT1_DECIMAL, r.LONG1_DECIMAL, r.LAT2_DECIMAL, r.LONG2_DECIMAL) % 180;
    const mid = toLocalMeters(
      (r.LAT1_DECIMAL + r.LAT2_DECIMAL) / 2,
      (r.LONG1_DECIMAL + r.LONG2_DECIMAL) / 2,
      lat0,
      lon0
    );
    return { ...r, heading, mid };
  });

  const TOLERANCE_DEG = 15; // wide enough to catch ATL's offset 5th runway; may over-group at
                             // complex crossing-runway airports — surface raw numbers, don't hide behind a boolean
  const groups: RunwayRow[][] = [];
  for (const rwy of withGeometry) {
    const group = groups.find(g => Math.abs(g[0].heading - rwy.heading) <= TOLERANCE_DEG);
    if (group) group.push(rwy); else groups.push([rwy]);
  }

  return groups.map(group => {
    if (group.length < 2) return { runways: group, separationMeters: null };
    const [a, b] = group; // pairwise for the common 2-parallel case; extend to all-pairs if a 3rd shows up
    const thetaRad = (a.heading * Math.PI) / 180;
    const nx = Math.cos(thetaRad), ny = -Math.sin(thetaRad); // perpendicular unit vector
    const dx = b.mid.x - a.mid.x, dy = b.mid.y - a.mid.y;
    const separationMeters = Math.abs(dx * nx + dy * ny);
    return { runways: group, separationMeters };
  });
}
```

### Anti-Patterns to Avoid
- **Filtering `FAR_139_TYPE_CODE IS NOT NULL` without also excluding empty string:** Confirmed live today — this alone returns 5,167 rows instead of 516 (a 10x-too-large registry including uncertified GA fields). Esri text fields store "no value" as `''`, not SQL `NULL`. Always pair `IS NOT NULL` with `<> ''` for any ArcGIS text-field "has a value" filter.
- **Deriving Alaska/Hawaii ICAO codes with `"K" + IATA` string concatenation:** Don't — the facility layer's `ICAO_ID` field already carries the correct native value (`PANC`, `PHNL`) straight from FAA data. Confirmed live for ANC and HNL. Any hand-derivation logic is both unnecessary and a known bug source (documented in PITFALLS.md Q1 Pitfall 1).
- **Treating `ARPT_ID` as a stable, permanent IATA stand-in with no exception path:** D-02 is a reasonable simplification for the vast majority of airports, but it is not universally true today — see the PBI/DJT finding below. Build the metro-cluster/alias table as *data*, not as an assumption baked into the resolution algorithm, so a future rename doesn't require a code change, only a data-table edit.
- **Filtering the runway layer by the same `FAR_139_TYPE_CODE` clause used for facilities:** That field does not exist on `Runways_View` — confirmed live (35-field schema dump contains no `FAR_139_TYPE_CODE`). Join on `ARPT_ID` against the facility result set instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Env var validation with clear missing-key errors | A custom `if (!process.env.X) throw` chain per variable | Zod `.object()` schema + `z.prettifyError()` | One schema is the "one validated env module" SETUP-03 requires; per-field custom messages via `.min(1, "message")` give the exact "name the variable and where to get it" wording in one place, not scattered `if` checks |
| ArcGIS pagination | A fixed-count loop guessing how many pages exist | The documented `exceededTransferLimit` response field | Esri's own docs are explicit that record-count-based guessing is unreliable (a page can return 0 features and still have `exceededTransferLimit: true` in edge cases) — always trust the flag, not the returned count |
| Great-circle/geodesic distance for runway separation | A hand-rolled trig formula from memory | The verified equirectangular projection shown above (or a well-tested haversine if a later phase's long-haul-distance calc needs actual great-circle distance over hundreds/thousands of miles) | At runway scale (meters to ~2km) the two approaches agree to within centimeters; a naive raw lat/long Euclidean distance (no projection at all) is the actual failure mode to avoid — same class of bug documented for the antimeridian case in PITFALLS.md Q1 Pitfall 7, though runway geometry never crosses ±180° so that specific bug doesn't apply here |

**Key insight:** Every "don't hand-roll" item above isn't about avoiding a library — it's about not re-deriving something the live data or Esri's own documented contract already hands you correctly (native `ICAO_ID`, the `exceededTransferLimit` flag). The pattern across this whole phase is: query the authoritative live source and consume what it returns, don't re-derive it from a simpler assumption that happens to work for the common case.

## Common Pitfalls

### Pitfall 1: `FAR_139_TYPE_CODE IS NOT NULL` silently over-includes
**What goes wrong:** A plan or implementation that takes D-01's filter description literally (`FAR_139_TYPE_CODE IS NOT NULL`) builds a registry of 5,167 facilities instead of 516 — 10x too large, including GA airfields with no commercial certification.
**Why it happens:** Esri ArcGIS/SQL-adjacent `where` clauses use `NULL` for "field genuinely absent from the schema for this record," but this particular field is populated with an empty string `''` for non-certificated facilities rather than left `NULL` — a data-modeling choice specific to this dataset, not a general ArcGIS rule.
**How to avoid:** Always filter with `FAR_139_TYPE_CODE IS NOT NULL AND FAR_139_TYPE_CODE<>''`. Verified live: this returns exactly 516 rows (503 across the 50 states + DC, plus 13 in US territories — see Pitfall 3).
**Warning signs:** A registry that includes airports the analyst has never heard of (small GA fields), or a facility count noticeably higher than the ~500 Part-139-certificated airports figure documented publicly by the FAA.

### Pitfall 2: `PBI` no longer resolves — the project's own hardcoded assumption is already stale
**What goes wrong:** D-06's South Florida cluster is written as `MIA/FLL/PBI`. As of this research date (2026-08-12), the live FAA ArcGIS registry has **already** renamed West Palm Beach's `ARPT_ID` from `PBI` to `DJT` (`ICAO_ID` from `KPBI` to `KDJT`) — confirmed by live query, `PBI` returns zero rows, `DJT` returns the airport ("PRESIDENT DONALD J TRUMP INTL", West Palm Beach, FL). The airport's IATA passenger-facing code (what flight-booking systems, boarding passes, and almost certainly an analyst's own vocabulary will use) does not switch to `DJT` until August 18, 2026.
**Why it happens:** FAA identifier changes and IATA identifier changes are administratively decoupled and can flip on different dates — this is a live, currently-mid-transition case, not a hypothetical.
**How to avoid:** Add a small alias table (`{ PBI: 'DJT' }`, extensible for future renames) consulted by the resolver before/alongside the direct `ARPT_ID` lookup, and use `DJT` as the canonical code in the metro-cluster data itself (so the cluster still round-trips correctly once IATA also catches up on Aug 18). Do not hardcode `PBI` as if it will remain valid — it already isn't, in the registry this phase fetches.
**Warning signs:** A resolver test asserting `resolve("PBI")` returns nothing, or the South Florida metro cluster silently returning only 2 of its intended 3 airports.

### Pitfall 3: Territory airports (PR/GU/VI/AS/MP) fall outside D-03's 9-region scheme
**What goes wrong:** The corrected 516-row facility filter includes 13 US-territory commercial airports (Puerto Rico: BQN/PSE/SJU; Virgin Islands: STT/STX; Guam: GUM; American Samoa: PPG/FAQ/Z08; Northern Mariana Islands: GSN/GRO/TNI; Midway Atoll: MDY) — confirmed live. None of these have a `STATE_CODE` value that appears in any of D-03's 9 named regions or D-04's 50-state+DC table, so they cannot resolve via region search and would sit in the registry unreachable by anything except a direct code lookup.
**Why it happens:** The FAA's ArcGIS facility layer scope is "all official and operational aerodromes across the United States and territories" (per the layer's own metadata) — territory inclusion is a byproduct of using the FAA's dataset as-is, not a deliberate scoping choice made in CONTEXT.md.
**How to avoid:** This wasn't a locked decision in CONTEXT.md and needs an explicit call at planning time: either (a) exclude territory `STATE_CODE`s at fetch/filter time (consistent with REQUIREMENTS.md's "Non-US airports" being out of scope and PROJECT.md's US-investment-firm framing — recommended), or (b) include them but explicitly document that they're only reachable by direct code, never by any of the 9 named regions. Flagging this now so the planner makes the call deliberately rather than by accident.
**Warning signs:** A registry row with a `STATE_CODE` that doesn't appear as a key in the region-lookup table — this should be an explicit, tested case (either "excluded, and here's the test proving it" or "included, and here's the test proving direct lookup still works").

### Pitfall 4: Runway layer has no certification filter of its own
**What goes wrong:** Filtering `Runways_View` by `FACILITY_USE_CODE='PU'` alone (its only relevant shared filter field) still returns 6,446 rows — runways at every public-use airport in the country, not just the 516 Part-139-certified ones. Skipping the join-back-to-facilities step silently pulls in runway geometry for thousands of airports outside the registry's intended scope.
**Why it happens:** The two feature layers don't share a consistent filter vocabulary — `Runways_View` was confirmed live to lack a `FAR_139_TYPE_CODE` field entirely (full 35-field schema dump contains no such field).
**How to avoid:** Always filter the runway result set client-side against the `ARPT_ID` set already established from the facility query (Pattern 2 above). Never treat `Runways_View`'s own filters as sufficient on their own.
**Warning signs:** Runway count per airport looking suspicious for airports not expected to be in the registry at all — a build-time assertion that every runway row's `ARPT_ID` exists in the facility map is cheap insurance here.

## Code Examples

Verified patterns from official/live sources (see Patterns 1–3 above for full examples):

### Env validation error message shape (SETUP-01)
```typescript
// Pattern: one message per missing var, naming both the var and where to get it
OPENSKY_CLIENT_ID: z.string().min(1,
  'OPENSKY_CLIENT_ID is required — register a free OAuth2 client at opensky-network.org (Account → API Client), no credit card needed'
)
```

### Registry index shape (Claude's discretion item — internal structure)
```typescript
// src/domain/airports/types.ts
export interface AirportRef {
  icao: string;        // e.g. "KATL", "PANC" — native from ICAO_ID, never derived
  iata: string;         // === ARPT_ID (D-02) or its resolved alias (e.g. DJT for the former PBI)
  name: string;
  city: string;
  state: string;         // 2-letter STATE_CODE
  lat: number;
  lon: number;
  runways: RunwaySummary[];  // count, individual length/width/surface, parallel-group separations
}

export interface Registry {
  byIcao: Map<string, AirportRef>;
  byIata: Map<string, AirportRef>;    // includes aliases (PBI → the DJT AirportRef)
  byState: Map<string, AirportRef[]>;
  byRegion: Map<string, AirportRef[]>; // derived from byState + the region table at build time
  all: AirportRef[];
}
```
This flat `Map`-per-index-dimension shape (rather than a single object with computed-on-read filters) was chosen because: (a) it's the simplest structure that makes every RESOLVE-0x lookup an O(1)/O(k) map read with no per-call filtering logic, (b) it's trivially unit-testable (`registry.byIcao.get('PANC')` is a one-line assertion), and (c) at ~516 rows total, memory/build cost is irrelevant — this is squarely a "simplest thing that works" call, not a performance-sensitive one.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Bundle a static CSV (OurAirports or similar) as the airport registry at build time | Fetch live from FAA ArcGIS at boot, cache in-process for the run | This project's own PROJECT.md decision (2026-08-12), superseding the earlier ARCHITECTURE.md research draft that assumed a bundled dataset | Registry reflects same-day FAA data (e.g., the PBI→DJT rename) rather than a snapshot that could be months stale; tradeoff is a boot-time network dependency instead of a zero-network build artifact |
| `resultOffset`/`resultRecordCount` pagination checked by counting returned rows | Check the `exceededTransferLimit` response field | Documented Esri best practice, not a recent change, but worth calling out since row-counting is the intuitive-but-wrong approach | A page can (rarely) return 0 features and still have more pages — trusting the count instead of the flag can silently truncate the registry |

**Deprecated/outdated:** None specific to this phase's stack — Next.js 16.3.0, Zod 4.4.3, and both ArcGIS FeatureServer layers are all current, live-verified as of this research date.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Proposed state→region table (New England/Mid-Atlantic/South/Midwest/Southwest/Mountain West/Pacific/Alaska/Hawaii, 9 buckets covering all 50 states + DC) is a reasonable, defensible common-usage mapping | Region Definitions (below) | These are not official US Census Bureau divisions (Census uses different boundaries, e.g. groups TX into "West South Central," not "Southwest") — a reviewer familiar with Census geography could flag a specific state's bucket as debatable (TX, MO, KY, WV are the most contestable). D-03 already commits to "Census-style" (not literal Census) regions, so this is within the locked decision's spirit, but the exact table is this research's proposal, not a verified external source. |
| A2 | Territory airports (PR/GU/VI/AS/MP, 13 rows) should be excluded from the registry, consistent with "Non-US airports" being out of scope | Pitfall 3 | If the planner instead decides to include them, they need an explicit "reachable by code only" test case, or D-03's region table needs a 10th bucket — neither was a locked decision in CONTEXT.md, so this needs a planning-time call either way |
| A3 | A 15° heading tolerance is a reasonable default for grouping "parallel candidate" runways | Pattern 3 | Too narrow misses real close-parallel pairs (like ATL's 5th runway); too wide could mis-group non-parallel runways at a handful of complex, non-orthogonal-runway airports (rare among the 516 in scope, but not verified against the full dataset in this session) |
| A4 | No airport in the 516-row registry other than West Palm Beach has an `ARPT_ID`/IATA mismatch materially affecting D-06's other 5 metro clusters | Pitfall 2 | Only spot-checked against D-06's literal 19 named codes (all confirmed present except PBI) plus ATL/ORD/ANC/HNL — did not exhaustively diff all 516 rows against a canonical IATA list this session; a second undiscovered mismatch is possible but was not found in the codes actually specified by CONTEXT.md |

**If this table is empty:** N/A — see entries above.

## Open Questions

1. **Should territory airports (PR/GU/VI/AS/MP/Midway) be included in or excluded from the registry?**
   - What we know: 13 of the 516 live rows are outside the 50 states + DC; none map to any of D-03's 9 regions.
   - What's unclear: CONTEXT.md's D-01/D-03 don't explicitly address this — it's a gap between "US airports only" (REQUIREMENTS.md Out of Scope) and "whatever FAA's ArcGIS layer happens to include."
   - Recommendation: Exclude at fetch/filter time (add `AND STATE_CODE NOT IN ('PR','VI','GU','AS','MP','QM')` to the facility query) — simplest, matches the project's stated US-investment-firm framing, and avoids an unreachable-by-region dead zone in the registry. Surface this as a one-line note in the design doc's assumptions section either way.

2. **Does the `PBI → DJT` alias need to be bidirectional or exposed in resolver output?**
   - What we know: The registry itself only contains `DJT`. An analyst typing "PBI" needs it to resolve.
   - What's unclear: Whether the resolved `AirportRef` should echo back "resolved 'PBI' → DJT (formerly PBI; FAA renamed 2026)" in a way later phases' chat narration can surface, per D-07's "never silently pick" philosophy extended to renames.
   - Recommendation: Have `resolve()` return the alias-triggered match with a `matchedVia: "PBI (legacy code)"` field alongside the canonical `AirportRef`, so Phase 4's narration can say "Interpreting PBI as West Palm Beach Intl (DJT)" rather than silently substituting — consistent with the existing D-07 pattern for ambiguity, extended to renames.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js native `fetch` | ArcGIS registry fetch | Yes — live-tested in this session | Node 24.18.0 | — |
| Outbound HTTPS to `services.arcgis.com` | DATA-01 | Yes — live-tested via Node's own `fetch` in this session, real JSON returned | — | — |
| `npm` / package install | zod, server-only | Yes | confirmed via `npm view` in this session | — |

**Note on this research session's own tooling:** A direct `curl` call from this session's Bash sandbox to `services.arcgis.com` failed with a Windows `schannel`/certificate-revocation-check error. This is a sandbox-specific curl/schannel quirk, **not** a real connectivity problem — verified by running the equivalent request through Node's native `fetch()` in the same environment immediately after, which succeeded and returned real data. Do not treat this as an "ArcGIS may be unreachable" risk; the app's actual runtime (`node`/`next dev`) is unaffected.

**Missing dependencies with no fallback:** none identified for this phase's scope.
**Missing dependencies with fallback:** none identified — this phase has no LLM/OpenSky dependency (those are Phase 2+); its only external dependency (FAA ArcGIS) has no documented fallback per PROJECT.md's constraints and was confirmed reachable.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V5 Validation, Sanitization and Encoding | Yes | Zod schema validation of both env vars (SETUP-03) and airport identifiers (SEC-02) — reject-by-default, not sanitize-and-continue |
| V12 Files and Resources (SSRF) | Yes | The resolved registry's key set is the sole allowlist; no code path in this phase (or any later phase per the architecture) interpolates a raw user string into an outbound URL — every outbound call in later phases is typed to accept only `AirportRef` |
| V14 Configuration | Yes | Secrets read exclusively through `src/config/env.ts`, guarded by the `server-only` import; no `NEXT_PUBLIC_*` vars in this phase's scope |
| V2 Authentication | No | No user-facing auth in this phase (or project — single-analyst demo tool, explicitly out of scope) |
| V3 Session Management | No | No session concept exists yet in this phase (introduced in Phase 4) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| SSRF via unvalidated airport identifier reaching an outbound `fetch()` in a later phase | Tampering / Elevation of Privilege | Registry-backed allowlist (`Zod .refine()` against `registry.byIcao`/`byIata` key sets), enforced at the resolver boundary this phase builds — never a regex, never a separately-maintained hardcoded list that can drift from the actual registry |
| Secrets read from `process.env` scattered across modules, one forgetting a null-check | Information Disclosure | Single `src/config/env.ts` module (SETUP-03), `server-only` import guard prevents accidental client-bundle inclusion, `getEnv()`/`env` object is the only sanctioned read path |
| Startup succeeding silently with a missing credential, failing confusingly later mid-request | Denial of Service (self-inflicted) | Fail loud at boot via `instrumentation.ts` `register()` (Pattern 1) — never let a missing var surface as a runtime `undefined` deep in an adapter call |

## Sources

### Primary (HIGH confidence — live-tested this session)
- `https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_Aviation_Facilities/FeatureServer/0` — schema, `maxRecordCount: 2000`, live queries for ATL/ORD/ANC/HNL, the corrected `FAR_139_TYPE_CODE<>''` filter (516 rows), the territory-airport spot-check (13 rows), and the PBI→DJT confirmation
- `https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/Runways_View/FeatureServer/0` — full 35-field schema dump (confirms no `FAR_139_TYPE_CODE` field), `maxRecordCount: 2000`, live query for ATL (5 runways, real lengths/widths/surfaces), `FACILITY_USE_CODE='PU'` count (6,446)
- `https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation` — official Next.js 16.3.0 docs, confirms `register()` runs once per server instance and must complete before request-serving begins
- Node 24.18.0 native `fetch()`, executed live against the ArcGIS endpoint in this session — confirms real runtime connectivity independent of this session's own curl/schannel quirk
- `npm view zod version` / `npm view server-only version` / `npm view {package} scripts.postinstall` — live npm registry queries, this session

### Secondary (MEDIUM confidence)
- `https://zod.dev/error-formatting` and `https://zod.dev/v4/changelog` (via WebSearch, cross-checked against `github.com/colinhacks/zod` changelog) — `z.prettifyError`/`z.treeifyError` as the current v4 error-formatting API, `.format()`/`.flatten()` deprecated
- Esri's own `developers.arcgis.com/rest/services-reference` documentation (via WebSearch) — `exceededTransferLimit` as the documented, authoritative pagination-continuation signal
- `https://www.techtimes.com/articles/320369/...` (via WebSearch) — West Palm Beach FAA-LID-to-`DJT`/IATA-to-`PBI` timeline; the underlying fact (registry already shows `DJT`, not `PBI`) was independently re-confirmed via a direct live ArcGIS query in this session (Primary tier), so this source is corroborating context, not the sole basis for the finding

### Tertiary (LOW confidence)
- General web search results on FAA-LID/IATA mismatch patterns (Pilot Institute, SimpleFlying, Wikipedia examples like New Century AirCenter/JCI, Pilot Point/PIP) — used only to confirm mismatches are a known general phenomenon in aviation data, not to source any specific claim used in this document's recommendations

## Metadata

**Confidence breakdown:**
- ArcGIS query mechanics (endpoints, filters, pagination, field names): HIGH — every claim live-verified against production endpoints this session
- Next.js boot-hook mechanism: HIGH — confirmed against current official docs for the exact installed version (16.3.0)
- Region table (A1) and heading-tolerance constant (A3): MEDIUM/LOW — reasoned proposals consistent with locked decisions, not independently verifiable against an external authoritative source
- PBI→DJT finding: HIGH — directly observed via live query, independently corroborated by a news source

**Research date:** 2026-08-12
**Valid until:** FAA ArcGIS data refreshes on a 28-day AIRAC cycle — treat the exact row counts (516, 6,446) as valid for that window; the PBI→DJT/IATA-cutover timeline is date-sensitive (IATA flip on 2026-08-18) and should be re-checked if implementation happens after that date, since the alias direction may need to reverse or become unnecessary once IATA also completes the switch.
