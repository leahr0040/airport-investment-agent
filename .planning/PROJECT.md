# Airport Investment Intelligence Agent

## What This Is

A conversational AI agent that helps investment analysts at a US airport-modernization
firm identify which airports are the strongest candidates for renovation and terminal
expansion. An analyst asks a plain-English question — "which New England airports are
strong candidates for terminal expansion?", "compare LA and Santa Ana congestion" — and
the agent answers with a ranked, explained result backed by a deterministic scoring
engine over live aviation data, not by LLM guesswork.

Built as a take-home project deliverable for a Forward Deployed Engineer
position. Timeframe: ~24 hours.

## Core Value

**Every number the agent states must be traceable to a deterministic computation over
real data, with its assumptions and uncertainty stated out loud.** An analyst who cannot
audit the reasoning will not act on the recommendation — and a reviewer who cannot see the
deterministic logic will not believe the agent.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Analyst can ask an airport investment question in natural language via a chat UI
- [ ] Agent resolves fuzzy location references ("New England", "LA", "Santa Ana") to specific airport codes
- [ ] Agent computes an Expansion Opportunity Score for any US airport from live API data using a fixed, inspectable formula
- [ ] Agent ranks/compares multiple airports on that score and its component KPIs
- [ ] Agent explains its reasoning: which KPIs drove the score, with the underlying numbers shown
- [ ] Agent states its assumptions, data-freshness limits, and confidence on every answer
- [ ] Analyst can ask follow-up questions that build on prior turns ("why?", "what about Boston?", "compare those two")
- [ ] Agent answers metric questions directly (e.g. "% of long-haul flights out of Anchorage")
- [ ] Agent explains unmet demand for a named airport and attributes it to specific drivers
- [ ] Design/architecture document covering scoring methodology, key tradeoffs, and where AI is used
- [ ] Agent resists prompt injection carried in third-party API responses and in user input
- [ ] Secrets and upstream API calls stay server-side; no key or raw upstream endpoint is reachable from the browser
- [ ] User-supplied identifiers are validated against an allowlist before reaching any outbound request (no SSRF)
- [ ] Per-session rate limiting on the chat endpoint so a single client cannot exhaust upstream API quota or LLM budget

### Out of Scope

- **Voice input/output** — bonus item; the transport layer will be built to accept a
  future voice adapter, but no speech code ships in v1. Time is better spent on scoring depth.
- **Measured passenger volumes** — no free keyless public API publishes passenger counts;
  those live in BTS bulk downloads. Passenger-side metrics are derived proxies (see Constraints).
- **Authentication / multi-user accounts** — single-analyst demo tool, no login.
- **Persistent database** — conversation state is per-session; no user data survives restart.
- **Non-US airports** — the firm invests in US airports only.
- **Production hardening** (rate-limit backoff tuning, observability, CI/CD, load testing) —
  this is a one-day project artifact, not a production service.
- **Real financial modeling** (NPV, IRR, construction cost) — the agent ranks *opportunity*,
  not *return*. No cost data is available and inventing it would be dishonest.

## Context

**The project brief.** The stated goal: identify airports where
renovations pay off most where flight and passenger capacity grows.
Four sample questions are given, spanning ranking (New England expansion candidates),
comparison (LA vs. Santa Ana congestion), a direct metric (Anchorage long-haul %), and a
causal explanation (SFO unmet demand and why). The brief also calls for prioritizing
clarity, reasoning and thoughtful design over completeness or polish.

**The central data tension.** The brief says to use public APIs. But the metrics it asks
about — passenger capacity, congestion, unmet demand — are published by BTS (T-100
segment data, On-Time Performance) and FAA (OPSNET) as *bulk downloads*, not as live
query APIs. The user chose live-APIs-only. Consequence: the scoring engine is built on
**flight-movement data**, and passenger-side quantities are derived proxies with stated
assumptions rather than measured values.

**Expected live sources** (to be verified in research):
- OpenSky Network REST API — per-airport arrivals/departures over a time window; yields
  movement counts, hourly distribution, origin/destination pairs (→ haul-length mix)
- FAA NAS Status / airport status service — current ground delays and delay reasons
- FAA ADIP / NASR (ArcGIS REST) or OurAirports — runway count, runway length, facility
  data; the physical-capacity denominator

**Why deterministic scoring matters here.** The requirement is explicit: include some
deterministic scoring or ranking logic, not only LLM output. The LLM's job is to
understand the question and narrate the result. It must never produce a score.

**Environment.** Windows 11. Node 24 installed and working. Python is *not* usable —
only the Microsoft Store stub is present — which is why the stack is TypeScript.

## Constraints

- **Tech stack**: Next.js + TypeScript, single repo — Node 24 works on this machine; Python does not. One app serves chat UI, API routes, and the scoring engine.
- **Timeline**: ~24 hours total, one working day of build — project deadline. Depth of reasoning beats breadth of features.
- **Data**: Live public APIs only, no bulk downloads — user's explicit decision. Accepted cost: passenger metrics are proxies.
- **API keys**: Must run keyless or near-keyless where possible; no LLM key exists yet — the app must be built key-agnostic and degrade gracefully. The scoring engine must work with **no** LLM key at all.
- **LLM cost**: Cheapest capable model — this is a throwaway project artifact, not production. Model choice is a research question, not a guess.
- **Voice**: Not implemented, but the chat transport must not preclude it — bonus item deferred; architecture keeps the door open at zero cost.
- **Honesty**: Every derived or assumed number must be labeled as such — the project grades on clearly communicating assumptions, uncertainty and scoping; a confident wrong number fails harder than a hedged right one.
- **Security**: Strong guardrails required at every trust boundary — user's explicit requirement. Concretely: treat third-party API responses as untrusted input to the LLM (injection surface), keep all secrets and upstream calls server-side, allowlist-validate every user-supplied identifier before it reaches an outbound URL, and rate-limit the chat endpoint per session. These are not deferrable polish.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js + TypeScript over Python/Streamlit | Python unusable on this machine; one repo covers UI + API + scoring; keeps voice bonus reachable | — Pending |
| Live public APIs only, no BTS bulk snapshot | User's explicit choice; truest reading of use public APIs in the brief | — Pending |
| Passenger metrics as derived proxies (seats × load-factor assumption), clearly labeled | Direct consequence of live-APIs-only; no keyless API publishes passenger counts | — Pending |
| Scoring engine is pure TypeScript, zero LLM involvement | Brief requires deterministic logic; also makes the engine unit-testable and the demo reproducible | — Pending |
| LLM used only for intent parsing and narration, never for numbers | Keeps every stated figure auditable; matches Core Value | — Pending |
| Voice deferred, transport layer kept adapter-shaped | Bonus item vs. one-day budget; costs nothing now to leave the seam | — Pending |
| App must run with no LLM API key (degraded but functional) | No key exists yet; reviewer may also lack one. Scoring + ranking must demo standalone | — Pending |
| API responses treated as untrusted LLM input, not trusted data | An upstream field could carry injected instructions; the LLM narrates over API text, so this is a live surface, not theoretical | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-12 after initialization*
