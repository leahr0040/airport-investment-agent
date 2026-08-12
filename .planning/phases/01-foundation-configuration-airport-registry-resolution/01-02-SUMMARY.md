---
phase: 01-foundation-configuration-airport-registry-resolution
plan: 02
subsystem: infra
tags: [zod, nextjs, instrumentation, env-validation, config]

# Dependency graph
requires:
  - phase: 01-01
    provides: Next.js scaffold, Vitest toolchain, server-only dependency already installed
provides:
  - "src/config/env.ts — single validated Zod schema for OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET, GOOGLE_GENERATIVE_AI_API_KEY (required) and LOG_LEVEL (optional, default info); throws an actionable EnvValidationError-shaped message naming each missing/invalid variable and its acquisition URL, ending with a .env.example remedy line"
  - "src/instrumentation.ts register() — Next.js boot hook that forces the env validation to run before the server accepts requests"
  - ".env.example — the four-key runbook matching env.ts's schema exactly"
  - "README.md — clone-to-running quickstart, credentials table, startup-failure recognition guide"
affects: [01-03-airport-resolution, 01-04-airport-registry-fetch, all-future-phases-reading-env]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-file env module: one Zod object schema with per-field custom error messages (via z.string(msg).trim().min(1, msg)) covering both the missing (invalid_type) and empty (too_small) Zod issue codes with the same actionable text — no separate schema/help-text/error-class files"
    - "instrumentation.ts register() eager-imports @/config/env under a NEXT_RUNTIME==='nodejs' guard to force validation before request-serving begins"
    - "next.config.ts sets agentRules: false to stop Next.js 16 from auto-generating AGENTS.md/CLAUDE.md at the repo root on every dev/build run"
    - "vitest.config.ts sets passWithNoTests: true as an explicit, short-lived interim state until 01-03 adds real tests"

key-files:
  created:
    - src/config/env.ts
    - src/instrumentation.ts
    - .env.example
  modified:
    - README.md
    - next.config.ts
    - vitest.config.ts

key-decisions:
  - "Collapsed the plan's originally-specified two-file split (env.schema.ts + env.ts, with RequiredEnvSchema/OptionalEnvSchema/EnvSchema/parseEnv/EnvValidationError/REQUIRED_ENV_HELP/OPTIONAL_ENV_HELP) into a single src/config/env.ts, by explicit developer instruction mid-execution, matching an existing sibling-project convention (smart-house's src/lib/env.ts: one inline schema, one safeParse, one thrown Error, export env). Per-field acquisition-URL messages are preserved via z.string(msg).trim().min(1, msg), which Zod v4 applies to both the missing (invalid_type) and empty (too_small) issue codes — verified live before adopting this pattern."
  - "No automated unit test exists for src/config/env.ts, by explicit developer instruction ('no need test for the env'). env.ts imports the real server-only package, which unconditionally throws when resolved via its default (non react-server-condition) export — meaning env.ts cannot be imported by plain Vitest without either a test-only module alias for server-only or accepting the throw. Rather than add that test infrastructure, coverage for SETUP-01's actual behavior is manual: verified live in this session via `npm run dev` twice (missing credentials -> boot fails, curl connection-refused; all credentials present -> boot succeeds, curl 200) and is captured in this plan's own end-of-phase <human-check>."
  - "Disabled Next.js 16's agentRules feature (next.config.ts: agentRules: false) — Rule 2/3 auto-fix. Discovered live: `npm run dev` auto-generated AGENTS.md and a stub CLAUDE.md at the repo root on every run, which would silently collide with/shadow the project's real, committed .claude/CLAUDE.md (config.json's claude_md_path) and reintroduce the exact dangling-stub problem 01-01-SUMMARY.md already deleted once from the create-next-app scaffold output."
  - "Added vitest.config.ts passWithNoTests: true — Rule 3 auto-fix. With env.schema.test.ts dropped and no other *.test.ts files yet in src/, `npm test` exited 1 on an empty suite (Vitest's default), which would present as a broken command to a reviewer running the README's own documented `npm test` step. 01-01's plan already anticipated exactly this interim state (its own verification command was `npx vitest run --passWithNoTests`); 01-03 (same wave) adds the first real tests."
  - "A blanket `Read(.env.*)` permission deny-rule in the user's global settings.json initially blocked writing .env.example (a file the plan requires to be committed). The user narrowed the rule mid-execution to enumerate real-secret variants explicitly (.env, .env.local, .env.production[.local], .env.development[.local], .env.test[.local], .secrets) plus an explicit allow for .env.example, then I retried and it wrote successfully — no plan or code change, but recorded here since it affected the ability to complete this plan's own required artifact."

requirements-completed: [SETUP-01, SETUP-02, SETUP-03]

