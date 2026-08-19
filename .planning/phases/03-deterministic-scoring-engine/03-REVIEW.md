---
phase: 03-deterministic-scoring-engine
reviewed: 2026-08-19T00:00:00Z
depth: quick
files_reviewed: 7
files_reviewed_list:
  - src/domain/adapters/faaFacility.ts
  - src/domain/adapters/faaFacility.client.ts
  - src/domain/adapters/faaFacility.test.ts
  - src/domain/adapters/faaFacility.client.test.ts
  - src/domain/scoring/expansionScore.ts
  - src/domain/scoring/expansionScore.test.ts
  - src/domain/scoring/buildScoringInputs.ts
findings:
  critical: 1
  warning: 2
  info: 1
  total: 4
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-08-19
**Depth:** quick
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Fresh review of the FAA facility adapter, the deterministic expansion-scoring
engine, and the new `buildScoringInputs.ts` fan-out helper. Re-derived every
finding from current file contents rather than trusting prior review status.

Of the 8 issues raised in the 2026-08-13 review: **CR-01, WR-01, WR-04, IN-01,
and IN-02 are confirmed fixed** in the current code (verified by reading the
current implementation and the tests that now cover them — `toFiniteOrNull`
null-guards before `Number()`, failure results are thrown so `withCache` never
pins them, zero-runway facilities are routed to `headroom.available: false`,
the duplicate test file is gone, and a null-numeric-field fixture now exists).

**The prior CR-02 (cargo-callsign misclassification of major passenger
carriers) is still present and unfixed** — a "propose fix options" commit exists
in history but was never applied to `CARGO_CALLSIGN_PREFIXES`. This is
re-flagged below as CR-01 since it remains a live Critical defect that corrupts
the primary volume metric for most major US hubs. The prior WR-02 (injection
safety enforced only by comment) and WR-03 (`body.features` accessed without an
object guard) are also both still present in `faaFacility.client.ts`, re-flagged
below as WR-01/WR-02.

`buildScoringInputs.ts` (new since the last review) was checked end-to-end:
all three underlying adapters (`fetchMovements`, `fetchFaaFacility`,
`fetchNasStatus`) internally catch and normalize every failure to a typed
`AdapterResult`, so `Promise.all` in this file cannot reject on a single
airport's upstream failure — no new correctness issue found here.

## Critical Issues

### CR-01: Cargo-carrier allowlist still misclassifies major passenger airlines as cargo (unresolved carryover of prior CR-02)

