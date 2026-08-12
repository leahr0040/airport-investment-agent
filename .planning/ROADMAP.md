# Roadmap: Airport Investment Intelligence Agent

## Overview

Five phases carry this from an empty repo to a graded project deliverable in one build day.
The first three phases build a strictly non-conversational, fully unit-testable core — config
validation, the FAA-sourced airport registry and resolver, the live data adapters, and the
deterministic scoring engine — with zero UI and zero LLM involvement, so the graded core
(SCORE-*) can be exercised and proven correct entirely by `npm test`, independent of any
credential or network flakiness on demo day. Because the no-LLM keyword-dispatcher fallback
was cut from scope, there is no earlier "structured form" demo checkpoint available in this
build: **Phase 4 is the first point at which the system is demoable end-to-end** — an analyst
typing a question into chat and getting a narrated, numbers-backed answer. If the clock runs
out after Phase 4, the deliverable is still a working, gradable agent; Phase 5 hardens and
documents what already works rather than adding new behavior.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation — Configuration, Airport Registry & Resolution** - App boots only with valid config; every airport reference (code, name, region) resolves correctly or surfaces its ambiguity
- [ ] **Phase 2: Live Data Adapters & Caching** - OpenSky and FAA NAS status are fetched, cached per-source, and fail in isolation
- [ ] **Phase 3: Deterministic Scoring Engine** - The graded core: a pure, zero-I/O, unit-tested Expansion Opportunity Score with visible weights and cargo/passenger separation
- [ ] **Phase 4: Conversational Agent — Chat, Tool-Calling & Analyst Questions** - Analyst asks questions in plain English and gets ranked, explained, narrated answers with follow-up support
- [ ] **Phase 5: Security Hardening, Design Doc & Submission Packaging** - Guardrails verified end-to-end; design doc explains methodology, tradeoffs, and AI usage

## Phase Details

### Phase 1: Foundation — Configuration, Airport Registry & Resolution

**Goal**: The app boots reliably with validated configuration, and every analyst-supplied airport reference (code, name, or region) resolves to the correct canonical airport(s) or surfaces its ambiguity — never guesses, never lets an unsafe identifier reach an outbound request.
**Depends on**: Nothing (first phase)
**Requirements**: SETUP-01, SETUP-02, SETUP-03, DATA-01, RESOLVE-01, RESOLVE-02, RESOLVE-03, RESOLVE-04, SEC-02
**Success Criteria** (what must be TRUE):

  1. Starting the app with a required credential missing fails immediately with a message naming that specific variable and where to obtain it, read through one validated env module.
  2. A reviewer can go from `git clone` to a running app using only `.env.example` and the README, without reading source code.
  3. At startup, the app fetches the FAA ArcGIS facility/runway dataset into the in-memory registry, retaining per-runway geometry (count, length, parallel-runway separation).
  4. Naming an airport by IATA code, ICAO code, or common name — including Alaska/Hawaii airports (PANC, PHNL, not KANC/KHNL) — resolves to the correct canonical airport; naming a region ("New England") resolves to the correct airport set; naming an ambiguous metro reference ("LA") surfaces all candidate airports instead of silently picking one.
  5. Any airport identifier not present in the resolved registry is rejected before it can reach any outbound request.