coverage:
  - id: D1
    description: "src/config/env.ts validates all required credentials at startup via src/instrumentation.ts register(); a missing/empty/invalid variable throws a message naming it and its acquisition URL, ending with the .env.example remedy line; all credentials present starts cleanly with LOG_LEVEL defaulting to 'info'"
    requirement: SETUP-01
    verification: []
    human_judgment: true
    rationale: "No automated unit test exists for env.ts by explicit developer decision (server-only unconditionally throws under plain Vitest, and adding test-only module-alias infrastructure to work around that was declined as unneeded complexity). I manually verified both boot paths live in this session (npm run dev with no credentials -> instrumentation error printed naming all three variables + their URLs, curl connection-refused; npm run dev with all three inline env vars set -> clean boot, curl 200) but that verification is not captured as a repeatable, committed test — it matches this plan's own end-of-phase <human-check> steps 1-3, which remain open per config.json's human_verify_mode: end-of-phase."
  - id: D2
    description: "Configuration is read through exactly one validated module (src/config/env.ts); every other src/**/*.ts file is free of ambient process.env reads except src/instrumentation.ts's NEXT_RUNTIME guard"
    requirement: SETUP-03
    verification:
      - kind: other
        ref: "grep -rn 'process\\.env' src --include=*.ts (exit: only src/config/env.ts and src/instrumentation.ts match); npx tsc --noEmit (exit 0)"
        status: pass
    human_judgment: false
  - id: D3
    description: ".env.example enumerates exactly the four keys env.ts validates (OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET, GOOGLE_GENERATIVE_AI_API_KEY, LOG_LEVEL) with placeholder-only values, and is not gitignored"
    requirement: SETUP-02
    verification:
      - kind: other
        ref: "node -e script asserting .env.example key set matches env.ts's validated keys (exit 0); git check-ignore -q .env.example (exit 1, i.e. committable)"
        status: pass
    human_judgment: false
  - id: D4
    description: "README.md carries Prerequisites, Quickstart, Credentials, startup-failure recognition, Commands, Project layout and Data sources sections with the literal commands/URLs a reviewer needs, and does not claim a chat UI or scoring engine exists"
    requirement: SETUP-02
    verification:
      - kind: other
        ref: "node -e script asserting all required headings/commands/URLs present and README.md length >= 1500 chars (exit 0, length=3858)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A reviewer reading only .env.example and README.md, with no source access, can obtain both credentials, start the app, and recognise the startup-validation error if a variable is skipped"
    verification: []
    human_judgment: true
    rationale: "This is inherently a human-experience read of the two runbook artifacts, not a property a script can assert. Deferred to the phase-level <human-check> per config.json's human_verify_mode: end-of-phase, same as 01-01-SUMMARY.md's D5."

duration: 40min
completed: 2026-08-13
status: complete
---

# Phase 1 Plan 2: Configuration & Startup Validation Summary

**Single-file Zod env module (src/config/env.ts) gating server boot via src/instrumentation.ts, plus the .env.example/README pair a reviewer needs to go from clone to running app — collapsed from the plan's originally-specified two-file schema/singleton split into one file by explicit developer direction mid-execution.**

## Performance