**File:** `src/domain/scoring/expansionScore.ts:7`
**Issue:** `CARGO_CALLSIGN_PREFIXES` still contains `'ACA'` (Air Canada),
`'DAL'` (Delta Air Lines), and `'AAL'` (American Airlines) — all three are
large-scale **passenger** carriers' standard ICAO callsign prefixes, not cargo
divisions. `isCargoCallsign` prefix-matches against this list, so any
Delta/American/Air Canada flight observed in the movements window is counted
into `cargoMovements` instead of `passengerMovements` in `computeVolumeKpi`.
Since `passengerMovements` feeds directly into the "volume" KPI (1/3 of
`SCORING_WEIGHTS`), this systematically deflates the volume component — and
therefore the final deterministic score — for every airport with meaningful
Delta/American/Air Canada traffic, i.e. most major US hubs. It is silent: no
`reason`, no "assumed" flag, nothing that would let an analyst know a real
passenger flight was reclassified. `expansionScore.test.ts:267-278` (case
group 6) still asserts this behavior as intended ("DAL classified as cargo per
heuristic"), so the test suite currently locks in the bug rather than catching
it. A prior commit (`c310a79`, "propose CR-02 cargo-callsign misclassification
fix options") drafted remediation options but the change was never applied to
`CARGO_CALLSIGN_PREFIXES` itself.
**Fix:** Remove `'ACA'`, `'DAL'`, `'AAL'` from `CARGO_CALLSIGN_PREFIXES` and
update the test fixture accordingly:
```ts
export const CARGO_CALLSIGN_PREFIXES = ['FDX', 'UPS', 'GTI', 'CKS', 'ABX', 'PAC', 'CLX'] as const;
```
If freight subsidiaries of Delta/American/Air Canada need representation, add
their actual distinct cargo-flight callsign prefixes instead of the mainline
passenger codes.

## Warnings

### WR-01: ArcGIS `where`-clause injection safety is enforced only by a comment, not by the client (unresolved carryover of prior WR-02)

**File:** `src/domain/adapters/faaFacility.client.ts:57-67`
**Issue:** `fetchFacilityRows`/`fetchRunwayRows` interpolate the caller-supplied
`icao`/`faaLid` directly into an ArcGIS `where` expression
(`` `ICAO_ID='${icao}'` ``, `` `ARPT_ID='${faaLid}'` ``) with no validation
inside the client itself. The only safety net is the comments ("Caller must
validate icao format before calling") plus the fact that today's one caller
(`faaFacility.ts`) happens to call `isValidIcao`/`isValidIata` first before
each call site. CLAUDE.md explicitly requires allowlist-validation of every
user-supplied identifier "before it reaches an outbound URL" as a
non-deferrable guardrail — keeping that invariant behind a comment in a
different file means any future caller (or a refactor that reorders the
validation) silently reopens a query-injection vector into the outbound
ArcGIS request.
**Fix:** Re-validate the identifier format inside `FaaFacilityClient` itself
before building the `where` clause:
```ts
async fetchFacilityRows(icao: string): Promise<Record<string, unknown>[]> {
  if (!/^[A-Z]{4}$/.test(icao)) throw Object.assign(new Error('invalid_icao'), { reason: 'invalid_input' });
  ...
}
async fetchRunwayRows(faaLid: string): Promise<Record<string, unknown>[]> {
  if (!/^[A-Z]{3}$/.test(faaLid)) throw Object.assign(new Error('invalid_lid'), { reason: 'invalid_input' });
  ...
}
```

### WR-02: `queryFeatures` accesses `body.features` without checking `body` is an object (unresolved carryover of prior WR-03)

**File:** `src/domain/adapters/faaFacility.client.ts:48-54`
**Issue:** The ArcGIS-error-object check on line 49 guards with
`body && typeof body === 'object'`, but the final return on line 54
(`(body.features ?? []).map((f) => f.attributes)`) runs unconditionally
afterward with no equivalent guard. If ArcGIS (or an intermediary proxy/CDN)
ever returns HTTP 200 with `response.data === null` (a `.json()`/axios parse
of a literal `null` body is a real, observed failure mode for some APIs), this
throws an unhandled `TypeError: Cannot read properties of null (reading
'features')` instead of the typed `AdapterResult` failure path the rest of the
adapter is built around. It happens to be caught one level up by
`fetchFaaFacility`'s `try/catch` → `toAdapterFailure`, so it degrades to a
generic `'error'` reason rather than crashing the process — but it bypasses
the client's own typed-failure contract and loses the more specific reason
(`'no_data'` vs `'error'`) an explicit guard would produce.
**Fix:**
```ts
if (!body || typeof body !== 'object') {
  throw Object.assign(new Error('upstream'), { reason: 'error' });
}
```

## Info

### IN-01: Repeated `as any` casts erode the typed-failure contract in `queryFeatures`

**File:** `src/domain/adapters/faaFacility.client.ts:49-51`
**Issue:** `(body as any).error` and `(body as any).error?.message` cast away
the type checker inside the same function that otherwise carefully types
`response.data` as `{ features?: ...; error?: { code?: number; message?: string } }`
two lines above. The cast is unnecessary — `body` is already typed with an
optional `error` field, so `body.error` and `body.error?.message` type-check
without `any`.
**Fix:**
```ts
if (body && typeof body === 'object' && body.error) {
  const errMsg = body.error.message ?? 'ArcGisError';
  throw Object.assign(new Error(errMsg), { reason: 'error' });
}
```

---

_Reviewed: 2026-08-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
