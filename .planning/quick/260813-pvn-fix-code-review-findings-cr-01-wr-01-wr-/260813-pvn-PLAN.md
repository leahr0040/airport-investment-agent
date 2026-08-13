---
phase: quick-260813-pvn
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/domain/adapters/faaFacility.ts
  - src/domain/adapters/faaFacility.test.ts
  - src/domain/adapters/faaFacility.client.single.test.ts
  - src/domain/scoring/expansionScore.ts
  - src/domain/scoring/expansionScore.test.ts
  - .planning/quick/260813-pvn-fix-code-review-findings-cr-01-wr-01-wr-/260813-pvn-CR-02-OPTIONS.md
autonomous: true
requirements: [CR-01, WR-01, WR-04, IN-01, IN-02]

must_haves:
  truths:
    - "A FAA ArcGIS facility/runway row with a null, undefined, or empty-string numeric field parses to null in FaaFacility/RunwayGeometry, never to 0 or a fabricated {lat:0, lon:0} coordinate."
    - "A failed fetchFaaFacility lookup (no_data or an invalid upstream ARPT_ID) is retried on the network on the very next call for the same airport, instead of being served a stale cached failure for up to 24 hours."
    - "A facility with zero runway rows produces a headroom KPI component explicitly marked available: false with a stated reason, instead of a number silently computed against a denominator of 1."
    - "src/domain/adapters/faaFacility.client.single.test.ts no longer exists, and its query-building coverage remains fully exercised by faaFacility.client.test.ts."
    - "npx vitest run src/domain/adapters src/domain/scoring exits 0, including the new regression tests for CR-01, WR-01, and WR-04."
    - "CARGO_CALLSIGN_PREFIXES and isCargoCallsign in expansionScore.ts are byte-for-byte unchanged, and a written document lists 2-3 concrete fix options for CR-02 for the user to choose from."
  artifacts:
    - "src/domain/adapters/faaFacility.ts — toFiniteOrNull (null-safe), fetchFaaFacility (throw-not-return on cache-body failures)"
    - "src/domain/adapters/faaFacility.test.ts — null-numeric-field regression test, failure-not-cached regression test"
    - "src/domain/scoring/expansionScore.ts — scoreAirports headroom-availability gate on runways.length > 0"
    - "src/domain/scoring/expansionScore.test.ts — zero-runway headroom-unavailable regression test"
    - ".planning/quick/260813-pvn-fix-code-review-findings-cr-01-wr-01-wr-/260813-pvn-CR-02-OPTIONS.md — 2-3 proposed CR-02 fix options with a labeled recommendation"
  key_links:
    - "faaFacility.ts's withCache callback now throws (rather than returns) on both ok:false paths inside it, so cache.ts's existing await fn() -> cache.set sequence in withCache naturally skips caching failures — the fix depends on cache.ts's untouched throw-skips-set behavior, not a new cache.ts feature, and cache.ts is not modified by this plan."
    - "scoreAirports's headroom-availability check now gates on facility.data.runways.length > 0 in addition to movements.ok && facility.ok, so computeHeadroomKpi is never invoked with a zero-length runways array — the fix depends on this precondition holding at every call site of computeHeadroomKpi in this file."
---

<objective>
Fix five confirmed findings from the Phase 3 code review (`.planning/phases/03-deterministic-scoring-engine/03-REVIEW.md`) in `src/domain/adapters/faaFacility.ts` and `src/domain/scoring/expansionScore.ts`: CR-01 (silent null-to-0 coercion), WR-01 (failure results cached for the full 24h TTL), WR-04 (silent zero-runway denominator clamp), IN-01 (duplicate test file), and IN-02 (missing null-field regression test). Each code fix ships with its own regression test. CR-02 (the `CARGO_CALLSIGN_PREFIXES` passenger/cargo misclassification bug) is explicitly excluded from any code change — instead, the final task produces a written options document for the user to review and decide on separately.

Purpose: CR-01, WR-01, and WR-04 are silent-corruption / silent-assumption bugs that directly violate this project's core value ("every number the agent states must be traceable to a deterministic computation over real data, with its assumptions and uncertainty stated out loud" — CLAUDE.md). IN-01/IN-02 are test-suite hygiene and the missing regression coverage that would have caught CR-01. CR-02 needs a decision (which carrier-data tradeoff to accept), not just an implementation, so it is deliberately routed to a proposal instead of code.

