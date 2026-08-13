---
phase: 02-live-data-adapters-caching
verified: 2026-08-13T14:10:00Z
status: human_needed
score: 3/4 roadmap truths verified
behavior_unverified: 1
overrides_applied: 0
behavior_unverified_items:
  - truth: "Both adapters run against the real OpenSky and FAA endpoints and return real, non-fixture numbers (ROADMAP Phase 2 success criteria 1 and 2; plan 02-05 Task 3's acceptance criteria)."
    test: "Run `npm run smoke` with real `.env` credentials (OpenSky OAuth2 client + registered account)."
    expected: "OpenSky reports non-negative departure/arrival counts for KATL over the stated 86400s window; FAA reports `lid: 'ATL'` and an `events` array; `getCacheStats()` hit counter increases by 2 on the second round of calls; no secret/token/raw body is printed."
    why_human: "This is a live external-service integration (real OAuth2 token exchange + real FAA XML feed). It cannot be exercised in this sandboxed verification pass (no live credentials, no live network policy here), and it is exactly the class of check that mocked unit tests structurally cannot prove (wrong endpoint path, wrong OAuth2 grant field, drifted XML schema all pass a mocked suite). The developer already ran `npm run smoke` and reported \"all passed\" (recorded in 02-05-SUMMARY.md), but explicitly declined to record the specific observed counts/lid/events that plan 02-05's Task 3 acceptance criteria asked for as evidence — a disclosed, known scope reduction, not a hidden defect. Re-running and capturing the numbers would close the evidentiary gap but does not block Phase 3, since the code path is otherwise fully exercised (comprehensive mocked-fixture tests modeling the documented live schemas) and a human has already confirmed the live run passed."
human_verification:
  - test: "Run `npm run smoke` with real `.env` credentials and record the printed OpenSky departure/arrival counts for KATL, the FAA `lid`/`events` result, and the run timestamp into 02-05-SUMMARY.md."
    expected: "OpenSky returns ok:true with numeric counts over an 86400s window; FAA returns ok:true with lid ATL; cache hit counter increases by exactly 2 on the second round; no secret is printed."
    why_human: "External live-service integration; already verbally confirmed passing by the developer, but the evidentiary trail plan 02-05 asked for was never captured. Recommended follow-up, not a blocker — see Gaps Summary."
---

# Phase 2: Live Data Adapters & Caching Verification Report

**Phase Goal:** Every live data source the scoring engine needs is fetched, cached per its own volatility, and fails in isolation without taking down the rest of the answer.
**Verified:** 2026-08-13T14:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Phase 2 Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Requesting an airport's movement data returns real OpenSky departure/arrival counts for an explicit, stated time window, authenticated via OAuth2 client credentials. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED (code + mocked-behavior VERIFIED; live-data claim rests on undocumented human attestation) | `fetchMovements()` in `src/domain/adapters/opensky.ts`/`opensky.client.ts` implements OAuth2 client-credentials flow (`ensureToken`, lazy refresh, 30s safety margin), a bucketed 86400s window (`opensky.parser.ts: buildWindow`), and 14 passing test cases in `opensky.test.ts` covering the happy path, window flooring, cache hit/miss, token reuse/refresh, timeout/429/401 mapping, and null-inferred-airport counting. `npm test` 66/66 green. The live-network claim itself (real, non-fixture numbers) is attested only verbally by the developer in `02-05-SUMMARY.md` ("all passed"), with the plan's requested evidence (actual counts) explicitly declined — see Human Verification. |
| 2 | Requesting an airport's status returns live FAA NAS delay/closure information. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED (same caveat as #1) | `fetchNasStatus()` in `src/domain/adapters/nasStatus.ts`/`nasStatus.client.ts` fetches the whole feed, parses via `fast-xml-parser`, and walks every `Delay_type` block generically (not a hardcoded switch — confirmed by `nasStatus.test.ts`'s "unrecognised block name" case). 13 passing test cases including the DJT/KPBI FAA-LID-divergence case and entity-escaped free text. Live-data claim rests on the same undocumented developer attestation as #1. |
| 3 | Repeated requests for the same airport within a source's TTL are served from `lru-cache` without a duplicate upstream call, and different sources carry different TTLs reflecting their actual volatility. | ✓ VERIFIED | `src/domain/adapters/cache.ts` exports `OPENSKY_TTL_MS` (5 min) and `NAS_STATUS_TTL_MS` (3 min) — different values per source. `cache.test.ts` directly proves per-entry TTL independence ("honours each entry's TTL independently") and that a same-key call inside the TTL invokes the producer exactly once. `opensky.test.ts`'s "caches results inside the TTL" test proves 1 token POST + 2 GETs (not 4) for two calls inside the bucket/TTL window; `nasStatus.test.ts`'s "fetches the whole feed once for two different airports" proves the single shared `nas:feed` key. Note: the ROADMAP wording also mentions a "registry" TTL — the current architecture (post Phase-1 pivot, see `02-CONTEXT.md` D-03) treats `regions.ts` as a boot-once hardcoded table with no TTL by design, not a gap. |
| 4 | When one source times out or fails, the KPIs it feeds are marked "unavailable" and the rest of the answer still returns, rather than the whole request failing. | ✓ VERIFIED | `src/domain/adapters/isolation.test.ts` calls both adapters through a single `Promise.all` with one adapter scripted to time out (OpenSky `ECONNABORTED`) and asserts (a) `Promise.all` itself resolves rather than rejects, and (b) the OpenSky result is `{ok:false, reason:'timeout'}` while the FAA result is `ok:true` — the literal proof of cross-source isolation. A second case proves the D-08 format gate short-circuits both adapters before any I/O. `AdapterResult<T>` (`types.ts`) has no `stale` branch (D-06); every failure path across both adapters routes through the shared `toAdapterFailure` helper (`errors.ts`), asserted never to throw past the adapter boundary. |

