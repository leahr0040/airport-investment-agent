---
quick_id: 260902-026
slug: use-axios-axiosinstance-type-in-adapter-
date: 2026-09-02
status: incomplete
commit: pending user approval
---

# Summary

All edits applied and verified; commit held back per the user's standing rule to propose
rather than run commits while a diff is under review.

## Changed

**Production (−22 lines)**
- `types.ts` — `HttpResponse` deleted; `FailureKind` / `AdapterResult` untouched.
- `opensky.client.ts` — `export type HttpClient` deleted; `private http: AxiosInstance = axios`.
- `nasStatus.client.ts` — local `type HttpClient` deleted; same constructor change.
- `faaFacility.client.ts` — `export type HttpClient` deleted; same constructor change.

Three `axios as unknown as HttpClient` casts became plain assignments — `AxiosStatic`
extends `AxiosInstance`, so no cast is needed.

**Tests (−78 lines net)**
- `test/helpers/axios.ts` (new) — `axiosResponse(status, data, request?)` (was duplicated in
  `faaFacility.test.ts` + `opensky.test.ts`) and `econnaborted()` (was duplicated in
  `opensky.test.ts` + `isolation.test.ts`). The optional `request` param is new: it lets a
  future test assert on the `method`/`path` the error context reports, which no double
  could supply before.
- `faaFacility.client.test.ts`, `opensky.client.test.ts` — converted from constructor-injected
  doubles to `vi.mock('axios')`. All 11 `as unknown as HttpClient` casts and both
  `(mockHttp.get as ReturnType<typeof vi.fn>)` re-casts removed. The one remaining cast,
  `asClientWithToken`, is deliberate — it reaches a private field.
- `faaFacility.test.ts`, `opensky.test.ts`, `isolation.test.ts` — local helper copies replaced
  with the shared import.
- `vitest.config.ts` + `tsconfig.json` — `@test` path alias.

## Verification

- `npx vitest run` — 129 passed / 129 (same count as before the change)
- `npm run typecheck` — clean
- `npm run lint` — 4 errors, all pre-existing in `expansionScore.test.ts` (confirmed by
  re-running with this change stashed). Not touched here.

## Note

`src/domain/adapters/cache.ts`, `test/setup.ts`, `vitest.config.ts` (setupFiles/fakeTimers/
sequence) and `src/probe.test.ts` carry concurrent edits from another session that replace
`ttlResolution: 0` with an `afterEach` timer drain. Only the `@test` alias line in
`vitest.config.ts` belongs to this task; the rest of that file's diff is theirs.
