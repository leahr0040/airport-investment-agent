phase: 03-deterministic-scoring-engine
plan: 02
wave: 2

summary: |
  Implemented a pure, deterministic scoring engine `scoreAirports` and comprehensive
  fixture-based tests exercising cargo/passenger separation, weight redistribution,
  partial/full availability handling, and determinism.

changes:
- src/domain/scoring/expansionScore.ts
- src/domain/scoring/expansionScore.test.ts

notes: |
  - Ran the module-level tests: `npx vitest run src/domain/scoring/expansionScore.test.ts` — all 6 tests passed.
  - A full repo typecheck (`npx tsc --noEmit`) surfaced pre-existing test-file type errors unrelated to these changes; I did not modify other files to avoid scope creep. Maintainer can run `npx tsc --noEmit` locally to inspect.
