---
phase: 04
slug: conversational-agent
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-23
---

# Phase 04 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Upstream FAA NAS Status XML (`NasStatusEvent.reason`/`.raw`/`.type`) -> `runway_conditions` tool result -> Gemini LLM context | Untrusted third-party free text crossing into LLM context — the SEC-04 boundary extended to this new tool. | Airport closure/delay reason text, timestamps |
| Upstream OpenSky-inferred `estArrivalAirport` strings -> `flight_destinations` tool result -> Gemini LLM context | Untrusted upstream-inferred identifier strings crossing into LLM context. | Inferred destination airport codes |
| LLM-supplied `icaos` tool-call args -> outbound FAA ArcGIS / FAA NAS Status / OpenSky URLs | LLM/analyst-influenced input reaching an outbound HTTP call keyed by airport code. | Airport identifier strings |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-04-01 | Tampering | `runwayConditionsTool` delay-event projection (`tools.ts`) | high | mitigate | `classifyDelayType` reduces `.type` to a fixed enum via keyword match (never echoes raw string); `sanitizeTimestampLike` allowlists `.start`/`.reopen` against `/^[0-9TZ:\-/ ]+$/`; `.reason`/`.raw` are never forwarded. Verified in `tools.ts:111-134` and covered by `tools.test.ts:105-119`. | closed |
| T-04-02 | Tampering | `flightDestinationsTool` destinations projection (`tools.ts`) | medium | mitigate | `estArrivalAirport` values filtered through `isValidIcao` before inclusion (`tools.ts:91`); malformed/unexpected upstream strings are dropped, never passed through verbatim. | closed |
| T-04-03 | Spoofing (prompt injection via tool-result content) | Gemini `functionResponse` parts carrying tool results (`google.ts`) | low | accept | Tool results are returned as `functionResponse` data parts, not natural-language instructions, per the existing SEC-04 architecture; T-04-01/T-04-02 further reduce what upstream text could reach this boundary. | closed |
| T-04-04 | Tampering (malformed identifier reaching an outbound call) | `icaos` args on tools reaching `fetchFaaFacility`/`fetchNasStatus`/`fetchMovements` | medium | accept | Each adapter gates its own outbound call behind `isValidIcao(icao)` (`faaFacility.ts:36`, `nasStatus.ts:84`, `opensky.ts:16`) — a malformed code short-circuits to `{ok:false, reason:'invalid_input'}` before any URL is built. | closed |
| T-04-05 | Denial of Service (upstream quota exhaustion via wider tool fan-out) | Two new array-accepting tools increase OpenSky/FAA call volume per chat turn | medium | accept | `MAX_TOOL_ROUNDS = 4` bounds total tool calls per turn; the pre-existing `MAX_AIRPORTS_PER_QUERY` cap gap (tracked in STATE.md, 2026-08-19) applies identically to `score_airports` today and is out of scope per 04-CONTEXT.md's Deferred Ideas. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-04-01 | T-04-03 | Tool results delivered as structured `functionResponse` data parts, not free text the model interprets as instructions; residual risk is low given T-04-01/T-04-02 mitigations upstream. | Phase 04 plan (04-02-PLAN.md) | 2026-08-23 |
| AR-04-02 | T-04-04 | Pre-existing per-adapter `isValidIcao` gating already covers this path; unchanged by this phase. | Phase 04 plan (04-02-PLAN.md) | 2026-08-23 |
| AR-04-03 | T-04-05 | `MAX_TOOL_ROUNDS` bound and pre-existing airport-count cap gap are explicitly deferred per 04-CONTEXT.md. | Phase 04 plan (04-02-PLAN.md) | 2026-08-23 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-23 | 5 | 5 | 0 | /gsd-secure-phase (L1 grep-depth, register authored at plan time) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-23
