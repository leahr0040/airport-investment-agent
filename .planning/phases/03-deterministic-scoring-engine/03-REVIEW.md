---
phase: 03-deterministic-scoring-engine
reviewed: 2026-08-13T00:00:00Z
depth: quick
files_reviewed: 8
files_reviewed_list:
  - src/domain/adapters/cache.ts
  - src/domain/adapters/faaFacility.client.single.test.ts
  - src/domain/adapters/faaFacility.client.test.ts
  - src/domain/adapters/faaFacility.client.ts
  - src/domain/adapters/faaFacility.test.ts
  - src/domain/adapters/faaFacility.ts
  - src/domain/scoring/expansionScore.test.ts
  - src/domain/scoring/expansionScore.ts
findings:
  critical: 2
  warning: 4
  info: 2
  total: 8
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-08-13
**Depth:** quick
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Reviewed the FAA facility adapter (client + parsing + cache) and the deterministic
expansion-scoring engine. Two correctness bugs directly corrupt numbers the agent
would state to the analyst — a silent `null → 0` coercion in the FAA facility
parser, and two/three major US **passenger** airlines (Delta, American, and Air
Canada) hard-coded into the "cargo carrier" allowlist used to split volume KPIs.
Both violate this project's explicit core value ("every number must be traceable
to a deterministic computation over real data, with assumptions stated out loud")
because the corruption is silent — no failure reason, no flag, no label — rather
than a labeled assumption. Also found a caching gap that can pin transient FAA
upstream hiccups as a day-long false negative, and an injection-safety invariant
enforced only by a code comment rather than by the client itself.

## Critical Issues

### CR-01: `toFiniteOrNull` silently turns `null` into `0`, not `null`

**File:** `src/domain/adapters/faaFacility.ts:29-32` (used at lines 52-58, 76-77)
**Issue:** `toFiniteOrNull` runs `Number(v)` and returns the result whenever
`Number.isFinite(n)`. `Number(null) === 0`, which is finite — so any ArcGIS field
that is legitimately `null` (a very common way for FAA ArcGIS layers to represent
"no data," e.g. missing `RWY_LEN`, `RWY_WIDTH`, `LAT_DECIMAL`/`LONG_DECIMAL`, or
either runway-end lat/long) is silently reported as the numeric value `0` instead
of `null`. This is indistinguishable from a real measurement of zero, corrupts
`movementsPerRunway`/length-based downstream math, and can place a runway
endpoint at `(0, 0)` (Gulf of Guinea) instead of marking it unknown. It directly
contradicts the field's own type (`number | null`) and the project's "label every
derived/assumed number" requirement — the caller has no way to know the value was
substituted.
**Fix:**
```ts
function toFiniteOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
```

### CR-02: Cargo-carrier allowlist misclassifies major passenger airlines as cargo

**File:** `src/domain/scoring/expansionScore.ts:7`
**Issue:** `CARGO_CALLSIGN_PREFIXES` includes `'DAL'` (Delta Air Lines), `'AAL'`
(American Airlines), and `'ACA'` (Air Canada) — all three are large-scale
**passenger** carriers, not cargo operators. `isCargoCallsign` prefix-matches
against this list, so any Delta/American/Air Canada flight in the movements
window is counted as `cargoMovements` instead of `passengerMovements` in
`computeVolumeKpi`. Since `passengerMovements` feeds directly into the "volume"
KPI (1/3 of the deterministic score, per `SCORING_WEIGHTS`), this systematically
deflates volume — and therefore the final score — for every airport with
meaningful Delta/American/Air Canada traffic (i.e. most major US hubs). This is
the opposite of an edge case: it corrupts the primary business metric the whole
scoring engine exists to produce, for real-world data, silently (no flag,
no "assumed" label). The existing unit test (`expansionScore.test.ts` case group
6) asserts this behavior as intended ("DAL classified as cargo per heuristic"),
so the test suite currently locks in the bug rather than catching it.
**Fix:** Remove `'DAL'`, `'AAL'`, `'ACA'` from `CARGO_CALLSIGN_PREFIXES` (they are
IATA/ICAO-adjacent codes for Delta, American, and Air Canada mainline passenger
service, not their cargo divisions). If freight subsidiaries of these carriers
need representation, use their actual distinct cargo-flight callsign prefixes
instead.

## Warnings

### WR-01: Failure results from `fetchFaaFacility` are cached for the full 24h TTL, including transient upstream glitches