Output: Modified `faaFacility.ts`/`faaFacility.test.ts`, modified `expansionScore.ts`/`expansionScore.test.ts`, `faaFacility.client.single.test.ts` deleted, and a new `260813-pvn-CR-02-OPTIONS.md` — `npx vitest run src/domain/adapters src/domain/scoring` passing throughout, with `CARGO_CALLSIGN_PREFIXES`/`isCargoCallsign`/`computeVolumeKpi` byte-for-byte unchanged.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/03-deterministic-scoring-engine/03-REVIEW.md
@src/domain/adapters/faaFacility.ts
@src/domain/adapters/cache.ts
@src/domain/scoring/expansionScore.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fix CR-01 (null-safe ArcGIS numeric parsing) with IN-02 regression test</name>
  <files>src/domain/adapters/faaFacility.ts, src/domain/adapters/faaFacility.test.ts</files>
  <read_first>
    - .planning/phases/03-deterministic-scoring-engine/03-REVIEW.md lines 46-67 (CR-01) and lines 182-191 (IN-02)
  </read_first>
  <behavior>
    - toFiniteOrNull(null), toFiniteOrNull(undefined), and toFiniteOrNull('') all return null.
    - toFiniteOrNull still returns the coerced number for genuinely numeric-coercible values, unchanged.
    - A facility/runway row with null-valued numeric ArcGIS fields parses to a FaaFacility/RunwayGeometry with those fields as null, not 0 or a zero-coordinate object.
  </behavior>
  <action>
Per CR-01, rewrite `toFiniteOrNull` in `src/domain/adapters/faaFacility.ts` (currently lines 29-32) to return `null` immediately when its input `v` is `null`, `undefined`, or the empty string `''`, before ever calling `Number(v)` — only a genuinely numeric-coercible value should reach the existing `Number.isFinite(n) ? n : null` check. This closes the bug where `Number(null) === 0` was silently treated as a real zero-length runway or a real `(0, 0)` coordinate. Do not change any of `toFiniteOrNull`'s six call sites (`RWY_LEN`, `RWY_WIDTH`, the four lat/lon fields) — the fix is entirely inside the helper.