- **Duration:** ~40 min (includes three interactive course-correction exchanges with the developer over the env module's shape, a permission-rule fix for .env.example, and live dev-server verification of both boot paths)
- **Completed:** 2026-08-13T01:29:03+03:00
- **Tasks:** 2 (both auto)
- **Files modified:** 3 created (src/config/env.ts, src/instrumentation.ts, .env.example), 3 modified (README.md, next.config.ts, vitest.config.ts)

## Accomplishments
- `src/config/env.ts` validates `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`, `GOOGLE_GENERATIVE_AI_API_KEY` (required) and `LOG_LEVEL` (optional, default `info`) via one Zod object schema, with per-field messages naming the variable, its acquisition URL, and ending in a `.env.example` remedy line
- `src/instrumentation.ts` `register()` forces that validation to run at server boot, before any request is served — verified live: missing credentials produce connection-refused; complete credentials produce a clean HTTP 200 boot
- `.env.example` and a rewritten `README.md` ship the full clone-to-running runbook: prerequisites, quickstart, a credentials table, startup-failure recognition, a commands table, project layout, and data sources
- Fixed two boot-time side issues discovered live: Next.js 16's auto-generated `AGENTS.md`/`CLAUDE.md` stubs (disabled via `agentRules: false`) and Vitest's empty-suite failure (fixed via `passWithNoTests: true`)

## Task Commits

1. **Task 1: Validated env schema, actionable failure message, and the boot gate** - `e8bea21` (feat)
2. **Task 2: .env.example and the clone-to-running README** - `4db98fa` (docs)

**Plan metadata:** commit pending (this SUMMARY + STATE.md + ROADMAP.md)

## Files Created/Modified
- `src/config/env.ts` - Single Zod-validated env module: required credentials + optional `LOG_LEVEL`, actionable throw message, `env`/`getEnv()` exports
- `src/instrumentation.ts` - Next.js `register()` boot hook; dynamically imports `@/config/env` under a `NEXT_RUNTIME==='nodejs'` guard
- `.env.example` - Four-key runbook (three required + `LOG_LEVEL`) with acquisition-URL comments and placeholder values only
- `README.md` - Rewritten: Prerequisites, Quickstart, Credentials, startup-failure recognition, Commands, Project layout, Data sources
- `next.config.ts` - `agentRules: false` (Rule 2/3 auto-fix; see Deviations)
- `vitest.config.ts` - `passWithNoTests: true` (Rule 3 auto-fix; see Deviations)

## Decisions Made
- Single-file `env.ts` over the plan's originally-specified `env.schema.ts` + `env.ts` split (see key-decisions in frontmatter for the full rationale and the Zod v4 mechanism — `z.string(msg).trim().min(1, msg)` — that preserves actionable per-field messages for both the missing and empty cases in one file)
- No automated unit test for `env.ts` (explicit developer decision); SETUP-01's behavior is verified manually and deferred to the plan's own end-of-phase human-check
- `agentRules: false` and `passWithNoTests: true` as minimal, targeted fixes for two boot/test-runner side issues surfaced during live verification

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 4 -> resolved via developer decision] Collapsed env.schema.ts + env.ts into a single env.ts**
- **Found during:** Task 1, initial write of `src/instrumentation.ts` (developer rejected the in-progress `env.ts` as too complex, referencing a sibling project's single-file convention)
- **Issue:** The plan's Task 1 specifies a strict two-file split (`env.schema.ts` pure/testable + `env.ts` thin `server-only` singleton) with named exports `RequiredEnvSchema`, `OptionalEnvSchema`, `EnvSchema`, `parseEnv`, `EnvValidationError`, `REQUIRED_ENV_HELP`, `OPTIONAL_ENV_HELP`. This is a structural/architectural choice (Rule 4), so I stopped and asked the developer directly rather than auto-applying either version.
- **Resolution:** Developer chose explicitly (relayed by the coordinator, consistent with the developer's own earlier tool-rejection wording) to collapse to one `env.ts`: inline schema, one `safeParse`, one thrown `Error`, no `EnvValidationError` class, no separate help-text records, no `Required`/`OptionalEnvSchema` split.
- **Files modified:** `src/config/env.ts` (env.schema.ts never committed — created then deleted before any commit)
- **Verification:** `npx tsc --noEmit` (exit 0); live `npm run dev` runs proving both the missing-credential and complete-credential boot paths behave per SETUP-01
- **Committed in:** `e8bea21` (Task 1 commit)

**2. [Rule 4 -> resolved via developer decision] Dropped the automated env.ts test entirely**
- **Found during:** Task 1, after the single-file collapse above — attempted to write a dynamic-import-based Vitest suite (mutating `process.env` + `vi.resetModules()` per case, since `env.ts` validates once at module-evaluation time) to preserve SETUP-01 behavior coverage
- **Issue:** `env.ts` imports the real `server-only` package, whose default (non-`react-server`-condition) export unconditionally throws `"This module cannot be imported from a Client Component module"` — confirmed by reading `node_modules/server-only/index.js` directly. Testing it under plain Vitest requires either a test-only module alias to `server-only`'s `empty.js` variant, or accepting the throw.
- **Resolution:** Developer rejected the drafted test file with "no need test for the env" — explicit instruction to skip automated coverage for this module.
- **Files modified:** `src/config/env.schema.test.ts` created then deleted (never committed)
- **Verification:** N/A — no automated test exists; see coverage entry D1's `rationale`
- **Committed in:** N/A (no test file exists in any commit)

**3. [Rule 2/3] Disabled Next.js 16's auto-generated AGENTS.md/CLAUDE.md (agentRules: false)**
- **Found during:** Task 1, live `npm run dev` verification of the missing-credential boot failure
- **Issue:** `next dev` printed "Generated AGENTS.md and CLAUDE.md for AI agents" and wrote both files to the repo root on every run. The generated `CLAUDE.md` would shadow/collide with the project's real, committed `.claude/CLAUDE.md` (config.json's `claude_md_path: "./.claude/CLAUDE.md"`) and reintroduce the exact stray-stub problem 01-01-SUMMARY.md already deleted once from the initial scaffold.
- **Fix:** Added `agentRules: false` to `next.config.ts`; deleted the two generated files; re-ran `npm run dev` and confirmed no regeneration.
- **Files modified:** `next.config.ts`
- **Verification:** `npx tsc --noEmit` (exit 0, confirms `agentRules` is a valid `NextConfig` field); live re-run of `npm run dev` showed no `AGENTS.md`/`CLAUDE.md` regenerated
- **Committed in:** `e8bea21` (Task 1 commit)

**4. [Rule 3 -> confirmed via developer decision] Added vitest.config.ts passWithNoTests: true**
- **Found during:** Task 1, after dropping `env.schema.test.ts` (deviation 2 above) left zero `*.test.ts` files in `src/`
- **Issue:** `npm test` (`vitest run`) exits 1 by default when its include glob matches no files — this would make the README's own documented `npm test` command look broken to a reviewer, with no actual bug behind it.
- **Fix:** Added `passWithNoTests: true` to `vitest.config.ts`'s `test` block. Confirmed by the developer as the correct minimal fix over a placeholder smoke test — 01-01's own plan already anticipated this exact interim state (its verification command was `npx vitest run --passWithNoTests`), and 01-03 (same wave) adds real tests next.
- **Files modified:** `vitest.config.ts`
- **Verification:** `npm test` exits 0 with "No test files found, exiting with code 0"
- **Committed in:** `e8bea21` (Task 1 commit)

**5. [Environment/tooling, not code] Narrowed a global Read(.env.*) permission deny-rule**
- **Found during:** Task 2, first attempt to write `.env.example`
- **Issue:** A blanket `Read(.env.*)` deny-rule in the user's global `settings.json` blocked writing `.env.example` — the plan's own required, intentionally-committable artifact.
- **Fix:** The developer (via the coordinator) narrowed the rule to enumerate real-secret variants (`.env`, `.env.local`, `.env.production[.local]`, `.env.development[.local]`, `.env.test[.local]`, `.secrets`) and added an explicit allow for `.env.example`. No project file changed as a result.
- **Files modified:** none in this repository (global harness settings, outside repo scope)
- **Verification:** Retried `Write` on `.env.example` after the fix; succeeded. `git check-ignore -q .env.example` exits 1 (committable).
- **Committed in:** N/A (not a repo change)

---

**Total deviations:** 5 (2 architectural, resolved via direct developer decision per Rule 4; 2 auto-fixed per Rule 2/3; 1 environment/tooling fix outside repo scope)
**Impact on plan:** The env-module shape differs from PLAN.md's originally-specified artifact contract (fewer exported symbols, no separate schema/help-text files, no automated test) by explicit developer choice, documented above so downstream plans and phase verification are not surprised by the smaller export surface. `agentRules: false` and `passWithNoTests: true` were necessary fixes for real breakage discovered during this plan's own live verification, not scope creep. No functionality beyond the plan's stated SETUP-01/02/03 requirements was added.

## Issues Encountered
- Zod v4's `.min(1, msg)` custom message only applies to the `too_small` issue code (present-but-empty values), not `invalid_type` (missing keys) — verified live via a throwaway `node -e` script before writing `env.ts`. Worked around by passing the same message to `z.string(msg)` itself, which Zod v4 applies to `invalid_type`, so both missing and empty cases surface the same actionable acquisition-URL text.
- `git check-ignore -q .env.example` needed to be combined with a `test $? -ne 0` (not the reverse) — the plan's own `<automated>` verification snippet for Task 2 has this same non-obvious polarity (exit 0 means "would be ignored," so a non-zero exit is the success condition here); confirmed working as written.

## User Setup Required
None beyond what STATE.md already tracks as blockers for later phases (real OpenSky and Gemini credentials are needed starting Phase 2's live-API work, not for this plan — this plan only requires *some* non-empty string values to satisfy validation, and placeholders were used for live verification in this session).

## Next Phase Readiness
- `src/config/env.ts` and `src/instrumentation.ts` are committed, typecheck-clean, and manually verified against both boot paths (missing credential -> fails before serving; complete credentials -> serves HTTP 200).
- `.env.example` and `README.md` are committed and pass every automated structural check the plan specifies (key-set match, required headings/commands/URLs present, `git check-ignore` polarity).
- Downstream plans (01-03 resolution, 01-04 registry fetch) should import `env`/`getEnv()` from `src/config/env.ts` rather than reading `process.env` directly — the audit gate (`grep -rn 'process\.env' src`) will catch any regression.
- Open items carried to the phase-level `<human-check>` (per `config.json`'s `human_verify_mode: end-of-phase`): visually confirming the printed startup-failure message and the working dev server, and a full top-to-bottom README read-through as a fresh reviewer would experience it. These were exercised programmatically in this session (dev server + curl) but not by a human eyeball yet.
- The env-module export-surface deviation (single `env.ts`, no `parseEnv`/`EnvValidationError`/help-text records) should be treated as the new baseline by any later plan or audit that expected the originally-planned two-file contract.

## Self-Check: PASSED

All 3 claimed created files (`src/config/env.ts`, `src/instrumentation.ts`, `.env.example`) verified present on disk; both claimed commit hashes (`e8bea21`, `4db98fa`) verified present in `git log`.
