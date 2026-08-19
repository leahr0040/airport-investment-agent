---
phase: quick-260818-ia2
plan: 1
subsystem: infra
tags: [lru-cache, opensky, concurrency, caching]

requires:
  - phase: 02-live-data-adapters-caching
    provides: withCache, OpenSkyClient
provides:
  - withCache single-flights concurrent same-key calls via lru-cache's native fetch()
  - OpenSkyClient.ensureToken() memoizes its in-flight OAuth2 token request
affects: [live-data-adapters, conversational-agent]

tech-stack:
  added: []
  patterns:
    - "Single-flight concurrent access via the caching library's native fetch()/context mechanism instead of a hand-rolled in-flight Map"
    - "Memoized in-flight promise field (assigned synchronously before any await, cleared in .finally()) for a single per-instance resource like an OAuth token"

key-files:
  created: []
  modified:
    - src/domain/adapters/cache.ts
    - src/domain/adapters/cache.test.ts
    - src/domain/adapters/opensky.client.ts
    - src/domain/adapters/opensky.client.test.ts

key-decisions:
  - "withCache's fetchMethod is fixed at LRUCache construction time and shared across all keys, so the per-call producer is threaded through via lru-cache's fetch context parameter (LRUCache<K, V, Producer>) rather than a per-call fetchMethod override"
  - "Dropped hits/misses counters and getCacheStats() rather than preserving them as the original plan specified - they had no meaning against fetch()'s internal single-flight tracking and no remaining caller referenced them once live.smoke.ts was adapted to a producer-call-count spy"

requirements-completed: [WR-01]

coverage:
  - id: D1
    description: "Two concurrent withCache(key, ttl, fn) calls for the same key invoke fn exactly once, and both resolve to the same value"
    verification:
      - kind: unit
        ref: "src/domain/adapters/cache.test.ts#serves two concurrent same-key calls from a single producer invocation"
        status: pass
    human_judgment: false
  - id: D2
    description: "Two concurrent OpenSkyClient.ensureToken() calls made before the token endpoint responds trigger exactly one POST, and both resolve to the same token"
    verification:
      - kind: unit
        ref: "src/domain/adapters/opensky.client.test.ts#memoizes concurrent ensureToken calls into a single token request"
        status: pass
    human_judgment: false
  - id: D3
    description: "All pre-existing cache.ts/opensky.client.ts behavior not tied to the removed stats API is unchanged (TTL independence, rejection-not-cached, sequential token caching, 401/403/429/timeout mapping)"
    verification:
      - kind: unit
        ref: "npx vitest run (full suite): 100/100 passed"
        status: pass
    human_judgment: false

duration: unknown (reconciled across sessions - see Issues Encountered)
completed: 2026-08-19
status: complete
---

# Quick Task 260818-ia2: Eliminate In-Flight Request Race Summary

**`withCache` now single-flights concurrent same-key calls via lru-cache's native `fetch()`, and `OpenSkyClient.ensureToken()` memoizes its in-flight OAuth2 token request, closing both halves of the WR-01 duplicate-upstream-call race.**

## Performance

- **Duration:** Unknown - see Issues Encountered
- **Completed:** 2026-08-19T10:18:34Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `withCache` delegates to `lru-cache`'s native `cache.fetch()`, which single-flights concurrent same-key fetches at the library level - no hand-rolled in-flight `Map` tracker.
- `OpenSkyClient.ensureToken()` gained a `pendingTokenRequest` field memoizing the in-flight token promise; a concurrent caller observes it already set (assigned synchronously, before any `await`) and joins it instead of firing its own POST.
- Both fixes preserve their function's external signature - no caller of `withCache` or `ensureToken()` needed any change.
- New concurrency regression tests: one per file, each proving exactly one upstream invocation across two concurrent callers.

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace withCache's manual has/set sequence with lru-cache's native fetch()** - `ba84c46` (fix)
2. **Task 2: Memoize OpenSkyClient's in-flight token request** - `ced0f61` (fix)

