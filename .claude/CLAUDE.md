<!-- GSD:project-start source:PROJECT.md -->

## Project

**Airport Investment Intelligence Agent**

A conversational AI agent that helps investment analysts at a US airport-modernization
firm identify which airports are the strongest candidates for renovation and terminal
expansion. An analyst asks a plain-English question — "which New England airports are
strong candidates for terminal expansion?", "compare LA and Santa Ana congestion" — and
the agent answers with a ranked, explained result backed by a deterministic scoring
engine over live aviation data, not by LLM guesswork.

Built as a take-home project deliverable for a Forward Deployed Engineer
position. Timeframe: ~24 hours.

**Core Value:** **Every number the agent states must be traceable to a deterministic computation over
real data, with its assumptions and uncertainty stated out loud.** An analyst who cannot
audit the reasoning will not act on the recommendation — and a reviewer who cannot see the
deterministic logic will not believe the agent.

### Constraints

- **Tech stack**: Next.js + TypeScript, single repo — Node 24 works on this machine; Python does not. One app serves chat UI, API routes, and the scoring engine.
- **Timeline**: ~24 hours total, one working day of build — project deadline. Depth of reasoning beats breadth of features.
- **Data**: Live public APIs only, no bulk downloads — user's explicit decision. Accepted cost: passenger metrics are proxies.
- **API keys**: All credentials live in `.env` and are **required for v1** — OpenSky OAuth2 client (free registration) and one LLM key. No fallback or degraded mode is built. The app must fail at startup with a specific, actionable message naming the missing variable. Config is read through one validated env module that distinguishes required from optional, so optional keys can be added later without touching call sites — but nothing is optional today.
- **LLM cost**: Cheapest capable model — this is a throwaway project artifact, not production. Model choice is a research question, not a guess.
- **Voice**: Not implemented, but the chat transport must not preclude it — bonus item deferred; architecture keeps the door open at zero cost.
- **Honesty**: Every derived or assumed number must be labeled as such — the project grades on clearly communicating assumptions, uncertainty and scoping; a confident wrong number fails harder than a hedged right one.
- **Security**: Strong guardrails required at every trust boundary — user's explicit requirement. Concretely: treat third-party API responses as untrusted input to the LLM (injection surface), keep all secrets and upstream calls server-side, allowlist-validate every user-supplied identifier before it reaches an outbound URL, and rate-limit the chat endpoint per session. These are not deferrable polish.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Q1 — Live Public Aviation APIs (the linchpin question)

### 1. OpenSky Network REST API — VERDICT: partially keyless. Flight-movement data requires a free OAuth2 client (not a paid key, but not zero-registration either).

- `GET https://opensky-network.org/api/states/all` — current aircraft state vectors (position snapshot), optionally filtered by bounding box (`lamin`, `lomin`, `lamax`, `lomax`) or `icao24`.
- Anonymous limits: 400 credits/day, bucketed by IP, only the *most recent* state (the `time` param is ignored), 10-second position resolution.
- **This is a live snapshot of aircraft positions — not a per-airport movement count.** It cannot directly answer "how many flights departed KATL today" without inferring movement from repeated snapshots, which is unreliable for a 24-hour build.
- Confirmed via a live-doc scrape (`openskynetwork.github.io/opensky-api/rest.html`) and cross-checked (DeepWiki mirror of the same source doc): **all `/flights/*` endpoints return `403` without an OAuth2 bearer token.** There is no anonymous tier for these — this contradicts a naive reading of "OpenSky is free/keyless."
- To get a token: create a free OpenSky account → Account page → "API Client" → receive `client_id` + `client_secret` → exchange for a Bearer token via `POST https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token` (client-credentials grant). **No credit card, no approval wait — but it is a registration step**, and tokens expire every 30 minutes (must be refreshed programmatically).
- Authenticated limits: 4,000 credits/day standard user; `/flights/*` and `/tracks/*` cost 4 credits per live/<24h query, up to ~30+ for multi-day historical spans. 5-second position resolution, up to 1 hour of history for `/states`.
- `airport` is **ICAO** (4-letter, e.g. `KATL`, not `ATL`) — this is a common integration bug.
- `begin`/`end` window capped at **2 days** for these two endpoints (`/flights/all` caps at 2 hours; `/flights/aircraft` caps at 2 days lookback but up to 30 days history).
- **No passenger count, no aircraft type/seat capacity, no carrier name field** — only `callsign`, which you'd have to pattern-match against an airline ICAO-code prefix table to even guess the carrier.
- **`estDepartureAirport`/`estArrivalAirport` can be `null`** — the endpoint infers airport from proximity to the last ADS-B position, not from a flight plan. Build a null-handling / confidence-labeling path from day one, not as an afterthought.

