---
quick_id: 260901-g0s
description: OpenSky empty result is a measured zero, not a failure
date: 2026-09-01
status: complete
---

# Quick Task 260901-g0s — Summary

## What changed

`aggregateMovements` no longer reports an empty flight window as a failure. The rule the
adapter layer now follows: **the HTTP status decides success or failure; the payload's
contents never do.**

| File | Change |
|---|---|
| `src/domain/adapters/opensky.client.ts` | `requestLegUrl(url, token)` took **any** URL, so the `404 -> []` rule was reachable by any endpoint that later used it — wrong for `/states/*` and `/tracks/*`, where 404 is a real error. Merged with `buildFlightsUrl` (now private) into `fetchFlightLeg(icao, kind, window, token)`, scoping the rule by construction rather than by comment |
| `src/domain/adapters/opensky.aggregator.ts` | Deleted the `no_data` branch; inlined the two now-single-use count locals; tightened the raw-leg params from `[] \| undefined` to required arrays; dropped the `as AdapterResult<Movements>` cast |
| `src/domain/adapters/opensky.test.ts` | `'empty window (both legs 404) returns no_data'` replaced by a test asserting `ok: true` with zero counts |
| `src/domain/scoring/expansionScore.test.ts` | Added a test asserting the point of the change: an airport with zero traffic keeps all three components and ranks *below* a busy one |

## Behaviour delta

Before: an airport with zero traffic lost both its `volume` and `headroom` components,
`scoreAirports` reweighted onto delays alone, and a single-element `minMaxNormalize`
returned 50 — so a dead airport scored 50 and could outrank a measured one.

After: it scores with all three components, `passengerMovements: 0` normalizes to the
dataset floor, and it sinks to the bottom of the ranking — the true answer.

## Verification

```
npx tsc --noEmit   → clean
npx vitest run     → 22 files, 123 passed (122 before + the new scoring test)
```

## Evidence for the 404 decision

OpenSky's own REST docs (openskynetwork.github.io/opensky-api/rest.html):

> "If no flights are found for the given period, HTTP stats 404 - Not found is returned
> with an empty response body."

The client's `404 -> []` was therefore correct all along — it decodes a documented
non-standard dialect at the adapter boundary, which is what an adapter is for. It was only
missing its citation. The defect was one layer down, where the aggregator translated that
`[]` back into a failure.

## Follow-on: two vocabularies for failure

`AdapterFailReason` (5 values) was being serialized straight into the agent's context, and
through it into the analyst's narrative. `rate_limited` in particular is an oracle: it
confirms to a client that quota exhaustion is working, which the project's own rate-limiting
requirement exists to prevent.

Split into an internal and an outward vocabulary:

| | Values | Audience |
|---|---|---|
| `AdapterFailReason` | `timeout`, `rate_limited`, `error`, `no_data`, `invalid_input` | adapters + `console.warn` in `errors.ts` |
| `PublicFailReason` | `no_data`, `invalid_input`, `unavailable` | anything crossing to the agent or the browser |

`toPublicFailReason()` maps between them. `no_data` and `invalid_input` survive because they
are facts about the request and the world, not about our infrastructure — and `invalid_input`
in particular lets the LLM correct a bad ICAO it chose itself. Everything else collapses to
`unavailable`.

Applied at every outward emission point: `ComponentUnavailable.reason` in `expansionScore.ts`
and the three `reason` fields in `tools.ts`. `AdapterFailReason` no longer appears in either
module — `grep -rn AdapterFailReason src` now returns only `domain/adapters/`, which makes the
boundary checkable in one command.

`errors.ts` gained a `console.warn` so the specific reason is relocated to the operator rather
than deleted; without it this change would have been a security improvement bought with an
operational regression.

## Deferred

- Narrowing `aggregateMovements`'s return type to `Movements` now that it cannot fail.
  Requires moving the `AdapterResult` wrap into `opensky.ts` **inside** the `withCache`
  callback — outside it, `fetchedAt` would be recomputed on every cache hit and claim a
  freshness the data does not have.
- `'no_data'` remains in `AdapterFailReason`, still correct in `faaFacility.ts:42` (no
  `FaaFacility` object exists to return) and `headroomReason` in `expansionScore.ts:103`
  (a derived label, not a fetch failure).
