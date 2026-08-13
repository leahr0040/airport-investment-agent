Phase 4 — Verification Checklist

Tracer verification (required)
- [ ] Scoring shim replaced or Phase 3 scoring engine wired and all scoring unit tests pass.
- [ ] `/api/chat` returns HTTP 200 and a narrated answer for the tracer query fixture.
- [ ] Narrated answer includes numeric values injected from the scoring engine's structured output (spot-check tests assert numbers match programmatic output).
- [ ] Intent parser (`parseIntent`) unit tests pass with mocked LLM responses; `zod` validation is exercised.
- [ ] Per-session rate limiting in place and tested (unit tests simulate bursts and assert limit behavior).
- [ ] User-supplied airport identifiers are validated against the cached reference table before any upstream call (tests for allowlist/lookup behavior).

Integration verification (optional, gated by `SMOKE_LIVE=true`)
- [ ] Live OpenSky calls succeed with OAuth2 client (requires OPENSKY_CLIENT_ID/SECRET in env) and sample `/flights/departure`/`arrival` calls return expected structure.
- [ ] FAA NAS sample XML fetched and adapter parses expected fields; defensive handling tested for missing blocks.
- [ ] ArcGIS runway queries return runway lengths and endpoints for sample airports.

UAT (analyst smoke)
- [ ] Analyst can run the app locally and, using `.env.example` setup, issue a query: "Compare KATL and KSFO for expansion" and receive a narrated answer with a ranked list and a short side-by-side KPI table.

Sign-off
- Tester: __________________
- Date: __________________