**File:** `src/domain/adapters/faaFacility.ts:39-84` (esp. lines 42, 46, 84 vs. `cache.ts:23-38`)
**Issue:** `withCache` caches whatever the wrapped async function *returns*
(as opposed to throws) for the full `ttlMs`. `fetchFaaFacility` returns
(does not throw) `{ ok: false, reason: 'no_data' }` when `facilityRows.length === 0`,
and `{ ok: false, reason: 'error' }` when the resolved `ARPT_ID` fails
`isValidIata`. Both of these get cached for `FAA_FACILITY_TTL_MS` (24 hours) —
identically to a genuinely non-existent airport. If the zero-row response was a
transient ArcGIS/network hiccup rather than a real "this ICAO doesn't exist,"
every subsequent lookup for that airport silently fails for a full day with no
way to distinguish or force a retry sooner.
**Fix:** Only cache `ok: true` results (or give failure results a much shorter,
separate TTL), e.g.:
```ts
const result = await computeResult();
if (result.ok) cache.set(key, result, { ttl: ttlMs });
return result;
```

### WR-02: ArcGIS `where`-clause injection safety is enforced only by a comment, not by the client

**File:** `src/domain/adapters/faaFacility.client.ts:57-67` (used by `queryFeatures` at lines 24-38, 60, 66)
**Issue:** `fetchFacilityRows`/`fetchRunwayRows` interpolate the caller-supplied
`icao`/`faaLid` directly into an ArcGIS `where` expression
(`` `ICAO_ID='${icao}'` ``, `` `ARPT_ID='${faaLid}'` ``) with **no validation
inside the client**. The only safety net is the comment "Caller must validate
icao format before calling" plus the fact that today's one caller
(`faaFacility.ts`) happens to call `isValidIcao`/`isValidIata` first. CLAUDE.md
explicitly requires allowlist-validation of every user-supplied identifier
"before it reaches an outbound URL" as a non-deferrable guardrail — putting that
invariant behind a comment in a different file means any future caller (or a
refactor that reorders the validation) silently reopens a query-injection vector
into the outbound ArcGIS request.
**Fix:** Validate (or re-validate) the identifier format inside
`FaaFacilityClient` itself before building the `where` clause, so the safety
property holds regardless of caller discipline:
```ts
async fetchFacilityRows(icao: string): Promise<Record<string, unknown>[]> {
  if (!/^[A-Z0-9]{3,4}$/.test(icao)) throw new Error('invalid_icao');
  ...
}
```

### WR-03: `queryFeatures` accesses `body.features` without checking `body` is an object

**File:** `src/domain/adapters/faaFacility.client.ts:48-54`
**Issue:** The `error`-object check on line 49 guards with
`typeof body === 'object'`, but line 54 (`(body.features ?? []).map(...)`) runs
unconditionally afterward with no equivalent guard. If ArcGIS (or an
intermediary proxy/CDN) ever returns a 200 with a non-object body — empty
string, HTML error page, `null` — this throws an unhandled `TypeError` instead
of surfacing a typed `AdapterResult` failure, bypassing the error-handling path
the rest of the adapter is built around.
**Fix:**
```ts
if (!body || typeof body !== 'object') {
  throw Object.assign(new Error('upstream'), { reason: 'error' });
}
```

### WR-04: `computeHeadroomKpi` silently clamps a zero-runway facility to a denominator of 1

**File:** `src/domain/scoring/expansionScore.ts:61-66`
**Issue:** `movementsPerRunway = totalMovements / Math.max(1, runwayCount)`. When
`facility.runways.length === 0` (a facility record exists but `Runways_View`
returned no matching rows), the component is still marked `available: true` and
computed as if the airport had exactly one runway — an unlabeled assumption
substituted directly into a number that flows into the score, with no
`reason`/flag distinguishing it from a real one-runway airport. This runs counter
to the project's "label every assumption" requirement.
**Fix:** Either return `available: false` with a dedicated reason
(`'no_runway_data'`) when `runwayCount === 0`, or keep the computation but expose
it explicitly, e.g. add an `assumed: boolean` field to `HeadroomKpi` set when the
denominator was clamped.

## Info

### IN-01: Duplicate/leftover test file

**File:** `src/domain/adapters/faaFacility.client.single.test.ts`
**Issue:** This file re-tests the same `FaaFacilityClient` behavior already
covered by `faaFacility.client.test.ts` (facility query building, runway query
building) in a condensed form. The `.single` naming and reduced scope suggest a
scratch/debugging file that wasn't removed before commit.
**Fix:** Delete `faaFacility.client.single.test.ts` or fold any genuinely new
assertion into `faaFacility.client.test.ts`.

### IN-02: No test exercises `null`-valued numeric ArcGIS fields

**File:** `src/domain/adapters/faaFacility.test.ts`
**Issue:** All fixtures (`facilityFeature`, `TWO_RUNWAYS`) supply real numbers
for `RWY_LEN`, `RWY_WIDTH`, `LAT_DECIMAL`, etc. There is no case where ArcGIS
returns `null` for one of these fields, which is the exact scenario that would
have caught CR-01 (`toFiniteOrNull(null) === 0`).
**Fix:** Add a fixture/case with `RWY_LEN: null` (and a missing lat/long pair)
and assert the parsed `lengthFt`/`end1` are `null`, not `0`/a zero-coordinate
object.

---

_Reviewed: 2026-08-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
