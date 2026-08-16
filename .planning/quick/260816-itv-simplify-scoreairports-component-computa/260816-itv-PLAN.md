---
phase: quick-260816-itv
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/domain/scoring/expansionScore.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "scoreAirports produces byte-identical output to the pre-refactor implementation for every existing test case"
    - "No nested ternaries or two-pass 'contribution: 0 // set below' pattern remain in scoreAirports"
  artifacts:
    - src/domain/scoring/expansionScore.ts
  key_links:
    - "scoreAirports still exported with identical signature (inputs: ScoringInput[]) => ExpansionScore[]"
---

<objective>
Refactor `scoreAirports` in `src/domain/scoring/expansionScore.ts` to replace the three near-duplicated inline component blocks (volume/headroom/delay) with small named resolver functions, small named reason functions, and a generic `buildComponent<K>` helper that does the normalize+contribution mechanics.

Purpose: Remove the nested ternaries, the `reasonOf` helper, the `tmp` intermediate map, and the two-pass "contribution: 0 // set below" pattern for readability. This is a pure refactor — no behavior change.
Output: Same file, restructured `scoreAirports` and new private helper functions above it. All exported types (`VolumeKpi`, `HeadroomKpi`, `DelayKpi`, `ComponentResult`, `ScoringComponentBreakdown`, `ScoringInput`, `ExpansionScore`) and other exported functions (`isCargoCallsign`, `computeVolumeKpi`, `computeHeadroomKpi`, `computeDelayKpi`, `minMaxNormalize`, `CARGO_CALLSIGN_PREFIXES`, `SCORING_WEIGHTS`) stay untouched.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@src/domain/scoring/expansionScore.ts
@src/domain/scoring/expansionScore.test.ts
@src/domain/adapters/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace scoreAirports internals with resolver/reason/buildComponent helpers</name>
  <files>src/domain/scoring/expansionScore.ts</files>
  <action>
Replace lines 82-168 (the current `scoreAirports` function body, including its internal `reasonOf` helper and `tmp` intermediate map) with the following structure, inserted directly above `scoreAirports`:

1. Three resolver functions, each taking `(input: ScoringInput)` and returning the KPI or `null`:
   - `resolveVolume`: returns `computeVolumeKpi(input.movements.data)` when `input.movements.ok`, else `null`.
   - `resolveHeadroom`: returns `null` when `!input.movements.ok || !input.facility.ok || input.facility.data.runways.length === 0`; otherwise returns `computeHeadroomKpi(input.movements.data, input.facility.data)`.
   - `resolveDelay`: returns `computeDelayKpi(input.nasStatus.data)` when `input.nasStatus.ok`, else `null`.

2. Three reason functions, each taking `(input: ScoringInput)` and returning `AdapterFailReason`:
   - `volumeReason`: `input.movements.ok ? 'error' : input.movements.reason`.
   - `headroomReason`: if `!input.movements.ok` return `input.movements.reason`; else if `!input.facility.ok` return `input.facility.reason`; else return `'no_data'` (covers the zero-runway case — this function is only ever called when `resolveHeadroom` returned `null`, so reaching the final branch means movements and facility both succeeded and runways.length === 0).
   - `delayReason`: `input.nasStatus.ok ? 'error' : input.nasStatus.reason`.

3. A generic `buildComponent<K>` helper:
   - Signature: `function buildComponent<K>(kpi: K | null, metric: (k: K) => number, reason: AdapterFailReason, dataset: number[], weight: number): ComponentResult<K>`.
   - When `kpi === null`, return `{ available: false, kpi: null, normalized: null, contribution: null, reason }`.
   - Otherwise compute `normalized = minMaxNormalize(metric(kpi), dataset)` and return `{ available: true, kpi, normalized, contribution: normalized * weight }`.

4. Rewrite `scoreAirports` to:
   - Map `inputs` to `{ input, vol: resolveVolume(input), head: resolveHeadroom(input), delay: resolveDelay(input) }` — this replaces the old `tmp` map and the inline dataset-building loop.
   - Derive `volumeDataset`, `headroomDataset`, `delayDataset` by filtering the mapped array for non-null `vol`/`head`/`delay` and extracting `passengerMovements`/`movementsPerRunway`/`eventCount` respectively (use non-null assertion after the filter, matching the existing codebase's established pattern for this exact situation, e.g. `.filter((k) => k.vol).map((k) => k.vol!.passengerMovements)`).
   - Map the per-input KPI entries to results: compute `availableCount` as the count of non-null values among `[vol, head, delay]`, `weight = availableCount > 0 ? 1 / availableCount : 0`, then build each component via `buildComponent(vol, (k) => k.passengerMovements, volumeReason(input), volumeDataset, weight)` and the analogous calls for headroom (`k.movementsPerRunway`) and delay (`k.eventCount`).
   - Compute `score` as the sum of the three components' `contribution ?? 0`.
   - Return `{ icao: input.icao, score, components: { volume: volumeComponent, headroom: headroomComponent, delayFrequency: delayComponent, weightPerComponent: weight, availableComponentCount: availableCount, coverage: `${availableCount} of 3 components available` } }` — field names, key order convention, and the coverage string format must match the current implementation exactly (test suite asserts on `coverage` string and `weightPerComponent`).

Preserve the existing `SCORING_WEIGHTS`, `CARGO_CALLSIGN_PREFIXES`, `isCargoCallsign`, `computeVolumeKpi`, `computeHeadroomKpi`, `computeDelayKpi`, and `minMaxNormalize` exports and their code exactly as-is (lines 1-80) — this task only touches `scoreAirports` and its immediately preceding helpers. Do not add comments narrating what the code does; the one existing precondition comment above `computeHeadroomKpi` (lines 61-62) may stay since it records a non-obvious contract, not an obvious statement — do not add anything similar to the new resolver/reason functions since their logic is self-evident from the type signatures and short bodies.
  </action>
  <verify>
    <automated>cd "<repo-root>" &amp;&amp; npx vitest run src/domain/scoring/expansionScore.test.ts &amp;&amp; npx tsc --noEmit</automated>
  </verify>
  <done>expansionScore.test.ts's full suite (7 test cases covering three-airport comparison, weight redistribution, zero-runway headroom, all-unavailable, determinism, and cargo-callsign allowlist) passes unmodified against the refactored scoreAirports, and `tsc --noEmit` reports zero errors.</done>
</task>

</tasks>

<verification>
Run `npx vitest run src/domain/scoring/expansionScore.test.ts` — all 7 existing test cases pass with no test-file changes (pure refactor, behavior-preserving). Run `npx tsc --noEmit` — no new type errors introduced. Manually confirm the refactored `scoreAirports` contains no nested ternaries and no `contribution: 0 // set below` two-pass pattern, and that `reasonOf`/`tmp` are gone.
</verification>

<success_criteria>
- `scoreAirports` and its immediate helpers (`resolveVolume`, `resolveHeadroom`, `resolveDelay`, `volumeReason`, `headroomReason`, `delayReason`, `buildComponent`) replace the old inline-ternary implementation.
- All other exports in the file are byte-identical to before.
- `npm test` (or the scoped vitest run) and `npm run typecheck` both pass.
- No behavior change: same `ComponentResult`/`ScoringComponentBreakdown` shapes, same reason fallback logic, same min-max normalization, same equal-weight-among-available-components math.
</success_criteria>

<output>
Create `.planning/quick/260816-itv-simplify-scoreairports-component-computa/260816-itv-SUMMARY.md` when done
</output>
