---
status: resolved
phase: 02-live-data-adapters-caching
source: [02-VERIFICATION.md]
started: "2026-08-13T14:10:00Z"
updated: "2026-08-13T14:15:00Z"
---

## Current Test

number: 1
name: Both adapters return real, non-fixture data from the live OpenSky and FAA endpoints
expected: |
  OpenSky reports non-negative departure/arrival counts for KATL over the stated 86400s window;
  FAA reports lid 'ATL' and an events array; cache hit counter increases by 2 on the second round
  of calls; no secret/token/raw body is printed.
awaiting: none - resolved

## Tests

### 1. Both adapters return real, non-fixture data from the live OpenSky and FAA endpoints
expected: OpenSky returns ok:true with numeric counts over an 86400s window; FAA returns ok:true with lid ATL; cache hit counter increases by exactly 2 on the second round; no secret is printed.
result: passed - developer ran `npm run smoke` against a real OpenSky OAuth2 client and reported "all passed." Itemized counts/lid/events were not captured (developer declined when asked, see 02-05-SUMMARY.md Deviations) - accepted as sufficient evidence per explicit developer direction.

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None. The evidentiary detail gap (exact counts not recorded) is documented in 02-05-SUMMARY.md as an accepted, disclosed scope reduction, not an open gap requiring further action.
