---
status: testing
phase: 04-conversational-agent
source: [04-VERIFICATION.md]
started: 2026-08-20T16:15:00Z
updated: 2026-08-20T16:15:00Z
---

## Current Test

number: 1
name: Follow-up question resolves against prior turn (CHAT-03)
expected: |
  Sending "which New England airports are strong candidates?" followed by "what about Boston?" (or "why?") in the same session correctly resolves the second answer against the first turn's actual resolved airports and scores, not a fresh unrelated answer.
awaiting: user response

## Tests

### 1. Follow-up question resolves against prior turn (CHAT-03)
expected: The second answer resolves the ambiguous follow-up against the first turn's actual resolved airports and scores, not a fresh unrelated answer.
result: [pending]

### 2. Ranked list with real scores (QUERY-01)
expected: Asking "which New England airports are strong candidates?" produces a narrated answer formatted as a ranked list, with each airport's real score sourced from the score_airports tool result.
result: [pending]

### 3. Side-by-side KPI comparison with difference (QUERY-02)
expected: Asking "compare KATL and KSFO on movements per runway" produces a narrated answer stating both KPI values and their numeric difference, sourced from the real score_airports tool result.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