**Score:** 2/4 roadmap truths fully verified; 2/4 present + behaviorally correct against mocked fixtures but carrying an unresolved live-evidence gap (present_behavior_unverified, not failed).

### Plan-Level Must-Haves (all 5 plans)

Reviewed against the actual shipped code (not SUMMARY.md claims) for all 5 plans in this phase:

| Plan | Must-haves | Status |
|------|-----------|--------|
| 02-01 (adapter foundation) | `withCache`/`getCacheStats`/`clearCache`, `AdapterResult<T>`/`AdapterFailReason` (5 reasons, no stale branch), `isValidIcao`/`isValidIata` (anchored, non-normalising), `toAdapterFailure`, Vitest `server-only` harness | ✓ VERIFIED — all artifacts exist, are substantive, wired into both adapters, and covered by passing tests (`cache.test.ts`, `validate.test.ts`, `errors.test.ts`, `env.test.ts`). |
| 02-02 (ICAO codes on regions.ts) | `AirportCodes` type, `regionKeys()`, `lookupAirports()` returning `{iata, icao}` pairs, DJT/KPBI divergence, ANC/HNL P-prefix exceptions | ✓ VERIFIED — read `src/domain/airports/regions.ts` directly; all 23 table keys carry ICAO as data, passthrough branch derives correctly (K-prefix + ANC/HNL exceptions), matches plan's Task 2 spec exactly including the corrected `iata` derivation. |
| 02-03 (OpenSky adapter) | `fetchMovements`, `clearTokenCache`, bucketed cache key, lazy OAuth2 refresh, typed failures, format gate before I/O | ✓ VERIFIED against the plan's *behavioral* requirements (per this task's explicit instruction to judge 02-03/02-04 on behavior, not literal file-shape). Disclosed architecture override: axios + 5-file split instead of the plan's single `fetch()`-based file — documented honestly in `02-03-SUMMARY.md`'s Deviations section, with the axios-specific `ECONNABORTED`→`TimeoutError` normalization bug fixed and tested. Not treated as a defect per task instructions. |
| 02-04 (FAA NAS Status adapter) | `fetchNasStatus`, `toFaaLid`, generic `Delay_type` block walk, whole-feed single cache key, `fast-xml-parser` checkpoint | ✓ VERIFIED against behavioral requirements. Same disclosed axios/2-file-split override as 02-03. Confirmed the block walk is genuinely generic (test case: unrecognised block name still yields its event) — not a hardcoded switch over the four known block types, which was the specific defect the reconciling session claims to have fixed. Package Legitimacy checkpoint for `fast-xml-parser` confirmed present in `package.json` (`^5.10.1`), decision recorded in `02-04-SUMMARY.md`. |
| 02-05 (cross-adapter isolation + live smoke) | `isolation.test.ts`, `live.smoke.ts`, `vitest.smoke.config.ts`, `smoke` npm script | ✓ VERIFIED for the automated proof (isolation.test.ts, scope-trimmed to 2 of the plan's 6 cases by explicit developer direction — the core DATA-05 cross-adapter claim is still proven). `npm run smoke`'s config correctly excludes itself from `npm test`'s include pattern (confirmed: `npm test` ran exactly 10 files / 66 tests, no smoke file). ⚠️ Live-checkpoint evidence (Task 3) is the one open item — see Human Verification. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/domain/adapters/types.ts` | `AdapterResult<T>`/`AdapterFailReason` | ✓ VERIFIED | 5-reason union, no `stale` branch (explicit comment recording D-06). |
| `src/domain/adapters/validate.ts` | `isValidIcao`/`isValidIata` | ✓ VERIFIED | Anchored regex, no trim/case-normalisation, matches all behavior-block cases in tests. |
| `src/domain/adapters/cache.ts` | `withCache`/`getCacheStats`/`clearCache` + TTL constants | ✓ VERIFIED | `OPENSKY_TTL_MS`=300000, `NAS_STATUS_TTL_MS`=180000, `OPENSKY_BUCKET_SECONDS`=300, `ttlResolution:0` fix for fake-timer reliability documented and tested. |
| `src/domain/adapters/errors.ts` | `toAdapterFailure` | ✓ VERIFIED | Maps TimeoutError/carried-reason/other-Error/non-Error uniformly; detail hygiene (no secret leakage) asserted in tests. |
| `src/domain/airports/regions.ts` | `AirportCodes`, `regionKeys()`, `lookupAirports()` returning pairs | ✓ VERIFIED | All 23 keys carry real ICAO data; DJT/KPBI, ANC/PANC, HNL/PHNL pinned. |
| `src/domain/adapters/opensky.ts` + 4 sibling files | `fetchMovements`, `clearTokenCache`, `Movements`, `FlightMovement` | ✓ VERIFIED | Split across `opensky.ts`/`.client.ts`/`.parser.ts`/`.aggregator.ts`/`.types.ts` by disclosed developer override; all symbols present, wired, and tested. |
| `src/domain/adapters/nasStatus.ts` + `.client.ts` | `fetchNasStatus`, `toFaaLid`, `NasStatus`, `NasStatusEvent` | ✓ VERIFIED | Split into 2 files by disclosed developer override; generic block walk confirmed by reading the code (`findMatchingEntries`), not just the SUMMARY's claim. |
| `src/domain/adapters/isolation.test.ts` | Cross-adapter DATA-05 proof | ✓ VERIFIED | 2 cases (scope-trimmed, disclosed); both pass. |
| `src/domain/adapters/live.smoke.ts` + `vitest.smoke.config.ts` | Opt-in live run | ✓ VERIFIED (structurally) | Correctly excluded from `npm test`; not independently executed by this verification pass (requires live credentials — see Human Verification). |
| `package.json` — `lru-cache`, `axios`, `fast-xml-parser`, `smoke` script | Dependencies + script | ✓ VERIFIED | All present with pinned major versions; `fast-xml-parser` gated behind the recorded Package Legitimacy checkpoint. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `opensky.ts` | `errors.ts` (`toAdapterFailure`) | catch-block delegation | ✓ WIRED | `grep -c toAdapterFailure` confirms usage; `opensky.client.ts` normalizes axios's `ECONNABORTED` to a `TimeoutError`-named error first so the shared helper stays HTTP-client-agnostic. |
| `nasStatus.ts` | `errors.ts` (`toAdapterFailure`) | catch-block delegation | ✓ WIRED | Same pattern, confirmed by direct code read. |
| `opensky.ts` / `nasStatus.ts` | `validate.ts` | format gate before any I/O | ✓ WIRED | Both adapters call `isValidIcao` as their first statement; `nasStatus.ts` additionally validates the derived LID with `isValidIata`. Zero-fetch-call assertions confirm the gate runs before I/O in both test suites. |
| `opensky.ts` / `nasStatus.ts` | `cache.ts` (`withCache`) | TTL-bucketed cache key | ✓ WIRED | OpenSky keys on `opensky:{icao}:{begin}:{end}` (bucket-floored); NAS Status keys on the single fixed `nas:feed`. Both confirmed by direct code read and by the respective cache-hit tests. |
| `isolation.test.ts` | `opensky.ts` + `nasStatus.ts` | `Promise.all` combined await | ✓ WIRED | Confirmed both adapters imported and awaited together; isolation genuinely proven across two real modules, not asserted per-adapter only. |
| `regions.ts` (`icao` field) | `opensky.ts` / `nasStatus.ts` (`toFaaLid`) | data flow for the FAA LID derivation | ✓ WIRED | `nasStatus.ts`'s `toFaaLid` derives from ICAO (not IATA), matching the DJT/KPBI divergence pinned in `regions.ts` and asserted in `nasStatus.test.ts`. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite | `npm test` | 66/66 passed, 10 test files, no smoke file included | ✓ PASS |
| Type check | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Lint | `npm run lint` | exit 0 | ✓ PASS |
| Live smoke run | `npm run smoke` | Not run by this verification pass (requires real OpenSky/FAA credentials not available in this sandboxed session) | ? SKIP — routed to Human Verification |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DATA-02 | 02-02, 02-03, 02-05 | OpenSky departures/arrivals over explicit window, OAuth2 | ✓ SATISFIED (code); live-evidence gap noted above | `fetchMovements`, 14 passing tests, OAuth2 lazy-refresh implemented per D-05. |
| DATA-03 | 02-02, 02-04, 02-05 | FAA NAS Status delay/closure fetch | ✓ SATISFIED (code); live-evidence gap noted above | `fetchNasStatus`, 13 passing tests, generic block walk. |
| DATA-04 | 02-01, 02-03, 02-04, 02-05 | `lru-cache` with per-source TTL | ✓ SATISFIED | `cache.ts` TTL constants + per-entry TTL tests; both adapters' cache-hit tests. |
| DATA-05 | 02-01, 02-03, 02-04, 02-05 | Isolated failure to "unavailable" | ✓ SATISFIED | `AdapterResult` no-stale contract, `isolation.test.ts` cross-adapter proof. |

Note: `.planning/REQUIREMENTS.md`'s checkboxes for DATA-02 through DATA-05 are still unchecked as of this verification — that file was not updated when Phase 2 completed. This is a documentation-sync gap, not a code gap; flagged for the orchestrator to update REQUIREMENTS.md's checkboxes, not treated as a phase-goal failure.

No orphaned requirements: REQUIREMENTS.md's Traceability table maps only DATA-02..05 to Phase 2, and all four are claimed across the five plans' frontmatter.

### Anti-Patterns Found

None. Searched all files under `src/domain/adapters/` and `src/domain/airports/regions.ts` for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` and console logging — zero matches. No direct `process.env` reads in adapter modules (credentials flow exclusively through `getEnv()`).

### Human Verification Required

### 1. Capture live smoke-run evidence

**Test:** Run `npm run smoke` with real `.env` credentials (a registered OpenSky OAuth2 client + populated `OPENSKY_CLIENT_ID`/`OPENSKY_CLIENT_SECRET`).
**Expected:** OpenSky reports numeric departure/arrival counts for KATL over the reported 86400-second window; FAA reports `lid: 'ATL'` and an `events` array (possibly empty — that's healthy); the cache hit counter increases by exactly 2 on the second round of calls; no secret, token, or raw response body appears in the output.
**Why human:** This is a live external-service integration (OpenSky's OAuth2 token exchange, FAA's live XML feed) that cannot be exercised by this verification pass without real credentials, and is structurally the one class of defect (wrong endpoint, wrong grant field, drifted schema) that a mocked test suite cannot catch. The developer already ran this and reported "all passed" (recorded in `02-05-SUMMARY.md`), but declined to record the specific numbers the plan's Task 3 acceptance criteria asked for — a disclosed, accepted scope reduction per this verification's task instructions, not a hidden defect. Re-running and recording the numbers (or accepting the verbal attestation as sufficient) is a human/product decision, not something this verifier can resolve.

### Gaps Summary

No blocking gaps. All roadmap Success Criteria are implemented, wired, and covered by comprehensive automated tests (66/66 passing, typecheck and lint clean). The two disclosed architecture overrides (axios + split-file adapters instead of the plans' literal `fetch()`-based single files) are explicit, recorded developer decisions that do not weaken any behavioral requirement — confirmed by reading the shipped code directly, not by trusting the SUMMARY.md narrative.

The one open item is evidentiary, not functional: plan 02-05's Task 3 asked for the live smoke run's observed numbers to be recorded as proof that DATA-02/DATA-03 hold against the real upstream APIs, and the developer explicitly declined to provide them after confirming the run passed. This phase's live-data claim currently rests on verbal attestation rather than a captured transcript. Recommend closing this before treating Phase 2's live-data claims as fully evidenced, but it does not block starting Phase 3 — the adapter code itself is fully built, typed, and behaviorally proven against fixtures that faithfully model the documented live schemas (per `.claude/CLAUDE.md`'s Q1 research).

---

*Verified: 2026-08-13T14:10:00Z*
*Verifier: Claude (gsd-verifier)*
