# Project Research Summary

**Project:** Airport Investment Intelligence Agent
**Domain:** Conversational AI agent over live public aviation APIs, with a deterministic scoring engine - Next.js + TypeScript, 24-hour take-home project (FDE)
**Researched:** 2026-08-12
**Confidence:** MEDIUM-HIGH

## ⚠ User Decisions That Supersede This Research

These were decided by the user AFTER the research below was written. Where the body of this
document conflicts with anything here, **these win**. Do not re-argue them.

1. **For v1, every credential is REQUIRED in `.env`. No degraded mode, no fallback path.**
   The "guaranteed-demoable floor", the "no-LLM-key degraded mode", and the "regex/keyword
   fallback dispatcher" described below are **CUT FROM SCOPE**. The app validates
   `OPENSKY_*` and one LLM key at startup and fails loudly with a message naming the missing
   variable. Rationale: dropping the dual-path requirement buys back hours for scoring depth,
   which is what the requirements actually grades. Accepted cost: a reviewer without keys sees an
   error, not a partial demo — mitigated by `.env.example` and README.
   *Forward-looking: optional env keys may be introduced later (a feature-flagged extra data
   source, say). So config should be read through a single validated env module with a clear
   required-vs-optional distinction, even though nothing is optional today. Do not build
   fallback behaviour for this — just don't hard-code the assumption that every key is mandatory
   into a dozen call sites.*
   *Also note: the tools layer should still be plain callable functions rather than LLM-only —
   that is good design and keeps the engine unit-testable — but no second user-facing
   dispatcher or fallback form gets built.*

2. **Airport identity comes from the FAA ArcGIS API at startup, cached. No bundled CSV.**
   This reverses the "bundled OurAirports CSV reference table" recommendation below. We
   already call FAA ArcGIS for runway data, so identity from the same source means one
   fewer data source and zero bundled datasets — the truest reading of live-APIs-only.
   Fetched once at boot into `lru-cache` with a long TTL, so it is not a per-request call.
   The fetched list still serves as the SSRF allowlist. OurAirports is now an *alternative
   considered*, not the plan.

3. **No database.** MySQL considered and rejected — no users, no joins, nothing too
   expensive to compute live, and a required DB server would make the demo fragile.

4. **Caching uses the `lru-cache` package**, in memory, per-source TTLs — overriding the
   hand-rolled-cache recommendation below.

5. **BTS passenger data via Socrata: found, evaluated, declined for v1.** Settled, not open.

6. **Gemini 2.5 Flash is the ONLY LLM provider.** Claude Haiku 4.5 is dropped entirely —
   no primary/fallback pair, no multi-provider selection logic, one provider package and
   one env var. Rationale: Flash's free no-credit-card tier is what lets both the user and
   the reviewer run the app at all, and the dual-provider plan defeated its own argument
   (if the AI SDK makes swapping a one-line change, there is no reason to build both).
   Accepted cost: free-tier rate limits (~10 rpm) and no second path if Gemini is down.

## Executive Summary

This is a chat agent that ranks US airports as terminal-expansion investment candidates, built to satisfy an explicit project requirements: deterministic scoring not only LLM output, clear communication of assumptions/uncertainty, and strong security guardrails - all in ~24 hours. Research across all four domains converges on one build philosophy: a pure, LLM-free scoring core fed by independently-failable data adapters, with the LLM strictly confined to intent-parsing and narration over already-computed numbers. This is not just an architectural nicety - it is the only way to make the Core Value ("every number is traceable to a deterministic computation") a structural fact instead of an aspiration, and it is also what makes the no-LLM-key degraded mode free (the same tool functions get called by an LLM tool-loop or by a regex keyword dispatcher).

