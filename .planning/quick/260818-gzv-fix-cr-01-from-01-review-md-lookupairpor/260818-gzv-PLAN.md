---
phase: quick-260818-gzv
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/domain/airports/regions.ts
  - src/domain/airports/regions.test.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "lookupAirports('') and lookupAirports('  ') return [] instead of a fabricated {iata:'', icao:''} pair"
    - "lookupAirports('K$T!') returns [] instead of passing malformed characters through as a fake ICAO/IATA pair"
    - "All existing valid-input behavior (region names, metros, K-prefix passthrough, ANC/HNL exceptions) is unchanged"
  artifacts:
    - src/domain/airports/regions.ts
    - src/domain/airports/regions.test.ts
  key_links:
    - "lookupAirports's passthrough branch calls isValidIcao/isValidIata from src/domain/adapters/validate.ts instead of a locally re-derived regex"
---

<objective>
Fix CR-01 from `.planning/phases/01-foundation-configuration-airport-registry-resolution/01-REVIEW.md`: `lookupAirports` in `src/domain/airports/regions.ts` has no character-format validation on its passthrough branch (inputs that don't match a `REGION_LOOKUP` key). It currently falls through to length-only checks and, for any length not 3 or 4, fabricates `{iata: norm, icao: norm}` — so `lookupAirports('')` returns `[{"iata":"","icao":""}]` and `lookupAirports('K$T!')` returns `[{"iata":"$T!","icao":"K$T!"}]` instead of failing closed.

Purpose: this is the identifier-resolution choke point CLAUDE.md designates for allowlisting user-supplied identifiers before they reach an outbound URL (SEC-02). Malformed input must be rejected here, not silently passed downstream as if it were a valid code.
Output: `lookupAirports`'s passthrough branch reuses the existing `isValidIcao`/`isValidIata` validators from `src/domain/adapters/validate.ts` (the canonical format guards already used at the adapter/outbound-URL boundary) instead of a bare length check, and returns `[]` for anything that fails format validation. Tests updated to assert the new fail-closed behavior.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/domain/airports/regions.ts
@src/domain/airports/regions.test.ts
@src/domain/adapters/validate.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Reuse isValidIcao/isValidIata to close lookupAirports's passthrough validation gap</name>
  <files>src/domain/airports/regions.ts, src/domain/airports/regions.test.ts</files>
  <action>
In `src/domain/airports/regions.ts`:

1. Add an import of `isValidIcao` and `isValidIata` from `@/domain/adapters/validate` (place it with the other imports at the top of the file).

2. Replace the body of `lookupAirports` starting at `const norm = query.trim().toUpperCase();` (the line immediately after the `REGION_LOOKUP` table-hit check) through the end of the function. The current body has three branches keyed only on `norm.length` (4, 3, and a catch-all that returns `[{ iata: norm, icao: norm }]` for every other length, including empty string). Replace all of it with:
   - A 4-length branch that calls `isValidIcao(norm)`; if valid, return `[{ iata: norm.slice(1), icao: norm }]`; if not, return `[]`.
   - A 3-length branch that requires `isValidIata(norm)` to be true before proceeding; if valid, keep the existing ANC/HNL exception map (`{ ANC: 'PANC', HNL: 'PHNL' }`) to derive the ICAO (falling back to a `K`-prefix), and return `[{ iata: norm, icao }]`.
   - A final fallback that returns `[]` for every other case (wrong length, or right length but failing the validator) — this removes the old catch-all that fabricated `{iata: norm, icao: norm}`.

   `isValidIcao`/`isValidIata` are the same anchored `/^[A-Z]{4}$/` / `/^[A-Z]{3}$/` regexes already used at the adapter outbound-URL boundary in `src/domain/adapters/validate.ts` — reuse them directly rather than writing a new regex or duplicating the pattern locally, so there is exactly one place in the codebase that defines "what a well-formed ICAO/IATA code looks like."

In `src/domain/airports/regions.test.ts`:

3. In the existing `'returns passthrough pairs for unrecognised codes and preserves K-prefix for 3-letter codes'` test, no change is needed — every case in it (`'atl'`, `'  ord  '`, `'anc'`, `'hnl'`, `'katl'`, `'PBI'`) is well-formed and must still resolve identically after the fix.

4. Add a new test case (new `it(...)` block or appended to the existing describe) asserting fail-closed behavior for malformed/empty input:
   - `lookupAirports('')` returns `[]`
   - `lookupAirports('   ')` (whitespace-only) returns `[]`
   - `lookupAirports('K$T!')` returns `[]`
   - Include at least one case for a length that fits neither 3 nor 4 after trimming (e.g. a 2-character or 5-character alphabetic string) to confirm the final fallback still returns `[]` for non-matching lengths, not just non-matching characters.

Do not modify the `REGION_LOOKUP` table, `regionKeys()`, or any other function in either file. Do not add narrating comments — the existing head comment on `lookupAirports` (lines 138-141) may be left as-is since it already documents the K-prefix/exception behavior; it does not claim the removed catch-all was intentional, so no correction is needed there.
  </action>
  <verify>
    <automated>cd "<repo-root>" &amp;&amp; npx vitest run src/domain/airports/regions.test.ts &amp;&amp; npx tsc --noEmit</automated>
  </verify>
  <done>regions.test.ts passes with all pre-existing valid-input cases unchanged plus new cases proving `lookupAirports('')`, `lookupAirports('   ')`, `lookupAirports('K$T!')`, and a non-3/4-length alphabetic string each return `[]`; `tsc --noEmit` reports zero errors; `lookupAirports`'s passthrough branch no longer contains a catch-all that returns `{iata: norm, icao: norm}` for arbitrary input.</done>
</task>

</tasks>

<verification>
Run `npx vitest run src/domain/airports/regions.test.ts` — full suite green, including the new fail-closed cases. Run `npx vitest run` (full suite) to confirm no downstream test (e.g. anything exercising `resolveRegion`/`scoreAirportsTool` in `src/domain/agent/tools.ts`, which already treats an empty `lookupAirports` result as "no matches" via `.map`) breaks from the passthrough branch now returning `[]` instead of a fabricated pair. Run `npx tsc --noEmit` for a clean typecheck.
</verification>

<success_criteria>
- `lookupAirports`'s passthrough branch validates format via `isValidIcao`/`isValidIata` from `src/domain/adapters/validate.ts` before constructing a result pair, for both the 4-length and 3-length cases.
- Empty string, whitespace-only, and malformed (`'K$T!'`-style) input all return `[]`.
- Every pre-existing valid-input test case (region names, metro aliases, ANC/HNL exceptions, K-prefix passthrough for `'atl'`/`'ord'`/`'katl'`/`'PBI'`) still passes unchanged.
- `npx tsc --noEmit` is clean.
</success_criteria>

<output>
Create `.planning/quick/260818-gzv-fix-cr-01-from-01-review-md-lookupairpor/260818-gzv-SUMMARY.md` when done
</output>
