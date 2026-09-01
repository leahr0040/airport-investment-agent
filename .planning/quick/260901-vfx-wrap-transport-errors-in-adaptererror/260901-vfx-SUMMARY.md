---
phase: quick-260901-vfx
plan: 1
status: complete
date: 2026-09-01
files_modified:
  - src/domain/adapters/errors.ts
  - src/domain/adapters/errors.test.ts
  - src/domain/adapters/opensky.client.ts
  - src/domain/adapters/opensky.client.test.ts
  - src/domain/adapters/faaFacility.client.ts
  - src/domain/adapters/faaFacility.client.test.ts
  - src/domain/adapters/nasStatus.client.ts
  - src/domain/adapters/nasStatus.client.test.ts
---

# Quick Task 260901-vfx: Wrap transport errors in AdapterError — Summary

## What changed

Transport failures now leave the adapter clients as `AdapterError`, matching
every other failure path in those files. `toNetworkError` in `errors.ts`
replaces the three copy-pasted `normalizeTimeout` helpers, and all five network
catch sites route through it — the OpenSky token POST and flight-leg GET, the
FAA ArcGIS query, and the NAS Status feed fetch.

The error's `code` becomes the `AdapterError` name, so the adapter log
distinguishes `ECONNABORTED` from `ECONNREFUSED` from `ENOTFOUND` where it
previously flattened everything to `AxiosError` (or, on the one path the old
helper covered, renamed it to `TimeoutError`). A thrown value with no usable
code falls back to `NetworkError`. The original error is attached as `cause`.

## Why the code, not a fixed name

`classify()` in `errors.ts` derives `detail` from `err.name` and reads neither
`context` nor `originalError` — verified nothing in `src/` touches those two
fields. The name is therefore the only field that reaches the log, so a fixed
`'NetworkError'` label would have discarded the timeout/refused/DNS distinction.
Codes originate in Node and axios internals rather than in upstream response
bodies, and `detail` stays server-side, so passing them through crosses no
trust boundary.

## Bug this removed

`Object.assign(err, { name: 'TimeoutError' })` mutated the error after V8 had
already materialized `err.stack`, so `toAdapterFailure` emitted a
self-contradicting line — `faa-adip: TimeoutError ... | AxiosError: timeout of
300ms exceeded`, with `detail` and the stack header disagreeing. Confirmed by
running a real axios timeout against a stalled local server before the change.

Also clears the duplication finding at `02-REVIEW.md:92`.

## Verification

- `npx tsc --noEmit` — clean, exit 0
- `npx vitest run` — 22 files, 129 tests, all passing
- `grep -rn normalizeTimeout src/` — no matches

## Behaviour unchanged

Every transport failure still classifies as `FailureKind.Unavailable`, so
`expansionScore` gates the volume/headroom/delay components exactly as before
and no analyst-facing output moves. Only the server-side log label changes.

## Deviations from plan

None.