The central data tension the user must accept: passenger counts, load factor, gate capacity, and declared runway capacity are NOT obtainable from any live, keyless/near-keyless API. What survives contact with real data is a flight-movement-and-facility-based scoring engine (OpenSky movement counts + FAA delay/closure status + FAA/OurAirports runway and facility data), with passenger-side and demand-side KPIs demoted to explicitly labeled proxies.
Two credential dependencies must degrade gracefully: OpenSky per-airport /flights/* endpoints require a free OAuth2 client (5-minute registration, not truly keyless), and no LLM key exists yet. The guaranteed-demoable floor - reachable with zero external credentials - is: airport resolution, runway/facility data, FAA NAS status, and a keyword-driven fallback UI producing real (if partial) scores.
Register the OpenSky OAuth2 client before building; wire the LLM behind a provider-agnostic interface (Vercel AI SDK) so a reviewer with only a free Gemini key still gets the full experience.

The two biggest risks are not exotic: (1) the LLM narrating a number the scoring engine never produced (mitigated structurally - UI renders from tool-result JSON, plus a post-hoc numeric provenance check, never by prompting alone), and (2) burning the 24-hour budget on chat UI polish instead of scoring depth, when the requirements explicitly rewards the opposite.
A close third is domain-specific: the project sample questions (Anchorage long-haul %, LA vs. Santa Ana) are constructed to expose exactly the two traps documented in PITFALLS.md - ANC cargo/technical-stop traffic inflating a naive long-haul metric, and "LA"/"Santa Ana" ambiguity - so those must be treated as first-class scoring/resolution work, not edge-case polish.

## Key Findings

### Recommended Stack

Next.js 16 + TypeScript is already fixed by the environment (Python is unusable on this Windows machine). The linchpin finding is the live-API data landscape: OpenSky Network /flights/departure and /flights/arrival (ICAO-keyed, movement counts + O-D pairs) require a free OAuth2 client - not the fully anonymous /states/all snapshot endpoint many would assume covers this.
FAA nasstatus.faa.gov (delay/closure status) and FAA ArcGIS ADIP/NASR (Runways_View, NTAD_Aviation_Facilities) are both genuinely keyless and live-verified. OurAirports CSVs serve as the bundled airport-identity/geometry reference table (IATA/ICAO/name/coordinates), fetched once, not per-request.
Commercial flight APIs (AviationStack, AeroDataBox, FlightAware, Amadeus) are all ruled out as core-path - quota-starved, undocumented free tiers, or (Amadeus) fully shut down as of July 2026.

**Core technologies:**
- Next.js 16 + TypeScript (App Router, API routes) - only viable stack given Python unavailability; single repo covers UI, API, and scoring
- ai (Vercel AI SDK) plus AI SDK provider packages for Anthropic and Google - provider-agnostic LLM layer; makes the "no LLM key" and "reviewer may only have a free key" requirements a config swap, not a rewrite
- Claude Haiku 4.5 (primary) / Gemini 2.5 Flash (free-tier fallback) - cheapest capable models with reliable structured output; LLM cost is trivial at this volume, so reliability/SDK ergonomics dominate the choice
- zod - one schema library for both LLM structured-output validation and the SSRF-prevention allowlist check
- lru-cache (in-memory, per-source TTLs) for the adapter cache, plus a hand-rolled in-memory token-bucket rate limiter - DECIDED: overrides STACK.md initial hand-rolled-cache recommendation; the user chose a maintained package for correct TTL/eviction semantics over a hand-rolled Map. Accepted cost: memory-only cache means a process restart drops the cache and re-spends OpenSky quota; a disk tier is deferred behind the same interface if ever needed.

### Expected Features

The project sample questions map directly and completely onto: region/fuzzy resolution, deterministic composite scoring, ranking, pairwise single-KPI comparison, great-circle haul classification, and causal "why" explanation via componentized score breakdown. There is no shortcut available on entity resolution or componentized scoring - both are load-bearing for every sample question.

**Must have (table stakes):**
- Airport identity resolution + disambiguation (name/IATA/ICAO/region to code, with ambiguity surfaced, not guessed)
- Region-to-airport lookup (New England at minimum, as static curated data)
- Deterministic, componentized Expansion Opportunity Score (pure TypeScript, zero LLM)
- Live data ingestion: OpenSky movements + O-D pairs, FAA NAS status, FAA/OurAirports runway/facility data
- Multi-airport ranking + single-KPI pairwise comparison
- Great-circle haul-length classifier with a cited, explicit threshold
- Causal "why" explanation reusing the score component breakdown
- Assumption/uncertainty/confidence statement on every answer
- Security guardrails: server-side secrets, allowlist validation, per-session rate limiting, untrusted-input treatment of upstream text
- Chat UI with session-scoped multi-turn context
- No-LLM-key degraded mode (architectural, not a separate feature)

**Should have (differentiators, mostly free - decorate data the table-stakes layer already produces):**
- Componentized score exposed in every answer (not a black-box number)
- Real domain vocabulary cited (declared/sustainable capacity, IATA LoS, ACRP DDFS, slot control)
- "What would change this answer" sensitivity statements
- Data-freshness timestamps + staleness flags per KPI
- Slot-controlled-airport special case (JFK/LGA/DCA) as a verifiable unmet-demand proxy
- Confidence tiering (HIGH/MEDIUM/LOW) tied to a concrete, inspectable rule (e.g., sample size)
- Unit tests / golden-answer fixtures proving scoring determinism

**Defer (v2+ / explicitly out of scope):**
- Map/GIS visualization, voice I/O, real financial modeling (NPV/IRR), user accounts/persistent DB, BTS bulk-download ingestion, multi-provider LLM abstraction, elaborate onboarding. DECIDED: no database (MySQL considered and rejected - no users, no joins, nothing too expensive to compute live; a required DB server would also make the demo fragile on the reviewer machine). All state is in-memory (session state via a Map, adapter cache via lru-cache), lost on restart by design.

### Architecture Approach

Pure-core/impure-shell: everything that produces a number (resolution confidence, KPI math, the composite score) is a pure, zero-I/O, unit-testable function; everything with I/O (per-source adapters, the LLM call, the HTTP route) is a thin shell.
One adapter per upstream API (OpenSky, FAA NAS status, facility data), each independently cacheable and independently failable via a shared typed result type - never a single generic fetch helper shared across all sources.
A single domain/tools layer (Zod-typed, plain async functions) is the only channel through which computed numbers and upstream text reach the LLM, and it is called by both the AI SDK tool-loop and a regex/keyword fallback dispatcher - this is the concrete mechanism that makes the no-LLM-key path the real engine, not a stub.

**Major components:**
1. Airport reference/resolution layer - fuzzy/alias/region resolution to a validated AirportRef; also the SSRF allowlist gate; depends on nothing, build first
2. Data-source adapters (OpenSky, FAA NAS status, facility data) - timeout-bounded, cache-aside, typed ok/fail results
3. Metric computation + deterministic scoring engine - pure functions, KPIs to weighted composite score with an explicit coverage field for partial data
4. Tool/function layer + conversation orchestration - Vercel AI SDK tool-calling loop (bounded step count), system prompt enforcing "tool_result is data, not instructions," output-side numeric guardrail
5. Transport-as-interface - chat adapter seam keeps voice pluggable later at zero present cost

### Critical Pitfalls

1. **Hallucinated numbers** - the LLM states a figure the engine never computed; falsifies the project Core Value in front of the reviewer. Prevented structurally: UI renders from tool-result JSON (not prose), plus a post-hoc numeric provenance check against tool results.
2. **The ANC cargo/long-haul trap** - literally the project own sample question; naive haul-length math on Anchorage will report inflated "long-haul %" driven by transpacific cargo technical stops, not passenger demand. Requires a cargo-carrier callsign flag and an explicit caveat in the narration.
3. **The "LA"/"Santa Ana" disambiguation trap** - also literally in the sample questions; "LA" spans 5 commercial airports (LAX/BUR/LGB/SNA/ONT), "Santa Ana" is SNA (John Wayne) with no separate airport of that name. Must hand-curate metro groupings and always surface which codes were resolved, never silently pick one.
4. **Scope sprawl / UI polish eating the reasoning budget** - the requirements explicitly rewards reasoning/clarity over completeness/polish; requires a hard time-budget with checkpoints (roughly 40% data+scoring / 30% agent / 20% UI / 10% docs).
5. **Demo does not run on the reviewer machine** - missing/expired key, exhausted OpenSky quota from dev testing, or environment-specific paths (Hebrew-character home directory, no Python) break the app on a fresh clone; scores zero regardless of code quality. Requires an explicit fresh-clone-and-run test before submission.

## Implications for Roadmap

Based on research, suggested phase structure (reconciling ARCHITECTURE.md build-order guidance, FEATURES.md dependency graph, and PITFALLS.md phase buckets into one order):

### Phase 1: Data Layer & Canonical Airport Registry
**Rationale:** Every other feature - identity resolution, region lookup, adapters, the SSRF allowlist, scoring capacity denominator - depends on this ground-truth layer existing and being correct first. It also has zero network/LLM dependency, so it is buildable and testable immediately.
**Delivers:** Bundled OurAirports/FAA-NASR reference dataset; canonical ICAO-keyed airport registry; fuzzy/alias resolution with explicit disambiguation (never silent-pick); hand-curated metro/region groupings (LA basin, New England, SF Bay Area minimum); ICAO/IATA normalization including the Alaska/Hawaii prefix exception.
**Addresses:** Airport identity resolution, region-to-airport lookup, security allowlist (FEATURES.md P1 items)
**Avoids:** ICAO/IATA confusion and AK/HI prefix breakage; "LA"/"Santa Ana" ambiguity (project-killer #3)

### Phase 2: Deterministic Scoring Engine
**Rationale:** The non-negotiable graded core; must be pure, zero-I/O, and unit-tested against fixture data so it is fully exercised without any live network or LLM. Architecture recommends building this against stubbed/fixture KPI shapes in parallel with adapter work, not strictly after it.
**Delivers:** Data-source adapters (OpenSky first - most flaky, budget debugging time; then FAA NAS status; then near-static facility data), each independently cacheable/failable; metric computation layer producing named, provenance-tagged (measured/derived/proxy) KPIs with fetch timestamp and sample-size fields.
The weighted composite Expansion Opportunity Score with visible weight table, coverage field for partial data, and componentized breakdown; unit tests covering the antimeridian case, zero-movement airports, the ANC cargo-flag case, and one end-to-end worked example.
**Uses:** OpenSky flight endpoints (OAuth2), FAA nasstatus.faa.gov, FAA ArcGIS runway and facility layers
**Implements:** Pure-core/impure-shell pattern; adapter/port pattern per upstream
**Avoids:** Project-killer #2 (ANC cargo/long-haul conflation), size-vs-rate confusion, arbitrary undisclosed weights, double-counted correlated KPIs, small-sample noise, circularity (scale masquerading as "opportunity"), UTC/seasonality ambiguity, antimeridian distance bugs, over-claiming proxy metrics as measured

### Phase 3: Agent/LLM Integration (Intent Parsing + Narration)
**Rationale:** Depends on Phase 1 (resolution) + Phase 2 (scoring/tools) being callable end-to-end. This is where the Core Value becomes conversational without becoming unsafe - the LLM is added as a caller/narrator beside the deterministic pipeline, never inside it.
**Delivers:** Vercel AI SDK tool-calling loop (resolveAirports, getAirportScore, compareAirports, getMetric, explainUnmetDemand) with a bounded step count; system prompt enforcing tool_result-as-data.
Structured session state (lastAirports, lastMetric, lastScoreResults) for follow-ups, hybrid with raw history for tone; post-hoc numeric-provenance guardrail; parallelized multi-airport fetches with progressive status text; parallel no-LLM keyword dispatcher calling the identical domain/tools functions.
**Addresses:** Multi-turn follow-ups, causal "why" explanation, direct metric answers
**Avoids:** Project-killer #1 (hallucinated numbers), silent metric re-derivation, fuzzy resolution failing quietly, multi-turn context drift, chained-call latency reading as "broken" in a demo

### Phase 4: Chat UI, Security Hardening & No-LLM Fallback Surface
**Rationale:** By the end of Phase 3, resolution + adapters + metrics + scoring + tool layer + a bare structured-form UI already prove the entire Core Value and the no-LLM-key fallback - the earliest demo point. Phase 4 makes that demoable and safe, not functionally new.
**Delivers:** Minimal chat UI (message list, Score Card component rendering the score result JSON directly, not parsed from prose) plus a structured fallback form (airport picker + metric dropdown); per-session in-memory rate limiter; server-only enforcement on all secret/upstream-call modules; upstream-text delimiting before it reaches LLM context; verified no-LLM-key run.
**Avoids:** Project-killer #4 (scope sprawl/UI polish eating the budget - default to the plainest workable UI); prompt injection via upstream fields; SSRF; secret leakage to the browser

### Phase 5: Docs, Tests & Submission Packaging
**Rationale:** Must start in parallel with Phase 2 (methodology decisions are freshest as they are made), not be deferred to the end - a thin, late-written design doc is a direct requirements miss even with excellent code.
**Delivers:** Design doc with the literal scoring formula, weight table + rationale, one fully worked numeric example, an explicit assumptions/proxy list, and a named limitations section (OpenSky coverage bias, seasonality/single-week snapshot, ANC cargo caveat, LA/metro disambiguation behavior); environment variable example file; fresh-clone-and-run verification in a plain-ASCII-path directory.
**Avoids:** Project-killer #5 (demo unrunnable on reviewer machine); thin/late design doc

### Phase Ordering Rationale

- Data layer must be first because every later component (adapters, allowlist, scoring capacity denominator, region lookup) consumes it - this is the single point where getting order wrong forces rework everywhere downstream.
- Scoring engine comes before LLM integration because it is pure and independently testable; architecture explicitly recommends building it against fixture KPI data in parallel with, not strictly after, adapter completion, to protect its time budget as "the graded core."
- LLM integration is deliberately positioned after a working non-LLM pipeline exists, because the no-LLM fallback and the LLM tool-loop share one implementation - building the shared tools layer first makes the LLM phase additive, not foundational.
- Security and UI polish are positioned last on purpose, matching the explicit warning against UI/security work displacing scoring depth - but security primitives (allowlist, server-only boundary) are seeded in Phase 1/2, not bolted on; Phase 4 is a hardening/surfacing pass, not the first time these concerns are addressed.
- Docs run in parallel with Phase 2 onward, not as a discrete final phase, because the methodology section is cheapest and most accurate to write while the scoring decisions are being made.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Scoring Engine):** the exact weight formula and cargo-carrier-callsign allowlist need to be worked out concretely during planning - STACK/FEATURES/PITFALLS all converge on what is needed but not the literal numeric weights or the complete carrier-prefix list.
- **Phase 3 (Agent Integration):** Vercel AI SDK tool-loop specifics (exact step-limit tuning, step-trace shape) are MEDIUM-confidence, web-corroborated, not verified against this project exact SDK version - worth a quick doc check at plan time.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Data Layer):** endpoints, schemas, and the AK/HI prefix exception are HIGH-confidence and live-verified in STACK.md; no further research needed.
- **Phase 4 (UI/Security):** in-memory rate limiting, server-only boundary, and SSRF allowlist patterns are standard, well-documented Next.js/OWASP practice.
- **Phase 5 (Docs):** no technical research needed; content is derived from decisions already made in earlier phases.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | API endpoints and pricing were live-tested against vendor endpoints on 2026-08-12; one correction to training-data assumptions found (OpenSky flight endpoints require OAuth2, not anonymous) |
| Features | MEDIUM | Cross-checked against official FAA/IATA/ACI Europe/ACRP sources, but no single authoritative domain-vocabulary provider exists, capping confidence; one explicit gap flagged (no single FAA formula for "unmet demand") |
| Architecture | MEDIUM | Component decomposition and security patterns are HIGH-confidence standard practice; specific library/version claims (AI SDK tool-loop specifics) are web-corroborated at MEDIUM |
| Pitfalls | MEDIUM-HIGH | Aviation facts (ANC cargo volume, AK/HI ICAO prefixes, LA-metro airports) are HIGH-confidence, independently corroborated; LLM-agent and project-grading pitfalls are informed synthesis, not independently source-verified per item |

**Overall confidence:** MEDIUM-HIGH - the data-availability findings (the project biggest risk) are the most rigorously verified part of the research; domain-KPI and pitfall specifics are sound synthesis but not individually citation-verified at HIGH confidence.

### Gaps to Address

- **"Unmet demand" has no single FAA numeric formula** - FEATURES.md confirms this is a genuine gap, not a research miss. Handle during Phase 2 planning by committing to the recommended proxy (congestion-index saturation + slot-controlled-airport cross-reference) and stating it explicitly as a proxy in every answer, per the Core Value.
- **OpenSky OAuth2 registration is a blocking prerequisite not yet done.** Register the free client credentials before Phase 2 work starts - this is a 5-minute action item, not a research question, but it blocks the primary movement-count data source if skipped.
- **No LLM API key exists yet.** Decide during Phase 3 planning whether to provision an Anthropic key or lean on the Gemini free tier as primary - STACK.md recommends wiring both behind the provider-agnostic AI SDK interface so this decision is reversible without a rewrite.
- **Exact scoring weights are undetermined.** There is no labeled outcome data to fit weights against - this is an unavoidable judgment call; the mitigation is disclosure (visible weight table + rationale), not further research.
- **data.transportation.gov Socrata BTS passenger endpoint: DECIDED, not open.** STACK.md surfaced a genuinely live, keyless, queryable Socrata endpoint returning real per-airport passenger counts (the BTS T-100 International Report Passengers dataset, served via REST rather than bulk download). The user was presented with this option and explicitly declined it for v1, to keep the one-day build tight and the data story consistent (flight-movement-and-facility data throughout, no partial exception carved out for one dataset). This is a found-evaluated-declined tradeoff, not an unresolved question - it must appear in the design doc "alternatives considered" section, citing the ~8-month staleness and international-only coverage as the deciding factors, not as a reason to revisit it later.

## Sources

### Primary (HIGH confidence)
- openskynetwork.github.io/opensky-api/rest.html, live-fetched OpenSky endpoints - flight/state schema, OAuth2 requirement
- nasstatus.faa.gov/api/airport-status-information - live HTTP GET, 2026-08-12
- FAA ArcGIS Runways_View and NTAD_Aviation_Facilities feature layers - live-queried FAA ADIP/NASR data
- davidmegginson.github.io/ourairports-data/ - fetched CSV headers, data dictionary
- FAA, "Slot Administration - U.S. Level 3 Airports"; FAA AC 150/5060-5 "Airport Capacity and Delay"
- Anthropic model/pricing table (own docs); OpenAI and Google official pricing pages - live-fetched official pages
- Anchorage cargo-volume figures (Alaska Business Magazine, Flightradar24) and AK/HI ICAO-prefix exception (Simple Flying, corroborated)
- .planning/PROJECT.md - primary constraint source for all project-specific decisions

### Secondary (MEDIUM confidence)
- ACI Europe capacity-declaration papers; ACRP Report 25 (Airport Passenger Terminal Planning and Design); IATA LoS Best Practice - domain-vocabulary sourcing
- Vercel AI SDK docs (tool-calling loop, structured output, Next.js App Router integration) - web-corroborated, not version-pinned against this exact project
- npm registry live queries for current package versions
- OWASP SSRF/prompt-injection cheat sheets - architecture security pattern corroboration

### Tertiary (LOW confidence)
- FlightAware AeroAPI free-tier existence - flagged explicitly as unconfirmed, not relied upon
- Exact FAA Ground_Delay_List/Ground_Stop_List XML schema - documented in third-party wrappers, not live-observed during this research session

---
*Research completed: 2026-08-12*
*Ready for roadmap: yes*