Per IN-02, add a new `it` block to `src/domain/adapters/faaFacility.test.ts` — this is the direct regression test for the CR-01 fix. Using the existing `facilityFeature(overrides)` helper, build a facility feature with `LAT_DECIMAL: null` and `LONG_DECIMAL: null` overrides. Using the existing `runwayFeatures(rows)` helper, build a single runway row with `RWY_LEN: null`, `RWY_WIDTH: undefined`, `LAT1_DECIMAL: null`, `LONG1_DECIMAL: null`, `LAT2_DECIMAL: undefined`, `LONG2_DECIMAL: undefined` (covering both `null` and `undefined` inputs, and an endpoint whose lat/lon pair is entirely missing). Mock both axios GETs (facility then runway) with these fixtures, call `fetchFaaFacility('KATL')`, and assert: `res.data.lat` and `res.data.lon` are `null` (not `0`); `res.data.runways[0].lengthFt` and `.widthFt` are `null` (not `0`); `res.data.runways[0].end1` and `.end2` are `null` (not a `{lat:0, lon:0}` object).
  </action>
  <verify>
    <automated>npx vitest run src/domain/adapters/faaFacility.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run src/domain/adapters/faaFacility.test.ts` exits 0, including the new null-fixture test.
    - `grep -n "v === null || v === undefined || v === ''" src/domain/adapters/faaFacility.ts` returns at least 1 match — the explicit early-return guard is present in `toFiniteOrNull`.
    - `grep -c "RWY_LEN: null" src/domain/adapters/faaFacility.test.ts` returns at least 1 — the null-fixture regression test is present.
  </acceptance_criteria>
  <done>toFiniteOrNull(null), toFiniteOrNull(undefined), and toFiniteOrNull('') all return null instead of 0; the new null-fixture test in faaFacility.test.ts passes; all pre-existing tests in the file continue to pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Fix WR-01 (stop caching failure results for the full TTL) with regression test</name>
  <files>src/domain/adapters/faaFacility.ts, src/domain/adapters/faaFacility.test.ts</files>
  <read_first>
    - .planning/phases/03-deterministic-scoring-engine/03-REVIEW.md lines 94-113 (WR-01)
    - src/domain/adapters/cache.ts (withCache — note cache.set is only reached on the line after `await fn()` resolves; a rejected fn() never reaches it)
    - src/domain/adapters/errors.ts (toAdapterFailure — reads err.reason off a thrown Error to rebuild the AdapterResult)
  </read_first>
  <behavior>
    - Two consecutive fetchFaaFacility calls for an ICAO that yields no_data (or an invalid upstream ARPT_ID) both issue a network call — the failure is never served from cache.
    - Two consecutive fetchFaaFacility calls for an ICAO that succeeds issue the network calls only once — the ok:true result is still cached and served normally.
  </behavior>
  <action>
Per WR-01, stop returning `{ ok: false, reason: 'no_data' }` and `{ ok: false, reason: 'error' }` directly from inside the `withCache` callback body in `fetchFaaFacility` (`src/domain/adapters/faaFacility.ts`, currently around lines 42 and 46) — a normal return value there is exactly what `cache.ts`'s `withCache` caches for the full `FAA_FACILITY_TTL_MS` (24h), which is why a transient failure currently gets pinned as long as a real success. Instead, THROW at both of those two points: add a small local helper (e.g. `failWith(reason: AdapterFailReason): never`) that does `throw Object.assign(new Error(reason), { reason })`, called with `'no_data'` where `facilityRows.length === 0` and with `'error'` where `isValidIata(rawArpt)` is false. Import `AdapterFailReason` alongside the existing `AdapterResult` import from `./types`.

Because `cache.ts`'s `withCache` only calls `cache.set` on the line immediately AFTER `await fn()` resolves (never reached when `fn()` rejects), a thrown failure is never written to the cache — this makes the fix live entirely in `faaFacility.ts`'s calling code, with `cache.ts` completely untouched, per WR-01's stated preference for adjusting the caller over the generic cache utility. The existing outer `try { ... } catch (err: unknown) { return toAdapterFailure(err, 'faa-adip'); }` in `fetchFaaFacility` already converts a thrown `{reason}`-carrying `Error` back into the correct `AdapterResult` shape (`toAdapterFailure` reads `err.reason`), so callers see the same `{ ok: false, reason: 'no_data' }` / `{ ok: false, reason: 'error' }` shape as before, now also carrying a `detail` string (harmless — existing tests assert with `toMatchObject`, which ignores extra fields). Leave the pre-cache `if (!isValidIcao(icao)) return { ok: false, reason: 'invalid_input' };` early return (before `withCache` is even called) exactly as it is — it was never part of this bug. The successful `{ ok: true, ... }` return at the end of the callback is unchanged and continues to be cached normally.

Add a regression test to `src/domain/adapters/faaFacility.test.ts` proving the fix: queue TWO `{ features: [] }` (empty) axios responses for the SAME ICAO, call `fetchFaaFacility('KXXX')` twice in sequence, and assert `mockedAxios.get` was called twice (not once) — proving the `no_data` result was not served from cache on the second call. In the same test (or an adjacent one), reuse the happy-path fixtures (`facilityFeature()` + `TWO_RUNWAYS`) to call `fetchFaaFacility('KATL')` twice and assert `mockedAxios.get` was called exactly twice total across those two calls (one facility + one runway GET, not four) — proving a genuine `ok:true` success is still served from cache on the second call.
  </action>
  <verify>
    <automated>npx vitest run src/domain/adapters/faaFacility.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "throw Object.assign" src/domain/adapters/faaFacility.ts` returns at least 2 — both in-cache-body failure branches throw rather than return.
    - `grep -c "return { ok: false" src/domain/adapters/faaFacility.ts` returns 1 — only the pre-`withCache` `invalid_input` check still returns a failure object directly.
    - `grep -c "toHaveBeenCalledTimes(2)" src/domain/adapters/faaFacility.test.ts` returns at least 1 — the not-cached-on-failure regression assertion is present.
  </acceptance_criteria>
  <done>A no_data/error result from fetchFaaFacility is never served from cache — two consecutive lookups for the same non-existent/invalid airport both hit the network; a genuine ok:true result is still cached and served without a second network call. All pre-existing tests in faaFacility.test.ts continue to pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Fix WR-04 (explicit zero-runway headroom unavailability) with regression test</name>
  <files>src/domain/scoring/expansionScore.ts, src/domain/scoring/expansionScore.test.ts</files>
  <read_first>
    - .planning/phases/03-deterministic-scoring-engine/03-REVIEW.md lines 155-168 (WR-04)
  </read_first>
  <behavior>
    - computeHeadroomKpi is never invoked when facility.runways.length === 0.
    - A facility with zero runway rows produces components.headroom.available === false with reason 'no_data', not a movementsPerRunway computed against a denominator clamped to 1.
    - Existing non-zero-runway behavior (case groups 1, 2, 3, 5, 6) is unchanged.
  </behavior>
  <action>
