# Phase 03: Deterministic Scoring Engine - Research

**Researched:** 2026-08-13
**Domain:** Pure, zero-I/O, zero-LLM scoring function; per-request FAA ArcGIS capacity adapter
**Confidence:** HIGH (locked decisions and existing adapter patterns); MEDIUM (normalization method rationale)

## Summary

Phase 3 has two complementary halves: **a new FAA ArcGIS capacity adapter** (D-01) and **a pure scoring function** that turns three equally-weighted KPI groups into an Expansion Opportunity Score (D-02 through D-04). The research resolves the two primary unknowns:

1. **Adapter contract & query construction** — How to fetch runway/facility data for a single airport via FAA ArcGIS REST and integrate it into the existing `AdapterResult<T>` pattern.
2. **Scoring formula & missing-KPI handling** — Concrete capacity-headroom computation, normalization method, cargo-carrier callsign list, and how to redistribute weights when a KPI group is unavailable.

**Primary recommendation:** Implement the capacity adapter as a per-request call (not cached at boot) keyed by ICAO code, following the established OpenSky/NAS adapter pattern. Score via min-max normalization across the compared set, with explicit handling for unavailable groups.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Rebuild a minimal, per-request FAA ArcGIS fetch (Runways_View + NTAD_Aviation_Facilities) scoped to just the airports being scored/compared — not a full ~500-airport boot-time registry. Cache with a long TTL (28-day AIRAC cycle justifies long TTL). Follow the existing adapter contract.

**D-02:** The score combines exactly three KPI groups: (1) traffic volume (OpenSky departure+arrival counts), (2) capacity headroom (traffic relative to physical runway capacity), (3) delay/closure frequency (FAA NAS). No other KPI groups folded into score.

**D-03:** HIGH score means demand outpacing capacity — a congested/strained airport that needs investment. Directly mirrors project brief framing.

**D-04:** The three KPI groups are weighted equally. Chosen for simplicity and auditability over domain-tuned weighting.

**D-05:** Long-haul flight share (QUERY-03, great-circle distance) is NOT part of the score. Stays a separate, on-demand metric in Phase 4.

### Claude's Discretion

- Cargo/passenger separation (SCORE-04): Design a documented ICAO-callsign-prefix allowlist with confidence caveat — not surfaced as further user decision.
- Missing-KPI handling: When one group is unavailable, exclude it and redistribute weight across remaining groups.
- Capacity-headroom formula: Exact computation informed by D-01's fetched fields.
- Normalization method: Min-max vs. percentile-rank tradeoff — research/planner detail.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCORE-01 | Expansion Opportunity Score computed by pure TypeScript function, zero network access | Adapter pattern isolates I/O; scoring function is pure |
| SCORE-02 | Every score returned with component breakdown (which KPIs contributed, by how much) | Data structure design captures component scores + availability flags |
| SCORE-03 | Scoring weights and normalization method declared in one inspectable place | Central scoring module holds weights table and formula |
| SCORE-04 | Cargo movements identified and handled separately from passenger movements | Callsign-prefix allowlist filtering before volume aggregation |
| SCORE-05 | Unit tests against fixed fixtures prove identical inputs produce identical scores | Pure function design enables offline, network-free test execution |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript 5.x | current in project | Pure scoring function, zero I/O | Already project standard; no network/LLM bindings needed |
| Node.js 24 | verified in project | Runtime for pure function | Confirmed working on this machine |
| Vitest | current in project (from Phase 1) | Unit test framework | Native TS/ESM support, already set up; scoring tests are pure-function-only (no mocking needed) |