### 2. FAA NAS Status / Airport Status — VERDICT: live, keyless, working today. Use `nasstatus.faa.gov`, not the SwaggerHub-documented `soa.smext.faa.gov` ASWS.

- No API key, no headers required. Returns XML.
- I fetched it live today and got real, current data back: `Update_Time`, and `Delay_type` blocks for `Airport Closures` (with `Airport_Closure_List > Airport > ARPT`, `Reason`, `Start`, `Reopen`). At fetch time there were no active Ground Delay Programs or Ground Stops, so I could not verify those blocks' exact tag names live — **MEDIUM confidence** on the `Ground_Delay_List`/`Ground_Stop_List` schema specifically (documented in third-party wrappers and consistent with the historical FAA schema, but I did not see live data for it today). Parse defensively: treat unknown/missing `Delay_type` blocks as "no active event of that type," don't assume all four block types are always present.
- Root schema (confirmed live): `AIRPORT_STATUS_INFORMATION > Update_Time, Dtd_File, Delay_type[] > Name, Airport_Closure_List > Airport[] > ARPT, Reason, Start, Reopen`.
- This is the feed behind the public nasstatus.faa.gov dashboard — it is FAA's live "what's disrupted right now" source: ground stops, ground delay programs, arrival/departure delays, and closures, keyed by 3-letter `ARPT` code.
- This is the endpoint documented on SwaggerHub (`app.swaggerhub.com/apis/FAA/ASWS/1.1.0`) and used by several open-source integrations (`faadelays` PyPI package, the Home Assistant "FAA Delays" integration).
- **I could not reach it at all — `soa.smext.faa.gov` failed DNS resolution** from two different tools during this research session (`ENOTFOUND`). Community reports (a Home Assistant GitHub issue, a `faa-airport-status.py` issue) independently describe SSL verification failures, connection resets, and "Service Temporarily Unavailable" from this exact host over the past two years. This reads as a domain with a history of instability/possible past migration, not a one-off outage on my end — but I cannot rule out a transient sandbox DNS issue either.
- It also only covers a reduced set of major airports (per the same GitHub issue thread), whereas `nasstatus.faa.gov`'s closures/delays feed is airport-agnostic (any `ARPT` currently affected shows up).
- **Recommendation: use `nasstatus.faa.gov/api/airport-status-information` as the sole FAA delay/closure source.** Don't build a fallback to `soa.smext.faa.gov` — if it's genuinely down, a fallback just adds a guaranteed-failing code path.

### 3. FAA ADIP / NASR via ArcGIS REST — VERDICT: live, keyless, working today. This is your physical-capacity denominator.