Per WR-04, stop calling `computeHeadroomKpi` when a facility has zero runway rows, so its `movementsPerRunway = totalMovements / Math.max(1, runwayCount)` denominator-clamp (`expansionScore.ts`, currently lines 61-66) is never exercised with `runwayCount === 0` and can no longer silently stand in for a real one-runway airport. In `scoreAirports`'s `tmp` computation (currently around lines 89-97), change the ternary that decides `head` from `input.movements.ok && input.facility.ok ? computeHeadroomKpi(...) : null` to additionally require `input.facility.data.runways.length > 0`. When a facility is `ok:true` but has zero runway rows, `head` now stays `null`, which routes headroom into the SAME `available: false` branch (`ComponentResult`'s existing unavailable shape) already used elsewhere in this file for a failed movements/facility fetch — do not add any new field or type; reuse the existing `ComponentResult<HeadroomKpi>`/`AdapterFailReason` shapes exactly as-is.

Then, in the `headroomComponent` construction (currently around lines 128-134), the unavailable branch's `reason` expression is currently `reasonOf(input.movements) ?? reasonOf(input.facility) ?? 'error'`. Insert one more fallback BEFORE the final `'error'` default: when both `input.movements` and `input.facility` are `ok:true` (so `reasonOf` returns `null` for both) but `input.facility.data.runways.length === 0`, use the existing `AdapterFailReason` value `'no_data'` instead of falling through to the generic `'error'` — this is what makes the zero-runway case explicit and distinguishable from an unclassified error, satisfying WR-04's "label the assumption" requirement without inventing a new reason value or a new field on `HeadroomKpi`.

Add a one-line comment directly above `computeHeadroomKpi`'s function signature noting the precondition its caller now guarantees: it must only be invoked with `facility.runways.length > 0`, since its own `Math.max(1, runwayCount)` clamp is no longer the mechanism that handles the zero-runway case.

Do NOT touch `CARGO_CALLSIGN_PREFIXES`, `isCargoCallsign`, or `computeVolumeKpi` anywhere in this file or its test file — those belong to CR-02, explicitly out of scope for this task (see Task 6).

