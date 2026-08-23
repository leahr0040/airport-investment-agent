# Phase 03 — Deterministic Scoring Engine — REVIEWS

Phase: 03
Scope: Deterministic scoring engine adapter and FAA ArcGIS facility client (plan 03-01, 03-02)
Review date: 2026-08-13

Included reviewers: Gemini (project default), Claude (doc presence), Codex (local agent)

---

## Gemini — Summary
- Strengths: Plan is well-scoped; clear must-haves and test-first red/green tasks. Cache TTL and threat model are appropriate.
- Concerns:
  - A deleted Phase-1 data source (DATA-01) remains a blocker unless restored or the scoring formula is adjusted (noted in STATE.md).
  - Requirement that no network I/O occur inside the scorer is preserved, but several tests assume precise axios mock shapes — verify test fixtures match `opensky.client` style.
  - `isValidIata` re-validation of ArcGIS `ARPT_ID` is correct; however, the plan must document the exact validation regex/logic to avoid surprises.
- Suggested fixes:
  - Add a short, explicit entry in `03-CONTEXT.md` stating whether DATA-01 will be rebuilt now (per-request) or the capacity signal is dropped. Link to decision.
  - Extract and document the `isValidIata` rule in `validate.ts` (or reference existing impl) and reference it in tests.

---

## Claude — Summary
- Strengths: Threat model (STRIDE) is thorough; test acceptance criteria are measurable and realistic.
- Concerns:
  - The plan depends on ArcGIS live-layer constants that were previously deleted; confirm those literals remain valid (sanity-check test or a smoke integration guarded by env flag).
  - Naming choice `faaLid` avoids silent assumption but requires consumer code (scorer) to map to IATA if needed for displays — add a small doc note.
- Suggested fixes:
  - Add a single-line smoke-check script (opt-in via env) that fetches ATL and asserts `features.length >= 1` to detect broken base URL early (do not run in CI by default).
  - In `03-02-PLAN.md`, add explicit conversion guidance for UI layers that expect IATA vs `faaLid`.

---

## Codex (local agent) — Summary
- Strengths: Tests-first approach, explicit cache behavior, and explicit handling of ArcGIS 200-with-error cases are excellent for robustness.
- Concerns / Practical notes:
  - Several tests reference network-timeout normalization (`ECONNABORTED`) and `toAdapterFailure`; ensure the helper functions exist and are exported as expected.
  - The plan's `verify` step lists repo-wide lint/tsc/test runs — given the repo currently has Phase-2 in-flight, run full `npm test` only after the new modules are added.
- Actionable items:
  - Create `03-01-SUMMARY.md` after implementing the adapter (automated artifact, per plan).
  - Add `FAA_FACILITY_TTL_MS` constant to `cache.ts` as specified and run unit tests locally.

---

## Consolidated Recommendations (short)
- Decide DATA-01: rebuild per-request now or drop physical-capacity signal. Record decision in `03-CONTEXT.md`.
- Add a single-line dev smoke-check (opt-in) to verify the ArcGIS base URL and layer names before relying on them in a live run.
- Keep the test-first contract: write the two test files exactly as specified, then implement the client and adapter to satisfy them.

---

## Machine-friendly notes (for `gsd-plan-phase --reviews` ingestion)
{ "phase": 3, "reviewers": ["gemini","claude","codex"], "blocking": ["DATA-01 decision"], "actions": ["document DATA-01 decision","add FAA_FACILITY_TTL_MS","add optional ArcGIS smoke-check"] }