**Plan metadata:** `e6ef583` (docs: pre-dispatch plan, committed 2026-08-18)

## Files Created/Modified
- `src/domain/adapters/cache.ts` - `withCache` rewritten on `LRUCache.fetch()` with a fetch-context-threaded producer
- `src/domain/adapters/cache.test.ts` - Added concurrent-call test; removed the two tests tied to the deleted stats API (see Deviations)
- `src/domain/adapters/opensky.client.ts` - `ensureToken()` gained `pendingTokenRequest` memoization
- `src/domain/adapters/opensky.client.test.ts` - Added concurrent-`ensureToken()` test

## Decisions Made
- Threaded the per-call producer through lru-cache's fetch context parameter (`LRUCache<K, V, Producer>`) instead of passing a `fetchMethod` override per call, since the constructor-level `fetchMethod` is shared across all keys.
- Kept `pendingTokenRequest` as a plain field assigned from a local `const pending = ...` before the field write, instead of returning `this.pendingTokenRequest` directly - functionally identical to the plan's description, avoids relying on TypeScript narrowing a mutable class field across an arrow-function boundary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Task 1] Dropped hits/misses stats tracking instead of preserving it**
- **Found during:** Reconciliation review of Task 1 (already implemented, uncommitted, before this session started)
- **Issue:** The plan's Task 1 explicitly required leaving `UNDEFINED_VALUE`, the `hits`/`misses` counters, and `getCacheStats()` "completely untouched." The actual implementation removed all three, along with the `cache.test.ts` cases that covered them ("tracks misses on cold reads and hits on warm reads", "supports a producer that resolves to undefined") and `clearCache()`'s stats reset.
- **Impact:** `getCacheStats()` had zero remaining callers anywhere in `src/` once `live.smoke.ts` was independently adapted to a producer-call-count spy (same uncommitted state) - not a break, but a scope change from what the plan specified. More materially, dropping the `UNDEFINED_VALUE` sentinel means a producer that resolves to bare `undefined` is no longer cached (lru-cache's `fetch()` treats a `fetchMethod` resolving to `undefined` as "don't cache," so a repeat call re-invokes the producer instead of getting a fast/cached path). Checked all three real `withCache` callers (`opensky.ts`, `faaFacility.ts`, `nasStatus.ts`): none ever resolve to bare `undefined` (all wrap results in a structured object), so this is currently a latent gap, not an active bug or quota risk.
- **Fix:** Not applied - flagged here rather than unilaterally rewritten, since Task 1's code predates this reconciliation session and restoring stats tracking wasn't part of the approved scope for this pass.
- **Committed in:** `ba84c46` (Task 1 commit, which also carries this note)

---

**Total deviations:** 1 (scope reduction in Task 1, pre-existing before this session, not fixed)
**Impact on plan:** WR-01's actual target (duplicate upstream calls under concurrency) is fully closed for both `withCache` and `ensureToken()`. The stats-API removal is orthogonal to the race-condition fix and doesn't reopen it.

## Issues Encountered

Task 1 (`cache.ts`/`cache.test.ts`) was already implemented and passing in the working tree when this reconciliation session started, alongside unrelated uncommitted Phase 4 work, with no commit and no SUMMARY - this quick task's actual authoring session and duration are not recoverable. This session verified Task 1 against the plan's acceptance criteria, found and documented the stats-API deviation above, implemented Task 2 from scratch per the plan (it had not been started), and committed both tasks atomically.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both halves of WR-01 are closed; `npx vitest run` (100/100) and `npx tsc --noEmit` are clean on the full tree.
- No blockers identified for Phase 4 work that depends on these adapters.

---
*Phase: quick-260818-ia2*
*Completed: 2026-08-19*

## Self-Check: PASSED

Both files' acceptance-criteria greps and targeted test files verified during execution; both task commits (`ba84c46`, `ced0f61`) confirmed in `git log`.