Add a new `it` block to `src/domain/scoring/expansionScore.test.ts` using the existing `facilityWithRunways(0)` helper (it already supports a `count` of `0`, producing an empty `runways` array) paired with `ok` movements and `ok` nasStatus for a single airport. Call `scoreAirports` on it and assert: `components.headroom.available` is `false`; `components.headroom.reason` is `'no_data'`; `components.headroom.kpi`, `.normalized`, and `.contribution` are all `null`; `components.volume.available` and `components.delayFrequency.available` are both `true` (proving the zero-runway condition is scoped to the headroom component only). Place this as a new, separate `it` block — do NOT modify the existing `it('case group 6: cargo-carrier allowlist membership...')` block, which is intentionally left asserting the CR-02 bug's current, unfixed behavior until the user decides on a fix in a follow-up task.
  </action>
  <verify>
    <automated>npx vitest run src/domain/scoring/expansionScore.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "runways.length > 0" src/domain/scoring/expansionScore.ts` returns at least 1.
    - `grep -c "'DAL'" src/domain/scoring/expansionScore.ts` returns 1 — confirms CARGO_CALLSIGN_PREFIXES is untouched (still contains the original allowlist entry).
    - `grep -c "case group 6" src/domain/scoring/expansionScore.test.ts` returns 1 — confirms the existing CR-02-documenting test case was not removed or renamed.
  </acceptance_criteria>
  <done>A facility with zero runway rows produces headroom.available === false with reason === 'no_data' instead of a value silently computed against a denominator of 1; all pre-existing test cases (groups 1, 2, 3, 5, 6) continue to pass unchanged, including case group 6's CR-02-documenting assertions.</done>
</task>

<task type="auto">
  <name>Task 4: Delete duplicate test file (IN-01)</name>
  <files>src/domain/adapters/faaFacility.client.single.test.ts (deleted)</files>
  <read_first>
    - .planning/phases/03-deterministic-scoring-engine/03-REVIEW.md lines 172-180 (IN-01)
  </read_first>
  <action>
Every assertion in `src/domain/adapters/faaFacility.client.single.test.ts` (the facility-query build for `KATL`/`NTAD_Aviation_Facilities`, and the runway-query build for `ATL`) is already covered, in more detail, by `src/domain/adapters/faaFacility.client.test.ts`'s existing `it` blocks — which additionally assert the exact `where` clause, `f=json`, `returnGeometry=false`, the zero-features case, the embedded-ArcGIS-error case, the 429 case, and the ECONNABORTED-normalization case. Nothing in `faaFacility.client.single.test.ts` is distinct, so delete the file outright. Do not modify `faaFacility.client.test.ts` in this task — there is nothing genuinely new to fold in.
  </action>
  <verify>
    <automated>npx vitest run src/domain/adapters/faaFacility.client.test.ts</automated>
  </verify>
  <done>src/domain/adapters/faaFacility.client.single.test.ts no longer exists on disk; faaFacility.client.test.ts still passes in full, with unchanged coverage of the client's query-building and error-handling behavior.</done>
</task>

<task type="auto">
  <name>Task 5: Verify the adapter and scoring suites pass together</name>
  <files>src/domain/adapters/** and src/domain/scoring/** (read-only — verification task, no files modified)</files>
  <action>
Run the scoped test suites covering every file touched by Tasks 1-4: `npx vitest run src/domain/adapters src/domain/scoring` from the repository root. Confirm the run exits 0 with zero failures, and that the total test count includes the new regression tests added in Tasks 1-3 (the null-field fixture from Task 1, the cache-miss-on-failure test from Task 2, and the zero-runway headroom test from Task 3) alongside every pre-existing test in both directories, including `faaFacility.client.test.ts` post-deletion of the duplicate file and `expansionScore.test.ts`'s unmodified case group 6. Do NOT run the full repo-wide `npm test` — `src/adapters/`, `src/app/api/`, `src/lib/`, and `src/domain/scoring/tracerFixtures.ts` are unrelated, uncommitted Phase 4 work outside this task's scope and must not be touched, modified, or depended on.
  </action>
  <verify>
    <automated>npx vitest run src/domain/adapters src/domain/scoring</automated>
  </verify>
  <done>npx vitest run src/domain/adapters src/domain/scoring exits 0; no file outside src/domain/adapters/ or src/domain/scoring/ (plus the CR-02 options document from Task 6) was modified by this plan.</done>
</task>

<task type="auto">
  <name>Task 6: Propose CR-02 fix options (research/writeup only — no code change)</name>
  <files>.planning/quick/260813-pvn-fix-code-review-findings-cr-01-wr-01-wr-/260813-pvn-CR-02-OPTIONS.md (created)</files>
  <read_first>
    - .planning/phases/03-deterministic-scoring-engine/03-REVIEW.md lines 69-90 (CR-02)
    - .planning/phases/03-deterministic-scoring-engine/03-02-PLAN.md lines 216-230 (the original threat_model's T-03-08, which previously accepted DAL/AAL/ACA's inclusion as a disclosed, non-security scoring assumption — the code review's "critical" classification supersedes that acceptance)
    - src/domain/scoring/expansionScore.ts (CARGO_CALLSIGN_PREFIXES, isCargoCallsign, computeVolumeKpi — read only, do not modify)
    - src/domain/scoring/expansionScore.test.ts (the existing "case group 6" test that currently locks in the CR-02 bug as intended behavior — read only, do not modify)
  </read_first>
  <action>
This task is a research/writeup deliverable — it MUST NOT modify `CARGO_CALLSIGN_PREFIXES`, `isCargoCallsign`, `computeVolumeKpi`, or any other logic in `src/domain/scoring/expansionScore.ts` or its test file. Re-read CR-02 in full from `03-REVIEW.md`: `CARGO_CALLSIGN_PREFIXES` includes `'DAL'` (Delta Air Lines), `'AAL'` (American Airlines), and `'ACA'` (Air Canada) — all three are primarily passenger-mainline ICAO callsign prefixes, so `isCargoCallsign`/`computeVolumeKpi` currently misclassify their passenger movements as cargo, systematically deflating `passengerMovements` (and therefore the volume KPI, 1/3 of `SCORING_WEIGHTS`) for every major hub with meaningful Delta/American/Air Canada traffic. Note that `expansionScore.test.ts`'s existing "case group 6" test currently asserts this misclassification as intended behavior, and that `03-02-PLAN.md`'s threat_model (T-03-08) previously accepted this as a disclosed, non-security scoring assumption — the write-up should note that the code review's "critical" classification supersedes that earlier acceptance, without resolving the tension itself; that is the user's call.

Write `.planning/quick/260813-pvn-fix-code-review-findings-cr-01-wr-01-wr-/260813-pvn-CR-02-OPTIONS.md` with these markdown sections: a `## Summary` restating the bug and its impact in one paragraph; then 2-3 sections each headed exactly `## Option N: <short name>` (N = 1, 2, optionally 3), each stating what code/data changes it requires, what it correctly fixes, and what residual inaccuracy or new assumption (if any) it leaves behind. At minimum evaluate: (1) removing `'DAL'`/`'AAL'`/`'ACA'` from `CARGO_CALLSIGN_PREFIXES` outright — the simplest fix; note that Air Canada does fly some dedicated freighter aircraft under the same `'ACA'` prefix as its passenger flights, so this option undercounts that specific carrier's true cargo movements, and quantify this as a disclosed residual gap rather than treating it as a full fix; (2) a secondary heuristic layered on top of the callsign-prefix check (e.g. a flight-number-range or aircraft-type signal) to distinguish a carrier's freighter movements from its passenger movements when both share one ICAO callsign prefix — note this requires a NEW data field that OpenSky's `Movements` type does not currently carry (per CLAUDE.md's Q1 findings: "No passenger count, no aircraft type/seat capacity, no carrier name field — only callsign"), so it is not implementable without an additional adapter or data source; (3) any other option identified during investigation, such as disclosing the residual misclassification risk directly in the score breakdown's output rather than trying to eliminate it in code. End with a section headed exactly `## Recommendation` naming which option to choose and why, explicitly flagged as a recommendation for the user to approve or reject, not a decision already made — no code changes happen as part of this task or until the user picks one.
  </action>
  <verify>
    <automated>test $(grep -c "^## Option" .planning/quick/260813-pvn-fix-code-review-findings-cr-01-wr-01-wr-/260813-pvn-CR-02-OPTIONS.md) -ge 2 && grep -q "^## Recommendation" .planning/quick/260813-pvn-fix-code-review-findings-cr-01-wr-01-wr-/260813-pvn-CR-02-OPTIONS.md</automated>
  </verify>
  <done>260813-pvn-CR-02-OPTIONS.md exists, contains at least 2 distinct fix options and a clearly labeled recommendation section; CARGO_CALLSIGN_PREFIXES/isCargoCallsign/computeVolumeKpi and their tests remain byte-for-byte unchanged from before this task ran.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|--------------|
