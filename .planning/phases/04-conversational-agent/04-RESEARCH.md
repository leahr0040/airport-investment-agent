Phase 4 — Research

Summary
- Consolidates prior findings for data sources and LLM selection required by Phase 4 (chat + tool-calling).

Findings (from 4-CONTEXT.md)
- Data sources: OpenSky `/flights/*` (OAuth2 client_id/secret), FAA ArcGIS (`NTAD_Aviation_Facilities`, `Runways_View`), FAA NAS status XML (`nasstatus.faa.gov`), OurAirports CSV as reference table.
- Keys/joins: OpenSky uses ICAO; FAA ArcGIS exposes `ICAO_ID` + `ARPT_ID` (FAA LID) for joins. OurAirports provides IATA↔ICAO mapping.
- Caching: per-source TTLs already defined in `src/domain/adapters/cache.ts`.
- LLM: project intends Gemini (Google) per `src/config/env.ts`, but `ai` + `@ai-sdk/google` or `@google/generative-ai` provider wiring is missing from the repo.

Outstanding Research Tasks
1. OpenSky registration flow
  - Register a free OpenSky OAuth2 client (obtain `client_id`/`client_secret`).
  - Implement and test client-credentials exchange; verify token refresh and 30m expiry behavior.
  - Exercise `/flights/departure` and `/flights/arrival` for sample airports (KATL, KSFO) and capture sample JSON responses and typical failure modes (empty `estDepartureAirport`, 403 without token, 429). Quantify credit cost per call.

2. FAA NAS status reachability
  - Confirm `nasstatus.faa.gov` XML responses from CI/deploy network.
  - Save a representative sample XML and enumerate missing/optional blocks to drive defensive parsing in adapter.

3. ArcGIS runway/facility fields
  - Verify `Runways_View` returns runway endpoints (lat/lon), `RWY_LEN`, and `RWY_WIDTH` for KATL and KSFO.
  - Capture JSON responses for test fixtures.

4. LLM provider wiring & cost
  - Evaluate `ai@7.x` + `@ai-sdk/google` vs `@google/generative-ai` direct SDK for structured-output support, streaming, and cost.
  - Produce minimal code examples for `generateObject`/schema-driven parsing with `zod` and expected token costs for typical chat requests.

5. Rate limiting design
  - Derive per-session token-bucket parameters from expected OpenSky call counts and Gemini token cost per analyst turn; propose conservative default (e.g., 5 analyst turns / minute, burst 10).

Deliverables
- `04-RESEARCH.md` (this file)
- Sample JSON/XML fixture files saved under `.planning/phases/04-conversational-agent/fixtures/` (researcher should add)
- Short register-and-test log for OpenSky (researcher artifact)

Notes
- Many items are already documented in `4-CONTEXT.md`. Researcher should perform live checks only when CI/network credentials are available; otherwise capture expected request/response examples and a decision record.
