Phase: 4

Purpose
- Capture implementation decisions for Phase 4 (data sources + LLM choice) so research and planning agents can act without re-asking.

Locked Decisions
- Data sources:
  - OpenSky `/flights/*` for departure/arrival movements (requires OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET OAuth2 client). See src/domain/adapters/opensky.client.ts and src/domain/adapters/opensky.ts.
  - FAA ADIP ArcGIS layers (`NTAD_Aviation_Facilities`, `Runways_View`) for facility and runway geometry. See src/domain/adapters/faaFacility.client.ts and src/domain/adapters/faaFacility.ts.
  - FAA NAS status XML feed (`nasstatus.faa.gov`) for closures/delays. See src/domain/adapters/nasStatus.client.ts and src/domain/adapters/nasStatus.ts.
  - OurAirports CSV used as a cached reference table for IATA/ICAO resolution and `scheduled_service` filtering. See src/domain/airports/regions.ts.
  - Passenger counts (per-airport enplanements) are out-of-scope for v1 (BTS Socrata exists but is excluded by project constraints). Documented as a known alternative.

- Keys and joins:
  - Primary key for upstream flight data: ICAO airport codes (e.g., `KATL`). FAA ADIP has both `ICAO_ID` and `ARPT_ID` (FAA LID). Adapter logic will map `ICAO_ID` -> FAA LID (`ARPT_ID`) to join runways.

- Caching and TTLs (already implemented):
  - OPENSKY_TTL_MS = 5 minutes
  - NAS_STATUS_TTL_MS = 3 minutes
  - FAA_FACILITY_TTL_MS = 24 hours
  - Cache helper: src/domain/adapters/cache.ts (in-memory LRUCache)

- LLM choice:
  - Locked to Google Generative AI (Gemini) for the project/demo: `GOOGLE_GENERATIVE_AI_API_KEY` is required by src/config/env.ts.
  - Current repo does not include a top-level `ai` or Google SDK adapter; planner must add provider wiring (recommend `ai@7.x` + `@ai-sdk/google` or the official Google Generative SDK) and implement structured-output schemas (zod) for deterministic parsing.

Known Risks & Gaps
- OpenSky: requires a free OAuth2 client registration; tokens expire (~30m) and client must handle refresh and 429 rate limits. Measure credit costs for typical aggregator queries.
- nasstatus.faa.gov: known historical instability of alternate ASWS host; implement defensive parsing and graceful failure modes.
- FAA ArcGIS: does not provide enplanements or operations counts; runway and facility geometry are available and sufficient for capacity proxies.
- OurAirports: large flat CSV — treat as reference data fetched and cached at process start or at controlled refresh intervals, not per-request.
- No cross-instance rate limiter: project currently lacks a rate-limiter; implement in-memory per-session limiting for the demo and document production upgrade to Redis/Upstash.
- LLM provider wiring missing: env enforces Gemini key, but package.json lacks the provider package. Add integration and unit tests for structured-output behavior.

Immediate Research Tasks (for researcher agent)
- Verify OpenSky OAuth registration flow end-to-end (register client, exchange token, test `/flights/departure` and `/flights/arrival` calls). Target files: src/domain/adapters/opensky.client.ts, src/domain/adapters/opensky.aggregator.ts.
- Quantify OpenSky quotas/credits and approximated calls per user session (to size rate limits and caching buckets).
- Confirm nasstatus endpoint reachability from CI/deploy environment; capture sample XML and edge cases (missing blocks, empty fields).
- Confirm ArcGIS `Runways_View` returns lat/long endpoints and runway lengths for sample US airports (KATL, KSFO).
- Evaluate BTS Socrata passenger endpoints as a documented alternative (do not auto-adopt for v1).
- Propose an LLM adapter: either add `ai` + `@ai-sdk/google` (provider-agnostic) or `@google/generative-ai` direct SDK; produce minimal call examples and costing estimate.

Planner Tasks / Implementation Work
- Add LLM provider wiring and structured-output validation layers (Zod schemas). Update package.json and .env.example accordingly.
- Implement per-session in-memory token-bucket or sliding-window rate limiter keyed by session ID (or IP) for the chat endpoint; add tests.
- Add a lightweight startup step to fetch and cache OurAirports-derived lookup table (filtered to US large/medium airports with scheduled_service). Ensure adapter code uses the cached table.
- Add integration tests for OpenSky + aggregator using a mocked token and HTTP client (existing tests follow this pattern).
- Document required env vars and the exact registration steps in README or DEPLOY.md (include OPENSKY client registration link).

References (code locations)
- OpenSky client + aggregator: [src/domain/adapters/opensky.client.ts](src/domain/adapters/opensky.client.ts) | [src/domain/adapters/opensky.aggregator.ts](src/domain/adapters/opensky.aggregator.ts)
- FAA facility client + adapter: [src/domain/adapters/faaFacility.client.ts](src/domain/adapters/faaFacility.client.ts) | [src/domain/adapters/faaFacility.ts](src/domain/adapters/faaFacility.ts)
- NAS status: [src/domain/adapters/nasStatus.client.ts](src/domain/adapters/nasStatus.client.ts) | [src/domain/adapters/nasStatus.ts](src/domain/adapters/nasStatus.ts)
- Cache helper and TTLs: [src/domain/adapters/cache.ts](src/domain/adapters/cache.ts)
- Env validation: [src/config/env.ts](src/config/env.ts)
- Airports lookup: [src/domain/airports/regions.ts](src/domain/airports/regions.ts)

Next steps (this phase)
- Researcher: run live proof-of-concept calls for OpenSky and ArcGIS and report quotas/sample responses.
- Planner: propose package changes + rate-limiter design and schedule small PRs implementing them.

Sign-off
- If this captures decisions for Phase 4, confirm and I will (a) spawn researcher and planner tasks or (b) apply the initial wiring changes (LLM adapter + rate limiter) on approval.