- Live-verified: returned 5 real runways for Atlanta (ARPT_ID='ATL', note this field uses the 3-letter FAA LID, not ICAO) with lengths 9000–12390 ft, width 150 ft, concrete surface.
- Full field list (35 fields): `ARPT_ID`, `ARPT_NAME`, `CITY`, `STATE_CODE`, `RWY_ID`, `RWY_LEN`, `RWY_WIDTH`, `SURFACE_TYPE_CODE`, `COND`, `PCN`, `RWY_LGT_CODE`, lat/long for both runway ends, plus pavement-strength fields (`GROSS_WT_SW/DW/DTW/DDTW`). Updated on the FAA's 28-day AIRAC cycle.
- No auth, no API key, standard Esri ArcGIS REST query syntax (`where`, `outFields`, `f=json`).
- Live-verified for ATL: returns `ARPT_ID`, `ICAO_ID` (`KATL` — this is your ICAO↔FAA-LID Rosetta Stone, needed to join against OpenSky's ICAO-keyed data), `ARPT_NAME`, `FACILITY_USE_CODE` (`PU` = public use), `FAR_139_TYPE_CODE` (`I E` — Part 139 certificated commercial-service classification: this is your best available "is this a real commercial airport" filter), `OWNERSHIP_TYPE_CODE`, `ARPT_STATUS`, lat/long, elevation, and about 70 more operational/administrative fields (fuel types, tower type, NOTAM ID, etc.).
- **Important correction to a marketing claim:** the ArcGIS item description for this layer advertises "current usage including enplanements and aircraft operations." **I live-tested this and it is false, or at least not present in the field set actually returned** — the full attribute dump for ATL contains no enplanement, operations-count, or based-aircraft field of any kind. Don't build against a field that the description promises but the schema doesn't deliver; I verified this with a real query, not by reading the metadata page.

### 4. OurAirports — VERDICT: static daily-refreshed CSV, not an "API" in the query-parameter sense. Treat as a bundled/cached reference table.

- No auth. Regenerated daily upstream, but served as flat CSV over plain HTTP — no filtering, no pagination, you fetch the whole file (airports.csv is ~9 MB, tens of thousands of rows worldwide).
- `airports.csv` columns: `id`, `ident`, `type` (large/medium/small_airport, heliport, closed, etc.), `name`, `latitude_deg`, `longitude_deg`, `elevation_ft`, `iso_country`, `iso_region`, `municipality`, `scheduled_service` (Y/N — a genuinely useful "does this airport have airline service" flag, cheaper to use than FAR_139), `icao_code`, `iata_code`, `local_code`.
- `runways.csv` columns include `airport_ident`, `length_ft`, `width_ft`, `surface`, `lighted`, `closed`.
- **This is your IATA↔ICAO↔name↔coordinates lookup table** — the piece that lets an analyst type "SFO" or "LA" and have the agent resolve it to `KSFO`/multiple LA-area ICAO codes. Nothing else in this stack does this cleanly.
- **Recommendation:** fetch once at build/deploy time (or on cold start, cached in memory for the process lifetime — a few hundred KB after filtering to US `large_airport`/`medium_airport` with `scheduled_service='yes'`), not per-request. This satisfies "live API not bulk download" in spirit poorly if fetched fresh every request (it's the same file every time) but is completely reasonable as a cached reference table refreshed occasionally — the honest framing for your design doc is "reference data, not live query data," same category as a geocoding gazetteer.

### 5. Commercial flight-data APIs — AviationStack, AeroDataBox, FlightAware AeroAPI, Amadeus

| API | Free tier | Keyless? | Notes |
|---|---|---|---|
| **AviationStack** | 100 requests/**month** total | No — free signup, no CC stated | Real-time flights + reference data. 100 req/month is unusable for a chat agent that fans out multiple queries per user turn — one analyst session could exhaust the entire month's quota. |
| **AeroDataBox** (RapidAPI) | 600 "units"/month, 1 req/sec, hard cap 2,400 req/month on Basic | No — RapidAPI account | Units ≠ requests; cost varies by endpoint. US schedule coverage claimed at 100%. Usable for light demo traffic if you budget calls carefully, but another quota to babysit during a live grading session. |
| **FlightAware AeroAPI** | 100 requests/month (per community reports; official docs did not clearly confirm a standing free tier) | No | Historically **no genuine free tier** for AeroAPI v3 — it's a paid metered API; treat the "100 free" figure as **LOW confidence** (not independently confirmed against FlightAware's own pricing page in this session). |
| **Amadeus for Developers (Self-Service)** | N/A — **shut down** | N/A | **Critical, current finding: Amadeus fully decommissioned its Self-Service API portal on July 17, 2026** (confirmed via PhocusWire, TravelTrade, and multiple independent trade-press sources dated Feb–Jul 2026). New registrations paused since spring 2026; existing keys deactivated July 17. This is **five weeks before today's research date (Aug 12, 2026)**. **Do not build against Amadeus at all** — it is not a viable option, full stop, regardless of what any pre-2026 documentation or training data says. |

### 6. Other live API candidates for passenger/capacity data

- I found and live-tested a genuinely keyless, live-queryable REST endpoint that returns **actual passenger counts** per airport per carrier per month:
- **This is technically the exact thing your PROJECT.md rules out** — it is the BTS T-100-family "International Report Passengers" dataset, just served through Socrata's live REST query layer instead of a CSV you download once. It is *literally* a live, filterable, per-record HTTP GET with no bulk download step. Whether that satisfies "live public APIs only, no BTS bulk downloads" is a judgment call about the spirit vs. the letter of your own constraint — **I'm surfacing this as a finding for you to decide on, not silently substituting it.** It only covers *international* segments (a companion domestic T-100 dataset almost certainly exists on the same Socrata instance under BTS's Airline Passenger and Freight Traffic series, but I did not locate and test its exact resource ID in this session — treat that as unverified).
- If you decide this is in-bounds, it would let a small number of specific metrics (e.g. "actual" vs. proxy passenger counts for international-heavy airports) be measured rather than derived — at the cost of ~8-month data staleness and international-only coverage. Given your project's Key Decisions table already commits to the proxy approach with stated rationale, my recommendation is **leave this out of the v1 build** — reopening the data-source decision this late costs more than it buys — but it's worth one sentence in your design doc's "known alternatives considered" section, since a sharp reviewer may ask "isn't there a live BTS API?" and you want a considered answer, not a surprised one.
- TSA publishes only a **national daily aggregate** (not per-airport) at `tsa.gov/coronavirus/passenger-throughput`, as a simple web table, not a REST API. Historical per-checkpoint hourly data exists only in periodic FOIA Reading Room document dumps, not a queryable service. The old MyTSA per-airport wait-time tool is retired.
- **Confirmed: no live, per-airport TSA API exists.** This closes off the most plausible-sounding alternative "unmet demand" signal.

### Q1 bottom line: what can the scoring engine actually compute from keyless/free-registration live APIs?

| Quantity | Source | Auth needed | Freshness |
|---|---|---|---|
| Departure/arrival counts, callsigns, timestamps, inferred origin/destination airport, for a chosen time window | OpenSky `/flights/departure`, `/flights/arrival` | Free OAuth2 client (registration, no CC) | Live/near-real-time, up to 2-day query window per call, 30 days lookback via `/flights/aircraft` |
| Current ground stops, ground delay programs, arrival/departure delays, airport closures with reason and duration | FAA `nasstatus.faa.gov` | None | Live |
| Runway count, individual runway length/width/surface/lighting/condition | FAA ArcGIS `Runways_View` | None | Refreshed every 28-day AIRAC cycle |
| Facility type (public/private), Part 139 commercial-service certification, ownership, elevation, tower presence, fuel availability | FAA ArcGIS `NTAD_Aviation_Facilities` | None | Refreshed every 28-day AIRAC cycle |
| IATA/ICAO/name/coordinates/municipality/region, "has scheduled service" flag | OurAirports CSV (cached reference table) | None | Refreshed daily upstream; you refresh on your own schedule |
| Aircraft position snapshots (not movement counts) within a bounding box | OpenSky `/states/all` | None (anonymous) | Live, 10s resolution |

## Q2 — Cheapest capable LLM

### Current pricing (verified 2026-08-12)

| Model | Input $/Mtok | Output $/Mtok | Structured output / tool calling | Free tier, no credit card |
|---|---|---|---|---|
| **Claude Haiku 4.5** (`claude-haiku-4-5`) | $1.00 | $5.00 | Yes — `output_config.format` (JSON schema) and tool use both supported | No |
| **Claude Sonnet 5** (`claude-sonnet-5`) | $3.00 ($2 intro thru 2026-08-31) | $15.00 ($10 intro) | Yes | No |
| **Gemini 2.5 Flash** | $0.30 | $2.50 | Yes — `response_schema` structured JSON mode, function calling | **Yes** — free via Google AI Studio, rate-limited (RPM/RPD caps not precisely documented in a single place, but the free tier is real and requires only a Google account, no card) |
| **Gemini 2.5 Flash-Lite** | $0.10 | $0.40 | Yes (lighter model) | Yes, same free-tier mechanism. **Being retired 2026-10-16** — don't build a hard dependency past that date if this project has any life beyond the project. |
| **GPT-5 mini** (verified against `developers.openai.com/api/docs/pricing`, not a third-party aggregator) | $0.25 | $2.00 | Yes — structured outputs (`response_format: json_schema`) and function calling | No standing free tier found; new accounts sometimes get promotional trial credit, not durable |
| **GPT-4.1 mini** | $0.40 | $1.60 | Yes | No |
| **Groq — Llama 3.1 8B Instant** | $0.05 | $0.08 | Function calling yes (OpenAI-compatible API); JSON mode yes; structured-output *reliability* is weaker than the frontier labs' models at this size | **Yes** — genuinely free, no credit card, ~30 RPM / ~500K tokens/day on the 8B model |

### Recommendation

## Q3 — Supporting TypeScript Libraries

### Recommended Stack

| Library | Version (verified via npm registry, 2026-08-12) | Purpose | Why |
|---|---|---|---|
| `@anthropic-ai/sdk` | 0.116.0 | Direct Claude API access | Official SDK; use directly if you commit to Anthropic-only. See note below on `ai` vs. direct SDK. |
| `ai` (Vercel AI SDK) | 7.0.62 | Provider-agnostic LLM layer: structured output (`generateObject`), tool calling, streaming | Recommended over the raw Anthropic SDK **specifically because** your LLM choice is explicitly an open research question and the app must degrade gracefully with no key. `generateObject()` gives you one call site that works against Anthropic, Google, or OpenAI by swapping the provider package — this is the concrete mechanism for the Q2 fallback story, not just a nice-to-have. |
| `@ai-sdk/anthropic`, `@ai-sdk/google` | latest matching `ai@7.x` | Provider adapters for the above | Install both; wire provider selection off which env var is present (`ANTHROPIC_API_KEY` vs `GOOGLE_GENERATIVE_AI_API_KEY`) — this *is* your "near-keyless, degrade gracefully" LLM story. |
| `zod` | 4.4.3 | Schema validation for: (a) the LLM's structured intent output, (b) validating/allowlisting user-supplied airport identifiers before they reach any outbound request (your explicit SSRF-prevention requirement) | Zod v4 is a significant perf jump over v3 (7–14x on validation-heavy paths per multiple 2026 write-ups) and is what `ai`'s `generateObject` expects for schema definitions — one schema library serves both the LLM-output-validation job and the security-boundary-validation job. |
| Next.js API routes (built-in) | Next.js 16.3.0 (verified via npm registry) | Chat endpoint, server-side upstream calls | Already your framework choice; no additional server framework needed. |

### What NOT to install (minimalism, per your explicit preference)

| Avoid | Why | Use instead |
|---|---|---|
| Vercel AI SDK's `useChat` React hook, if you want it | Not "avoid" exactly — it's fine and saves real code for the chat UI's streaming state management. Listed here only to flag: it pulls in the full `ai` package's React bindings. If your UI is minimal (single chat pane, no rich message types), a ~40-line hand-rolled `fetch` + `ReadableStream` reader is not meaningfully more code and keeps one fewer abstraction between you and the wire format when debugging under time pressure. **Judgment call, not a hard rule** — `useChat` is reasonable if you want polish; hand-rolled is reasonable if you want maximum debuggability in a 24-hour window. |
| `lru-cache` (v11.5.2) or any caching library | You need to cache upstream API responses (OpenSky, FAA) in memory for a single-process demo with no persistent DB (already an explicit Out of Scope item). A dependency here buys you eviction policies and memory bounds you don't need at demo scale. | A ~15-line hand-rolled `Map<string, {data, expiresAt}>` with a TTL check on read. One file, zero dependencies, trivially testable, and exactly matches your "no persistent database" and "cheapest/simplest" framing. |
| `@upstash/ratelimit` + Upstash Redis, or `ioredis` | This is the *correct* tool for **production, multi-instance** rate limiting — but you have no persistent database, no multi-instance deployment, and a single-analyst demo tool. Pulling in a Redis-backed rate limiter for a process that runs as one Node instance for a few hours is the textbook case of the wrong-sized tool. | A hand-rolled in-memory sliding-window or token-bucket counter keyed by session ID (or IP, since there's no auth), reset on process restart. This still fully satisfies your stated requirement ("per-session rate limiting on the chat endpoint so a single client cannot exhaust upstream API quota or LLM budget") — the requirement doesn't demand cross-instance correctness, and you don't have cross-instance deployment. |
| LangChain / LangGraph | Massive dependency surface (vector stores, memory abstractions, agent executors, retriever interfaces) for a job that is exactly two LLM calls: intent-parse and narrate. Every layer of LangChain's abstraction is a debugging tax you can't afford in a 24-hour build, for zero capability your task actually needs. | The `ai` package's `generateObject`/`generateText` directly — two function calls, not a framework. |
| A second flight-data SDK client library (e.g. wrapping AviationStack/AeroDataBox) | Given the Q1 finding that these commercial APIs are optional polish, not core-path, don't add their SDK weight for a fallback you may never call. | Plain `fetch()` calls, gated behind the same in-memory TTL cache, only if/when you decide to wire one in. |

### Installation

# Core

# If you want the raw Anthropic SDK too (e.g. for a feature `ai` doesn't cover yet)

### Version compatibility

| Package | Compatible with | Notes |
|---|---|---|
| `ai@7.0.62` | Next.js 16.x, Node 24 | Both current as of this research date; no known incompatibility. |
| `zod@4.4.3` | `ai@7.x` `generateObject`/`generateText` schema param | Zod v4 is the version the current `ai` SDK's structured-output helpers are built against; don't pin to Zod v3 syntax found in older tutorials. |
| `@ai-sdk/anthropic`, `@ai-sdk/google` | Install the version matching your installed `ai` major (currently 7.x line) | Check `npm info @ai-sdk/anthropic versions` at install time — provider packages version independently and can drift ahead of or behind the core `ai` package. |

## Alternatives Considered

| Recommended | Alternative | When alternative is better |
|---|---|---|
| Free OAuth2 client for OpenSky `/flights/*` | Skip OpenSky flight endpoints, use only anonymous `/states/all` bounding-box snapshots to *approximate* traffic | Only if you truly cannot spend 5 minutes on OpenSky registration before the clock starts — but this materially weakens your movement-count signal (snapshots, not counts) and I don't recommend it given the registration cost is genuinely trivial. |
| `nasstatus.faa.gov` for delay/closure data | `soa.smext.faa.gov` ASWS | Never, in this environment — it didn't resolve. If you're building from a different network and it happens to work for you, it does have narrower per-airport JSON responses that might be marginally easier to parse than the XML from nasstatus — but verify it resolves and responds before depending on it. |
| Vercel AI SDK (`ai` package) for the LLM layer | Direct `@anthropic-ai/sdk` only | If you commit fully to Anthropic-only and decide the provider-swap flexibility isn't worth the `ai` package's abstraction — the direct SDK is simpler to reason about for a single-provider build, and its own `client.messages.parse()` gives you structured output without any additional package. |
| Hand-rolled in-memory cache/rate-limit | `lru-cache` / `@upstash/ratelimit` | If this project has a life beyond the project and needs multi-instance deployment, add these then — they're the right production tools, just oversized for this deliverable. |

## Sources

- `openskynetwork.github.io/opensky-api/rest.html` and `.../docs/free/rest.rst`, `.../docs/free/flight-response.rst` — OpenSky REST API docs, live-fetched
- `deepwiki.com/openskynetwork/opensky-api/2-opensky-rest-api` — independent structured summary of the same OpenSky source, cross-checked against the above
- `nasstatus.faa.gov/api/airport-status-information` — live HTTP GET performed 2026-08-12, real data confirmed
- `github.com/jakekara/faa-airport-status.py` (issue #1), `github.com/home-assistant/core` (issue #90674) — community reports on `soa.smext.faa.gov` instability
- `services.arcgis.com/xOi1kZaI0eWDREZv/.../Runways_View/FeatureServer/0` and `.../NTAD_Aviation_Facilities/FeatureServer/0` — live queried, real data returned for ATL
- `davidmegginson.github.io/ourairports-data/`, `ourairports.com/help/data-dictionary.html` — fetched CSV headers and column dictionary
- `data.transportation.gov/resource/xgub-n9bw.json` — live Socrata query, real passenger data returned
- `aviationstack.com/product`, RapidAPI AeroDataBox pricing page, FlightAware AeroAPI pricing page — vendor pages, not live-key-tested
- PhocusWire, TravelTrade Today, `tripgic.com` — independent trade-press corroboration of the Amadeus Self-Service shutdown (Feb–Jul 2026)
- Anthropic model/pricing table via the `claude-api` skill (authoritative, cached 2026-06-24 from Anthropic's own docs)
- `developers.openai.com/api/docs/pricing`, `ai.google.dev/gemini-api/docs/pricing` — official vendor pricing pages, live-fetched
- `registry.npmjs.org/{ai,zod,lru-cache,@anthropic-ai/sdk,next}/latest` — live npm registry queries for current version numbers

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
