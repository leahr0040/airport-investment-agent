---
phase: quick-260901-vfx
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/domain/adapters/errors.ts
  - src/domain/adapters/errors.test.ts
  - src/domain/adapters/opensky.client.ts
  - src/domain/adapters/opensky.client.test.ts
  - src/domain/adapters/faaFacility.client.ts
  - src/domain/adapters/faaFacility.client.test.ts
  - src/domain/adapters/nasStatus.client.ts
  - src/domain/adapters/nasStatus.client.test.ts
autonomous: true

must_haves:
  truths:
    - "A transport-layer failure (timeout, refused connection, DNS failure) thrown out of any adapter client is an AdapterError, the same type every other failure path in those clients already throws — not a raw AxiosError."
    - "The failure's identity survives into the adapter log: an axios timeout reports ECONNABORTED, a refused connection ECONNREFUSED, a DNS failure ENOTFOUND, rather than the single undifferentiated label AxiosError."
    - "A thrown value with no usable code falls back to the name NetworkError instead of producing an AdapterError named 'undefined'."
    - "The ECONNABORTED-to-TimeoutError rename no longer exists in any of the three adapter clients; one helper in errors.ts replaces all three copies."
    - "Scoring behaviour is unchanged: every transport failure still classifies as FailureKind.Unavailable, so expansionScore gates each component exactly as before."
    - "npx vitest run exits 0."
  artifacts:
    - "src/domain/adapters/errors.ts — exported toNetworkError(err) helper"
    - "src/domain/adapters/opensky.client.ts — normalizeTimeout deleted, two catch sites wrap via toNetworkError"
    - "src/domain/adapters/faaFacility.client.ts — normalizeTimeout deleted, queryFeatures wraps via toNetworkError"
    - "src/domain/adapters/nasStatus.client.ts — normalizeTimeout deleted, fetchCachedFeed wraps via toNetworkError"
---

# Quick Task 260901-vfx: Wrap transport errors in AdapterError

## Problem

The three adapter clients each threw a raw `AxiosError` out of their network
`catch` blocks, while every other failure path in the same files throws an
`AdapterError` with a chosen name and `FailureKind`. Three copy-pasted
`normalizeTimeout` helpers papered over one symptom of this — they renamed an
`ECONNABORTED` error to `TimeoutError` so the adapter log would say "timeout"
— but they only covered axios's own timeout, missed every other transport
failure, and were flagged as duplication in `02-REVIEW.md` (issue at line 92).

The rename was also self-contradicting at runtime: `Object.assign(err, {name})`
mutates the error after V8 has materialized `err.stack`, so the emitted log line
read `faa-adip: TimeoutError ... | AxiosError: timeout of 300ms exceeded` —
`detail` and the stack header disagreeing on the same line.

## Approach

One helper in `errors.ts`, next to `AdapterError` and `toAdapterFailure`, used
by all five catch sites. The error's `code` becomes the `AdapterError` name,
because `classify()` derives `detail` from `err.name` and reads neither
`context` nor `originalError` — the name is the only field that reaches the log.
Codes originate in Node/axios internals rather than the response body, and
`detail` stays server-side, so no sanitization boundary is crossed.

## Tasks

### Task 1: Add `toNetworkError` and route all five catch sites through it

**Files:** `src/domain/adapters/errors.ts`, `opensky.client.ts`,
`faaFacility.client.ts`, `nasStatus.client.ts`

**Action:**
- Export `toNetworkError(err: unknown): AdapterError` from `errors.ts`. Name it
  `err.code` when that is a string, else `NetworkError`; kind
  `FailureKind.Unavailable`; original error passed through as `cause`.
- Delete `normalizeTimeout` from all three clients.
- Replace each `catch (err) { throw this.normalizeTimeout(err); }` with
  `catch (err) { throw toNetworkError(err); }` at: the OpenSky token POST, the
  OpenSky flight-leg GET, the FAA ArcGIS `queryFeatures` GET, and the NAS Status
  feed GET.

**Verify:** `npx tsc --noEmit`

**Done:** No `normalizeTimeout` remains in `src/`; every client network catch
throws an `AdapterError`.

### Task 2: Update tests to the new contract

**Files:** `errors.test.ts`, `opensky.client.test.ts`,
`faaFacility.client.test.ts`, `nasStatus.client.test.ts`

**Action:**
- Rewrite the three `normalizes a real axios ECONNABORTED timeout...` cases to
  assert the wrapped contract: rejects with `{ name: 'ECONNABORTED', kind: 'unavailable' }`.
- Add an `errors.test.ts` case covering the no-code fallback to `NetworkError`,
  and one confirming a coded error keeps its code as the name.

**Verify:** `npx vitest run`

**Done:** Suite green, transport-failure contract covered at both the client and
the `errors.ts` level.