| ArcGIS facility/runway response → app memory (`faaFacility.ts`) | Numeric fields from the FAA ArcGIS response are parsed by `toFiniteOrNull` before entering `FaaFacility`/`RunwayGeometry`; a null/undefined/empty value must not be silently substituted with a fabricated `0` or `{lat:0, lon:0}`. |
| `faaFacility.ts` ↔ `cache.ts`'s `withCache` | A failure result must not be cached with the same trust/durability as a genuine `ok:true` result — a transient upstream fault should not be able to pin a false negative for 24h. |
| Phase 2/03-01 adapters → `scoreAirports` (`expansionScore.ts`) | The headroom component must not silently fabricate a "1 runway" assumption for a facility with zero runway data — an unlabeled assumption entering a number the agent states to the analyst violates the project's core value. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-03-09 | Tampering | `toFiniteOrNull` (`faaFacility.ts`) | medium | mitigate | Null/undefined/empty-string ArcGIS numeric fields now return `null` explicitly instead of being silently coerced to `0`/`{lat:0,lon:0}`, preventing corrupted values from entering `movementsPerRunway`/length-based downstream math. Regression-tested with an explicit null-field fixture (Task 1). |
| T-03-10 | Denial of Service | `fetchFaaFacility`'s cached failure path (`faaFacility.ts` + `cache.ts`'s `withCache`) | medium | mitigate | Failure results (`no_data`/`error`) now throw inside the `withCache` callback instead of returning normally, so `cache.ts`'s existing "only cache what `fn()` resolves to" behavior naturally excludes them from the 24h TTL — a transient upstream hiccup no longer masquerades as a day-long "this airport doesn't exist." Regression-tested with a two-call cache-miss assertion (Task 2). |
| T-03-11 | Tampering | `computeHeadroomKpi`'s zero-runway denominator (`expansionScore.ts`) | medium | mitigate | A facility with zero runway rows now yields `headroom.available === false` with an explicit `reason`, instead of a number silently computed against a `Math.max(1, 0)` denominator — closes the unlabeled-assumption gap the project's core value explicitly forbids. Regression-tested (Task 3). |
| T-03-12 | Information Disclosure | CR-02 (`CARGO_CALLSIGN_PREFIXES` passenger/cargo misclassification, `expansionScore.ts`) | critical | accept (temporary, pending user decision) | Out of scope for code changes in this task by explicit developer instruction — `CARGO_CALLSIGN_PREFIXES`/`isCargoCallsign`/`computeVolumeKpi` are left untouched. Task 6 produces a written options document so the user can choose a fix in a follow-up task. Recorded here to explicitly supersede 03-02-PLAN.md's T-03-08 (which accepted this at "low" severity as a disclosed, non-security assumption) — the code review's "critical" classification is the current, correct severity and this acceptance is temporary, not final. |
</threat_model>