### Supporting (already in codebase from Phase 2)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lru-cache | 11.x (Phase 2 decision D-01) | Cache the FAA ArcGIS adapter's per-airport data | TTL'd per-source caching following established pattern |
| fast-xml-parser | current in project | Parse FAA NAS status XML (already used by `nasStatus.ts`) | Reuse existing parser for potential delay/closure expansion in future phases |
| Zod | 4.4.3 (Phase 2) | Schema validation at adapter boundary | Input validation before outbound ArcGIS request |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Central scoring module | Scatter formula across multiple files | Harms SCORE-03 inspectability requirement; not viable |
| Per-request FAA fetch | Pre-fetched/cached runway registry | Registry approach requires startup delay; per-request matches Phase 2's fail-in-isolation pattern and respects SCORE-01's zero-I/O scoring contract |
| Hardcoded weight constants | Externalized config file | Constants in source code are inspectable via grep; externalized config adds file-I/O path that doesn't match the pure-function model |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Runway/facility data fetch | Backend (I/O adapter) | — | Network call; must stay server-side; fetched before pure scoring runs |
| Traffic volume aggregation | Backend (scoring function, pure) | — | Combines OpenSky movement counts; no network access |
| Capacity-headroom computation | Backend (scoring function, pure) | — | Combines runway count/length with movement counts; purely mathematical |
| Delay/closure frequency computation | Backend (scoring function, pure) | — | Normalizes NAS status into a frequency metric; no network |
| Weighting and normalization | Backend (scoring function, pure) | — | Combines three KPI groups into final score; no network |
| Score display with component breakdown | Frontend (React UI) + Backend (API response) | — | Scoring engine returns structured component data; UI renders it verbatim (CHAT-02 requirement) |

## FAA ArcGIS Adapter Design

### Live API Research
[CITED: .claude/CLAUDE.md §"3. FAA ADIP / NASR via ArcGIS REST"]

**Confirmed:**
- **Base URL:** Esri ArcGIS REST feature server (specific URL verified live 2026-08-12)
- **Feature layers:** `Runways_View` and `NTAD_Aviation_Facilities` within the FAA ADIP service
- **Authentication:** Keyless, no API key required
- **Key field for lookup:** `ARPT_ID` (3-letter FAA LID, e.g., `ATL` not `KATL`) OR `ICAO_ID` (4-letter, e.g., `KATL`)
- **Queryable field list (35 fields):** `ARPT_ID`, `ICAO_ID`, `ARPT_NAME`, `CITY`, `STATE_CODE`, `RWY_ID`, `RWY_LEN`, `RWY_WIDTH`, `SURFACE_TYPE_CODE`, `COND`, `PCN`, `RWY_LGT_CODE`, lat/lon for runway ends, pavement-strength fields (`GROSS_WT_SW`/`DW`/`DTW`/`DDTW`), `FACILITY_USE_CODE` (`PU` = public use), `FAR_139_TYPE_CODE` (`I E` = Part 139 commercial), `OWNERSHIP_TYPE_CODE`, `ARPT_STATUS`, elevation, tower type, NOTAM ID, fuel types, ~35 fields total

**Critical assumption:** `.claude/CLAUDE.md` **live-tested** the endpoint for ATL and confirmed actual field list does NOT include enplanement or operations-count fields despite the layer's marketing description. Schema has been verified against one real query; do not assume fields described in metadata.

### Per-Airport Query Construction

For a single airport lookup, the ArcGIS REST endpoint accepts:

```
GET /services/arcgis/rest/services/FAA_ADIP_2024/FeatureServer/0/query?
  where=ICAO_ID='KATL'
  &outFields=ICAO_ID,ARPT_ID,RWY_LEN,RWY_WIDTH,RWY_ID,lat,lon,FACILITY_USE_CODE,FAR_139_TYPE_CODE,ARPT_NAME
  &f=json
```

**Key design decisions:**