**Plans**: 1/4 plans executed

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Scaffold Next.js 16 + TypeScript, Vitest toolchain, and the shared airport domain contracts (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 01-02-PLAN.md — Validated env module, fail-loud boot gate, `.env.example` and the reviewer runbook (wave 2)
- [ ] 01-03-PLAN.md — Region table, metro ambiguity clusters, legacy aliases, the pure resolver and the SSRF allowlist (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-04-PLAN.md — FAA ArcGIS registry fetch, runway parallel-group geometry, and boot wiring (wave 3)

### Phase 2: Live Data Adapters & Caching

**Goal**: Every live data source the scoring engine needs is fetched, cached per its own volatility, and fails in isolation without taking down the rest of the answer.
**Depends on**: Phase 1
**Requirements**: DATA-02, DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):

  1. Requesting an airport's movement data returns real OpenSky departure/arrival counts for an explicit, stated time window, authenticated via OAuth2 client credentials.
  2. Requesting an airport's status returns live FAA NAS delay/closure information.
  3. Repeated requests for the same airport within a source's TTL are served from the `lru-cache` without a duplicate upstream call, and different sources (registry, OpenSky, NAS status) carry different TTLs reflecting their actual volatility.
  4. When one source times out or fails, the KPIs it feeds are marked "unavailable" and the rest of the answer still returns, rather than the whole request failing.

**Plans**: TBD

### Phase 3: Deterministic Scoring Engine

**Goal**: The non-negotiable graded core — a pure, zero-I/O, zero-LLM function that turns KPIs into an Expansion Opportunity Score with a fully inspectable, testable formula.
**Depends on**: Phase 2
**Requirements**: SCORE-01, SCORE-02, SCORE-03, SCORE-04, SCORE-05
**Success Criteria** (what must be TRUE):

  1. Calling the scoring function directly — pure TypeScript, no network access, no LLM call — against fixed fixture KPIs returns an Expansion Opportunity Score.
  2. The returned score includes a component breakdown naming which KPIs contributed and by how much.
  3. Scoring weights and the normalization method live in one inspectable module, not scattered through the codebase.
  4. A cargo-dominated airport fixture (Anchorage-shaped) is scored with cargo movements identified and handled separately from passenger movements, rather than inflating a naive long-haul percentage.
  5. The unit test suite runs the scoring engine against fixed fixtures and proves identical inputs always produce identical scores.

**Plans**: TBD

### Phase 4: Conversational Agent — Chat, Tool-Calling & Analyst Questions

**Goal**: An analyst can ask airport-investment questions in plain English through a chat UI and get ranked, explained, narrated answers whose every number is drawn directly from the scoring engine's output — including follow-ups that build on prior turns. This is the earliest point at which the system is demoable end-to-end.
**Depends on**: Phase 1, Phase 3
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, QUERY-01, QUERY-02, QUERY-03, QUERY-04, QUERY-05, SEC-04
**Success Criteria** (what must be TRUE):

  1. Analyst can type a natural-language question in the chat UI and receive a narrated answer.
  2. Numeric values shown in the UI are rendered directly from the scoring engine's structured tool output, never parsed out of the LLM's prose.
  3. Analyst can ask a follow-up ("why?", "what about Boston?", "compare those two") and the agent resolves it against prior turns' resolved airports and results.
  4. Given a region, two named airports, or one named airport, the analyst gets: a ranked list with scores; a side-by-side single-KPI comparison with the difference; the long-haul flight share computed by great-circle distance against a stated, cited threshold; or an airport-specific unmet-demand explanation naming the physical cause via runway separation cross-referenced with delay conditions — and every answer states its assumptions, the data window used, and what is measured versus proxied.
  5. The chat transport sits behind an adapter interface with a single text implementation, and text drawn from third-party API responses is treated as untrusted data inside the LLM context, never as instructions.

**Plans**: TBD
**UI hint**: yes

### Phase 5: Security Hardening, Design Doc & Submission Packaging

**Goal**: The system enforces its security guardrails end-to-end and ships with a design document a reviewer can use to understand the scoring methodology, tradeoffs, and AI usage — so the delivered artifact is both safe and gradable.
**Depends on**: Phase 4
**Requirements**: SEC-01, SEC-03, DOC-01
**Success Criteria** (what must be TRUE):

  1. No secret or upstream base URL is referenced anywhere in client/browser-shipped code; the browser only ever calls the app's own `/api/chat` route.
  2. Sending rapid repeated requests from one session hits a per-session rate limit before upstream API quota or LLM budget is exhausted.
  3. The design document explains the scoring methodology (formula, weight table, one worked example), the key tradeoffs made, where and how AI is used versus deliberately excluded, and the alternatives considered and declined.

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation — Configuration, Airport Registry & Resolution | 1/4 | In Progress|  |
| 2. Live Data Adapters & Caching | 0/TBD | Not started | - |
| 3. Deterministic Scoring Engine | 0/TBD | Not started | - |
| 4. Conversational Agent — Chat, Tool-Calling & Analyst Questions | 0/TBD | Not started | - |
| 5. Security Hardening, Design Doc & Submission Packaging | 0/TBD | Not started | - |