<verification>
- `npx vitest run src/domain/adapters src/domain/scoring` exits 0.
- `src/domain/adapters/faaFacility.client.single.test.ts` no longer exists on disk.
- `git status --porcelain` (scoped to this plan's work) shows changes limited to: `src/domain/adapters/faaFacility.ts`, `src/domain/adapters/faaFacility.test.ts`, the deletion of `src/domain/adapters/faaFacility.client.single.test.ts`, `src/domain/scoring/expansionScore.ts`, `src/domain/scoring/expansionScore.test.ts`, and the new `260813-pvn-CR-02-OPTIONS.md` — no file under `src/adapters/`, `src/app/api/`, `src/lib/`, `src/domain/scoring/tracerFixtures.ts`, or `package.json` is touched.
- `grep -c "'DAL'" src/domain/scoring/expansionScore.ts` still returns 1 — `CARGO_CALLSIGN_PREFIXES` is unchanged.
</verification>

<success_criteria>
- CR-01: null/undefined/empty-string ArcGIS numeric fields parse to null, never 0 or a fabricated coordinate.
- WR-01: a no_data/error result from fetchFaaFacility is never cached; a genuine ok:true success still is.
- WR-04: a zero-runway facility's headroom component is explicitly available: false with a stated reason, not a silently-clamped number.
- IN-01: the duplicate client test file is gone; client test coverage is unchanged.
- IN-02: a null-numeric-field fixture test exists and passes, directly regression-testing CR-01.
- CR-02 is untouched in code; a written options document exists with 2-3 concrete options and a labeled recommendation for the user to review and choose from.
</success_criteria>

<output>
Create `.planning/quick/260813-pvn-fix-code-review-findings-cr-01-wr-01-wr-/260813-pvn-SUMMARY.md` when done.
</output>