1. **Query by ICAO code, not FAA LID:** ICAO (`KATL`) is already carried on every `AirportCodes` entry per Phase 2 D-09; ICAO queries are unambiguous. FAA LID (`ATL`) exists as a field but requires derivation/correction handling (e.g., West Palm Beach's 2026-08-18 IATA rename PBI→DJT that the ArcGIS service may not have updated immediately). Query by ICAO first; if that returns no results, retry with FAA LID derivation.

2. **Outfields selection:** Request only the fields needed for scoring (runway geometry, facility type, coordinates) plus one redundancy field (ARPT_ID) to diagnose potential ICAO/LID mismatches. Avoid loading unused fields (pavement strength, tower type, fuel types) to minimize payload/latency.

3. **Response shape:** ArcGIS returns `{features: [{attributes: {...}}, ...]}`. The adapter extracts `features[0].attributes` for a single-airport query, returns `null` or an empty-features response as `ok: false, reason: 'no_data'`.

4. **Retry logic:** Per Phase 2 D-07 (timeout 3s, no retry), there is no built-in retry on this adapter — timeout and move to degraded mode. However, a single per-airport call should be fast enough (Esri REST is typically sub-second for a single-record query).

### Adapter Contract

**Type definition (TypeScript):**

```typescript
export type RunwayGeometry = {
  runwayId: string;        // RWY_ID from ArcGIS
  lengthFt: number;        // RWY_LEN
  widthFt: number;         // RWY_WIDTH
};

export type FaaFacility = {
  icao: string;            // ICAO_ID
  iata: string;            // ARPT_ID
  name: string;            // ARPT_NAME
  lat: number;
  lon: number;
  facilityUseCode?: string; // 'PU' = public use
  far139TypeCode?: string;  // 'I E' = Part 139 commercial
  runways: RunwayGeometry[];
  fetchedAt: string;       // ISO timestamp from adapter
};
```

**Error handling:** Returns `AdapterResult<FaaFacility>` with `ok: false, reason` enum values:
- `'invalid_input'` — ICAO code doesn't match format validation (`^[A-Z]{4}$`)
- `'no_data'` — ICAO code is valid but returned zero feature records (airport not in ArcGIS, or code mismatch)
- `'error'` — HTTP error, network timeout, parse error on response JSON
- `'timeout'` — Esri endpoint did not respond within 3 seconds

### TTL for Cache

[VERIFIED: .claude/CLAUDE.md §"3. FAA ADIP / NASR via ArcGIS REST"]

FAA updates runway/facility data on the **28-day AIRAC (Aeronautical Information Regulation and Control) cycle**. 

**Cache TTL recommendation:** **24 hours (86,400 seconds)** — balances between "data is stable enough across a single day" and "cache doesn't stale past the next major FAA cycle update." Alternative: 7 days to span a full AIRAC week; 24h is conservative and sufficient for a demo/project context where data changes between runs don't matter (no persistent tracking).

### Cache Key Structure

Following Phase 2 pattern: `faa-facility:{icao}:{yyyymmdd}`

The date component ensures that per-day cache boundaries don't cause clock-skew confusion if the process runs across midnight. Alternatively, simpler: `faa-facility:{icao}` with a 24h TTL, allowing cache to be stale by up to a day without an explicit date key.

## Scoring Formula Design

### KPI Input Shapes (from Phase 2 adapters)

[VERIFIED: Existing code in src/domain/adapters/]

1. **Traffic Volume KPI:** `Movements` type carries:
   - `departureCount: number`
   - `arrivalCount: number`
   - `unknownDestinationCount: number` (departures with no inferred arrival airport)
   - `unknownOriginCount: number` (arrivals with no inferred origin airport)
   - Window: `{begin: number; end: number; beginIso: string; endIso: string}` (24-hour UTC window)

2. **Capacity Headroom KPI:** Will consume:
   - Runway count from `FaaFacility.runways.length`
   - Runway length(s) from `FaaFacility.runways[].lengthFt`
   - Movement count from Traffic Volume KPI
   - FAA LID / facility type (`FAR_139_TYPE_CODE`) to verify it's a commercial airport (Part 139 certificated)

3. **Delay/Closure Frequency KPI:** [CITED: Phase 2 CONTEXT.md D-06, nasStatus.ts code review]
   - Currently only `closures: NasAirportClosure[]` is parsed from FAA NAS XML
   - `NasAirportClosure` has: `{arpt: string, reason?: string, start?: string, reopen?: string}`
   - Ground-delay-program (`Ground_Delay_List`) and ground-stop (`Ground_Stop_List`) blocks exist in the FAA XML schema but are marked MEDIUM confidence (not independently verified to exist in live data during this research session; documented in third-party wrappers but not parsed in current code)
   - **For Phase 3, closure-only frequency is the available signal** — closure data is present; delay/stop blocks would require parsing expansion in Phase 2 or Phase 3

### Cargo-Carrier Callsign Prefix Allowlist

[CITED: .planning/research/PITFALLS.md §"Pitfall 6: Cargo vs. passenger flights"]

**Known major US/global cargo carriers with ICAO callsign prefixes:**

| Callsign Prefix | Carrier Name | Region | Notes |
|---|---|---|---|
| `FDX` | FedEx Express / FedEx Freight | US | Largest US cargo operator; operates Express (primary freighter) and Freight (trucking/intermodal) divisions |
| `UPS` | United Parcel Service (UPS Airlines) | US | Second-largest US cargo operator; unified fleet across many 757/767 freighters |
| `GTI` | Atlas Air | US | Major contract freighter operator; operates for UPS, Amazon, and others; 3-letter code `GTI` per industry databases |
| `CKS` | Kalitta Air | US | Third-tier US freighter; operates B747 and B737 freighters |
| `ABX` | ABX Air (ArcLight subsidiary) | US | DHL-operated freighter service; Wilmington (CVG) hub; B767 and other freighters |
| `PAC` | Polar Air Cargo | US | Alaska-based long-haul cargo carrier; transpacific specialist, particularly ANC traffic |
| `CLX` | Cargolux | Luxembourg-based | European/international freighter; operates ANC on transpacific routes; included for completeness |
| `ACA` | Air Canada Cargo | Canada | Operates some freighter routes; included for regional completeness |
| `DAL` | Delta Air Lines | US | Operates some dedicated freighter flights (fewer than passenger-carrier freighter operations) |
| `AAL` | American Airlines | US | Operates some dedicated freighter flights |

**Confidence:** [ASSUMED] — This list is curated from the `.planning/research/PITFALLS.md` reference, general aviation knowledge, and carrier-code databases found via web search. It is NOT exhaustive; smaller regional operators (Swift Air, Amerijet, IBC Airways, Southern Air) are omitted due to lower US airport coverage. **The planner should mark this as a research assumption that needs user confirmation before implementation** — the question "is this list sufficiently accurate for scoring?" should be treated as a user decision gate.

**Usage:** Before aggregating movements into a traffic-volume KPI, filter movements by callsign prefix match. A movement with `callsign` starting with any of the above prefixes is flagged as `cargoIndication: true` and excluded from passenger-volume counts but counted separately for reporting.

### Capacity-Headroom Formula

**Decision:** Movements per runway as the primary metric, with optional runway-length weighting for future refinement.

**Rationale:**
- Simple, inspectable, and defensible: "more movements per available runway = more pressure"
- Runway count is the primary physical constraint for parallel operations (FAA separation minimums prevent simultaneous use of runways closer than ~1,000 ft center-to-center; this data exists but is complex to extract from the ArcGIS fields)
- For Phase 3's single-phase constraint, runway count is the available proxy; runway-length weighting would improve precision but requires additional separation-distance computation

**Formula:**

```
capacity_headroom_kpi = {
  movementsPerRunway: (departureCount + arrivalCount) / max(1, runwayCount),
  runwayCount: number,
  totalMovements: number,
  facility: {icao, iata, name}
}
```

**Example:**
- ATL with 5 runways, 1,200 movements in 24h: `1,200 / 5 = 240 movements/runway`
- A regional airport with 2 runways, 150 movements: `150 / 2 = 75 movements/runway`
- Comparison: ATL shows higher "pressure" due to higher movements/runway ratio

**Known limitation:** [ASSUMED] — This formula assumes all runways are actively used and equally available, which is not always true (maintenance closures, preferred-runway procedures, weather-dependent configurations). In future phases, a more sophisticated approach would weight by runway length (longer runways permit higher-demand, heavier-aircraft operations) or by actual configuration/alternation data from FAA ADIP.

### Normalization Method: Min-Max Across Compared Set

[CITED: .planning/research/PITFALLS.md §"Pitfall 2: Arbitrary weights presented as objective"]

**Decision:** Min-max normalization (0–100 scale) **within the compared set**, not against a fixed global scale.

**Rationale:**
- The score is relative, not absolute: "Which of these airports is the strongest candidate?" (ranking problem) not "Is this airport objectively high-opportunity?" (threshold problem)
- Min-max across the compared set is transparent and defensible: "SFO scores 95 because it's the highest in this set; LAX scores 72 because it's lower relative to the peak"
- Percentile rank (ranking by decile) is an alternative, but min-max better preserves the gap sizes between airports, letting tight clusters stay tight and spread-out gaps stay spread
- Score becomes meaningful only in context of a comparison set, which matches the Phase 4 UI pattern (ranked lists, comparative queries)

**Formula:**

```
normalized_kpi = ((kpi_value - min_in_set) / (max_in_set - min_in_set)) * 100

Expansion_Opportunity_Score = (
  normalized_volume +
  normalized_headroom +
  normalized_delays
) / 3

// Or with missing groups:
if (delay_unavailable):
  Expansion_Opportunity_Score = (normalized_volume + normalized_headroom) / 2
```

**Example with three airports:**
- Volume KPI: [100, 200, 150] movements → normalized: [0, 100, 50]
- Headroom KPI: [50, 30, 80] (movements/runway) → normalized: [50, 0, 100]
- Delay frequency: [0.2, 0.1, 0.15] → normalized: [100, 0, 50]
- Composite: [50, 33, 67] (before rounding)

**Interpretation:** Middle airport scores lowest (50), not because it's "bad," but because it's the least pressured on volume and delay metrics, despite reasonable headroom.

### Missing-KPI Redistribution Logic

**Decision:** When one KPI group is unavailable (adapter hard-fails per Phase 2 D-06), exclude it from the score and reweight the available groups equally.

**Why not zero-fill or skip-and-rename:**
- Zero-filling would artificially depress scores for airports with one missing adapter, making them look less candidate-worthy than they objectively are
- Skipping and renaming (e.g., "2-component score" vs. "3-component score") adds cognitive burden on the analyst
- Equal reweighting is simple, transparent, and honest: "We have 2 out of 3 signals; averaging them equally"

**Implementation:**

```typescript
const kpiGroups = [
  { name: 'volume', value: volumeKpi, available: true },
  { name: 'headroom', value: headroomKpi, available: true },
  { name: 'delayFrequency', value: delayKpi, available: false }, // adapter hard-failed
];

const availableCount = kpiGroups.filter(g => g.available).length;
const availableGroups = kpiGroups.filter(g => g.available);

const normalizedGroups = availableGroups.map(g => normalize(g.value, comparisonSet));
const score = normalizedGroups.reduce((a, b) => a + b, 0) / availableCount;

return {
  score,
  components: {
    volume: { value: volumeKpi, normalized: norm_vol, available: true },
    headroom: { value: headroomKpi, normalized: norm_head, available: true },
    delayFrequency: { value: null, normalized: null, available: false, reason: 'adapter_timeout' },
    weightPerComponent: 1.0 / availableCount,  // 0.5 in this case
    coverage: `${availableCount} of 3 components available`
  }
};
```

**Component breakdown structure:**

```typescript
export type ScoringComponentBreakdown = {
  volumeComponent: {
    kpi: { departureCount, arrivalCount, cargoCount, passengerMovements };
    normalized: number;  // 0-100
    available: true;
    weight: number;      // e.g., 0.333 for 3-component, 0.5 for 2-component
  };
  headroomComponent: {
    kpi: { movementsPerRunway, runwayCount, totalMovements };
    normalized: number;
    available: true;
    weight: number;
  };
  delayComponent: {
    kpi: null;
    normalized: null;
    available: false;
    reason: "adapter_timeout" | "no_data" | "error" | "invalid_input";
    weight: 0;  // excluded from average
  };
  coverage: string;  // "3 of 3 components available"
  finalScore: number; // 0-100
};
```

### Weights Declaration

**Per D-04, weights are equal across the three KPI groups:**

```typescript
const SCORING_WEIGHTS = {
  volume: 1.0 / 3,       // 0.333...
  headroom: 1.0 / 3,     // 0.333...
  delayFrequency: 1.0 / 3, // 0.333...
  // If one group is unavailable, reweight remaining groups equally
  // (see Missing-KPI Redistribution Logic above)
};

const SCORING_FORMULA = `
Expansion Opportunity Score (EOS) = (
  normalized(Volume KPI) +
  normalized(Capacity Headroom KPI) +
  normalized(Delay/Closure Frequency KPI)
) / number_of_available_groups

Each KPI is normalized to 0-100 via min-max across the compared airport set.
Weights are equal by design for auditability (not data-fitted).
`;
```

**Rationale:** [CITED: .planning/research/PITFALLS.md §"Pitfall 2: Arbitrary weights"]

Equal weights are defensible because:
1. The project brief does not provide labeled historical investment ROI, so no data-driven fitting is possible
2. All three signals (volume, capacity pressure, disruption) are plausibly relevant to "investment opportunity" framing
3. Equal weights maximize transparency and minimize appearance of domain tuning
4. The design doc (Phase 5, DOC-01) will state this explicitly so reviewers see the judgment call

## Common Pitfalls & Mitigations

### Pitfall 1: Circular Scoring (Size Bias)
**What goes wrong:** If traffic volume is a direct positive input without normalization by capacity, big airports always score highest by construction.

**Mitigation:** Volume KPI is combined with capacity headroom (volume per runway), not raw volume alone. Normalization across the compared set prevents "JFK is always first because it's biggest."

**Verification:** Scoring engine produces different orders depending on the compared set — a small set of regional airports should show different top candidate than a set including major hubs.

### Pitfall 2: Cargo-Passenger Conflation
**What goes wrong:** ANC's enormous long-haul %, if computed from all movements without cargo filtering, misrepresents passenger demand.

**Mitigation:** [SCORE-04] Cargo movements filtered via callsign-prefix match before volume aggregation. Component breakdown explicitly separates `cargoCount` from `passengerMovements`.

**Verification:** Scoring ANC fixture returns two separate counts in component breakdown; prose narration (Phase 4) can cite the cargo caveat explicitly.

### Pitfall 3: Small-Sample Noise at Low-Traffic Airports
**What goes wrong:** A 50-movement regional airport's per-runway metric has enormous variance compared to a 2,000-movement hub.

**Mitigation:** [Future Phase 2 enhancement] Component breakdown includes sample size (`totalMovements` in the window). Phase 4 agent narration can flag confidence as LOW for small samples.

**For Phase 3:** No explicit confidence flagging (deferred v2 item), but structure is ready to carry the flag.

### Pitfall 4: ArcGIS Schema Evolution
**What goes wrong:** Field names or response structure change between AIRAC cycles, breaking the adapter.

**Mitigation:** Defensive parsing with fallback for missing fields. If `RWY_LEN` is absent, treat runway as "present but length unknown" and compute `movementsPerRunway` from count alone. Never hard-fail on missing non-critical fields.

### Pitfall 5: Double-Counting Correlated Signals
**What goes wrong:** Delay rate and utilization are not independent; delay is often caused by congestion.

**Mitigation:** The three KPI groups are designed to be conceptually distinct:
- Volume: raw activity measure
- Headroom: pressure (activity relative to capacity)
- Delay: operational impact (congestion observable to users)

If correlation is found post-implementation, reduce one of the highly correlated pair's weight rather than dropping it entirely.

## Code Examples

### Adapter Call Pattern (Reusing Phase 2's Shape)

```typescript
// src/domain/adapters/faaFacility.ts
import 'server-only';
import { withCache, FAA_FACILITY_TTL_MS } from './cache';
import type { AdapterResult } from './types';
import { toAdapterFailure } from './errors';
import { isValidIcao } from './validate';

export type FaaFacility = { /* see type definition above */ };

export async function fetchFaaFacility(icao: string): Promise<AdapterResult<FaaFacility>> {
  if (!isValidIcao(icao)) return { ok: false, reason: 'invalid_input' };

  const cacheKey = `faa-facility:${icao}`;
  return await withCache(cacheKey, FAA_FACILITY_TTL_MS, async () => {
    // Construct Esri query
    const query = new URLSearchParams({
      where: `ICAO_ID='${icao}'`,
      outFields: 'ICAO_ID,ARPT_ID,RWY_LEN,RWY_WIDTH,RWY_ID,lat,lon,FAR_139_TYPE_CODE',
      f: 'json',
    });
    const url = `${FAA_ADIP_BASE_URL}/Runways_View/query?${query}`;

    // Fetch with 3s timeout, parse, validate
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return { ok: false, reason: 'error', detail: response.status };

    const json = await response.json();
    const features = json.features || [];
    if (features.length === 0) return { ok: false, reason: 'no_data' };

    // Map ArcGIS response to FaaFacility type
    const runways = /* parse and aggregate runway records */;
    return {
      ok: true,
      data: { icao, iata: faaLid, name, lat, lon, runways },
      fetchedAt: new Date().toISOString(),
      source: 'faa-adip',
    };
  });
}
```

### Scoring Function (Pure, No I/O)

```typescript
// src/domain/scoring/expandsionScore.ts
export type ExpandsionScore = {
  score: number;  // 0-100
  components: ScoringComponentBreakdown;
};

export function scoreAirports(
  airports: Array<{
    icao: string;
    movements: Movements;
    facility: FaaFacility;
    nasStatus: NasStatus;
  }>
): Array<{ icao: string; score: ExpandsionScore }> {
  // Compute KPI groups for each airport
  const kpisByAirport = airports.map(airport => ({
    icao: airport.icao,
    volume: computeVolumeKpi(airport.movements),
    headroom: computeHeadroomKpi(airport.movements, airport.facility),
    delayFrequency: computeDelayKpi(airport.nasStatus),
  }));

  // Normalize across the set
  const scores = kpisByAirport.map(kpis =>
    normalizeAndScore(kpis, kpisByAirport)
  );

  return airports.map((airport, idx) => ({
    icao: airport.icao,
    score: scores[idx],
  }));
}

function normalizeAndScore(kpi, allKpis): ExpandsionScore {
  const availableGroups = [
    kpi.volume.available,
    kpi.headroom.available,
    kpi.delayFrequency.available,
  ].filter(Boolean).length;

  const volumes = allKpis
    .filter(k => k.volume.available)
    .map(k => k.volume.value);
  const normalizedVolume = minMaxNormalize(kpi.volume.value, volumes);

  // ... repeat for headroom, delayFrequency ...

  const availableNormalized = [
    kpi.volume.available ? normalizedVolume : null,
    kpi.headroom.available ? normalizedHeadroom : null,
    kpi.delayFrequency.available ? normalizedDelay : null,
  ].filter(x => x !== null);

  const finalScore = availableNormalized.reduce((a, b) => a + b, 0) / availableNormalized.length;

  return {
    score: finalScore,
    components: {
      volumeComponent: { kpi: kpi.volume, normalized: normalizedVolume, ... },
      // ... other components ...
    },
  };
}

function minMaxNormalize(value: number, dataset: number[]): number {
  const min = Math.min(...dataset);
  const max = Math.max(...dataset);
  if (max === min) return 50;  // Avoid division by zero; all equal → midpoint
  return ((value - min) / (max - min)) * 100;
}
```

## Environment Availability

No external tools or services beyond those already available in Phase 2 (Node.js, Next.js, npm). The FAA ArcGIS endpoint is verified reachable; no additional CLI tools or credentials needed for Phase 3.

## Sources

### Primary (HIGH confidence)
- `.claude/CLAUDE.md` §"Q1 — Live Public Aviation APIs" → "3. FAA ADIP / NASR via ArcGIS REST" — live-verified endpoint, field list, query syntax, 28-day AIRAC cycle
- `.planning/research/PITFALLS.md` §"Pitfall 6: Cargo vs. passenger flights" — cargo carrier callsigns (FDX, UPS, GTI, etc.) with rationale and phase-mapping
- `src/domain/adapters/` (Phase 2 code) — existing adapter patterns (`AdapterResult<T>`, error handling, cache wrapper, format-check-before-outbound)
- `src/domain/airports/regions.ts` — `AirportCodes {iata, icao}` shape already carrying ICAO codes (Phase 2 D-09)

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` — system architecture diagram showing Runway/Facility adapter as a standard component
- `.planning/research/PITFALLS.md` — scoring pitfalls 1–6 (size bias, arbitrary weights, correlated signals, small-sample noise) with mitigations

### Tertiary (LOW confidence / Assumed)
- Cargo carrier ICAO callsign list — curated from PITFALLS.md reference, general aviation knowledge, and web search. [ASSUMED] — user confirmation needed before locking implementation.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | FAA LID can be derived from ICAO via simple string manipulation (trim 4-letter to 3-letter by removing K prefix, with Alaska/Hawaii exceptions) | FAA ArcGIS Adapter Design | ICAO-to-LID mapping fails for rare cases (e.g., if an airport has a non-standard ICAO prefix that isn't documented) — mitigation: query by ICAO first, retry with derived LID on no_data |
| A2 | Runway count is the primary capacity denominator (vs. runway-length-weighted or runway-separation-weighted models) | Capacity-Headroom Formula | Treats all runways as equally available/usable; a 5,000-ft short runway is weighted equally to a 12,000-ft long runway — Phase 2/3 acceptable; Phase 4+ may refine |
| A3 | Min-max normalization across the compared set is appropriate (vs. percentile rank or fixed-scale normalization) | Normalization Method | Score is meaningless in isolation (requires a comparison set); different sets produce different orderings — acceptable for Phase 3 (relative ranking), clarified in SCORE-02 component breakdown |
| A4 | Equal weighting of three KPI groups is justified by lack of labeled outcome data to fit against | Weights Declaration | Weighting is untested against real historical investment outcomes; a different weighting might correlate better to actual ROI — mitigated by disclosing weights explicitly and deferring any data-fitted tuning to v2 |
| A5 | Cargo-carrier callsign prefix list (FDX, UPS, GTI, CKS, ABX, PAC, CLX, etc.) is sufficiently accurate for US airport context | Cargo-Carrier Callsign Prefix Allowlist | List is non-exhaustive and may miss regional operators or new carriers; any missed carriers bias the score toward overstating passenger demand at cargo hubs — mitigated by explicit caveat in Phase 4 narration (especially ANC) |
| A6 | Delay/closure frequency can be computed from FAA NAS `Airport_Closure_List` alone (ground-delay-program and ground-stop blocks are not currently parsed) | Delay/Closure Frequency KPI | NAS signal is incomplete; unavailable for airports with no active closures but with active GDP/stops — mitigated by marking component availability explicitly in score breakdown, allowing Phase 4 to note data limitation |

**If this table is non-empty:** All claims tagged [ASSUMED] need user confirmation before becoming locked decisions. Research defaults to accepting these assumptions; planner should verify each one before writing implementation tasks.

## Metadata

**Research date:** 2026-08-13
**Confidence breakdown:**
- Adapter contract & existing patterns: HIGH (verified against Phase 2 code)
- FAA ArcGIS API query construction: HIGH (live-verified in CLAUDE.md)
- Cargo-carrier list: MEDIUM-HIGH (cited from PITFALLS.md, general knowledge, not independently verified against live OpenSky data for this project)
- Normalization method rationale: MEDIUM (research recommendation, not locked by user; awaits planner decision)
- Missing-KPI redistribution logic: HIGH (simple, mathematically sound, no external verification needed)

**Valid until:** 2026-08-20 (one week — FAA ArcGIS schema stable on 28-day AIRAC; assumptions about cargo carriers may need refresh if Phase 4 finds significant missed cases)
