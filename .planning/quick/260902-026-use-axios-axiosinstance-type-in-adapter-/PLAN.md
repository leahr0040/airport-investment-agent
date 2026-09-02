---
quick_id: 260902-026
slug: use-axios-axiosinstance-type-in-adapter-
date: 2026-09-02
---

# Use axios's AxiosInstance type in adapter clients, unify test doubles

## Why

Three hand-rolled `HttpClient` types (one per adapter client) describe a shape axios
already types. They cost three definitions, three `axios as unknown as HttpClient` casts
in production code, and eleven `as unknown as HttpClient` casts in tests — the last of
which mean the type never actually checked a double.

Decision: use the whole `AxiosInstance`, not `Pick<AxiosInstance, 'get' | 'post'>`.
A full `AxiosInstance` cannot be satisfied by a hand-built object, so both remaining
injection-style tests move to `vi.mock('axios')` — the pattern four of the six adapter
test files already use.

## Tasks

1. **types.ts** — delete `HttpResponse` (only the three clients imported it).
   `FailureKind` and `AdapterResult` unchanged.
2. **opensky.client.ts** — delete `export type HttpClient`;
   `private http: AxiosInstance = axios` (no cast — `AxiosStatic` extends `AxiosInstance`).
3. **nasStatus.client.ts** — delete local `type HttpClient`; same constructor change.
4. **faaFacility.client.ts** — delete `export type HttpClient`; same constructor change.
5. **test/helpers/axios.ts** (new) — `axiosResponse(status, data, request?)` and
   `econnaborted()`, both currently duplicated across test files.
6. **vitest.config.ts** — add `"@test"` alias.
7. **faaFacility.test.ts, opensky.test.ts, isolation.test.ts** — import the shared helpers,
   drop the local copies.
8. **faaFacility.client.test.ts, opensky.client.test.ts** — convert to `vi.mock('axios')`;
   remove all 11 casts and the `(mockHttp.get as ReturnType<typeof vi.fn>)` re-casts.

Behaviour must not change: status handling, `AdapterError` throws, `toNetworkError`
catches, and the `// OpenSky returns 404, not an empty 200...` comment all stay as-is.

## Verification

- `npx vitest run` — 129 tests passing before, all must still pass
- `npm run typecheck`
- `npm run lint`
