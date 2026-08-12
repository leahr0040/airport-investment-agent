# Feature Research

**Domain:** AI-powered conversational agent for airport-investment ranking (aviation capacity planning + deterministic scoring, project artifact)
**Researched:** 2026-08-12
**Confidence:** MEDIUM — findings cross-checked against official FAA, IATA, ACI Europe, and ACRP/TRB sources via web search; no single authoritative provider (Context7-equivalent) exists for aviation-planning domain vocabulary, so confidence is capped at MEDIUM per the source-hierarchy seam even where sources are primary (`.gov`/`.org` originals). One explicit gap flagged below (no single FAA formula for "unmet demand").

---

## Q1 — Project Question → Capability Mapping

Each of the brief's four sample questions is traced to a concrete, buildable capability. This is the load-bearing traceability table for the design doc — every downstream feature in this document exists to serve one of these four rows.

| # | Sample question | Capability it implies | Feature(s) required |
|---|---|---|---|
| a | "Which airports in New England are strong candidates for terminal expansion?" | **Region filtering** (New England is not an airport identifier — it's a fixed 6-state lookup: CT, ME, MA, NH, RI, VT) + **multi-airport ranking** on the Expansion Opportunity Score | Airport Identity/Facility Dataset, Region-to-Airport Lookup, Deterministic Scoring Engine, Ranking/Sort |
| b | "Compare LA and Santa Ana airport congestion levels." | **Fuzzy/ambiguous name resolution** ("LA" could mean LAX, or the LA metro serving airports BUR/LGB/ONT/SNA too — must pick one and *say so*; "Santa Ana" unambiguously resolves to SNA/John Wayne) + **pairwise comparison** on a single named KPI (congestion), not the composite score | Airport Identity Resolution + Disambiguation, Congestion KPI, Pairwise Comparison Mode |
| c | "What is the percentage of long haul flights out of Anchorage airport?" | **Single-airport direct metric** requiring per-flight origin-destination pairs, not just movement counts, plus a **great-circle distance classifier** against a stated long-haul threshold | Per-Flight O-D Ingestion (OpenSky `estArrivalAirport`), Great-Circle Distance Calculator, Haul-Length Classifier |
| d | "What is the unmet flight demand in SFO airport and why?" | **Causal explanation** — requires (1) a demand-vs-capacity gap metric and (2) **driver attribution**, i.e. the scoring engine must expose *which component* (runway throughput, gate/terminal, delay) drove the gap, not just a final number | Deterministic Scoring Engine with componentized/inspectable breakdown, Driver Attribution / "why" narration |

**Cross-cutting implication:** all four questions require the same underlying pipeline — *resolve entity/region → pull live data → run deterministic scoring → rank or extract → narrate with attribution and uncertainty*. There is no scenario where a shortcut on entity resolution or on componentized scoring is safe; both are load-bearing for every sample question, which is why they sit in Table Stakes below, not Differentiators.

---

## Q2 — Domain Vocabulary (citable in the design doc)

Real aviation-planning practice, not invented metrics. Use these definitions verbatim (with sourcing) in the scoring-methodology section of the design doc so every KPI name traces to a recognized industry/regulatory concept.

### Congestion

Congestion is not a single number in practice — it is a family of related measures:

- **Declared / runway capacity**: "the number of departures and landings (aircraft movements) that can be handled in a given period, usually expressed per hour." A distinction is drawn between *theoretical* capacity (optimal conditions, no disruption) and *practical/sustainable* capacity (what the system can absorb while keeping accumulated delay within acceptable bounds). ACI Europe additionally defines **Peak Declared Capacity** as "the highest movement rate (arrivals and landings) at an airport using the most favourable runway configuration under optimal conditions" — this is the number used to allocate slots at coordinated (Level 2/3) airports. (Source: ACI Europe, "Airport Capacity Guidance on Airport Capacity Declarations"; ACI Europe Position Paper on Airport Capacity, Nov 2024; FAA AC 150/5060-5 "Airport Capacity and Delay.")
- **Arrival congestion index**: ratio of aircraft landed in the preceding hour to the airport's declared arrival capacity. Values approaching or exceeding 1.0 indicate saturation. (Source: airport capacity/delay research literature building on FAA methodology.)
- **Delay**: actual minus scheduled departure/arrival time; a flight is conventionally counted "delayed" once that gap exceeds 15 minutes — the same threshold BTS/FAA On-Time Performance reporting uses.
- **Taxi-out time**: influenced by arrival throughput, departure demand, and runway configuration; used as a secondary congestion signal because it reflects surface-level queuing even when airborne delay looks fine.
- **ICAO design-hour convention**: the hour used for capacity planning is conventionally the one reached at least 30 times per year — i.e., the 30th-busiest hour, not the single busiest hour, to avoid over-building for rare peaks.

**Recommended KPI for this project:** *movements in the last observed hour ÷ a stated hourly capacity proxy* (declared capacity is not published per-airport via free live API, so this must be approximated from runway count/length via FAA ADIP/NASR or OurAirports facility data and labeled explicitly as an estimate, not the airport's actual filed declared capacity).

### Unmet / Suppressed Demand

This is the one term where public search did **not** surface a single crisp FAA numeric formula — flag this as a genuine gap (LOW confidence on precision, MEDIUM on the general concept). What the research did surface:

- FAA's **FACT3** ("Airport Capacity Needs in the National Airspace System") report frames capacity needs as a gap between forecast demand and available capacity, and identifies **27 airports** currently constrained or projected to become constrained by 2033 — this is FAA's own operational proxy for where unmet demand is materializing.
- The closest formal transportation-planning concept is **latent/suppressed demand**: "demand that exists but is suppressed by the inability of the system to handle it. Once additional capacity is added to the network, the demand that had been latent materializes as actual usage" — this is the standard framing in transportation engineering (TxDOT, transportation demand literature), not aviation-specific, but it is the operating definition analysts reach for.
- The most defensible **operational proxy for unmet demand at a live, keyless API level** is the **slot-controlled airport** mechanism (see below): a slot cap is a regulatory statement that scheduled demand exceeds what the airport is permitted to handle, i.e. a directly observable, government-declared instance of demand exceeding capacity.

**Recommended approach for this project:** define "unmet demand" as a *derived proxy* — e.g., (near-)saturation of the congestion index above a stated threshold, sustained over the observed window, optionally cross-referenced against slot-controlled status — and state explicitly in every answer that this is a proxy, not the BTS/FAA analyst's measured suppressed-demand figure (which requires bulk O&D survey data unavailable via live API). This directly matches the Core Value requirement: label every derived number as derived.

### Terminal Expansion Triggers

- Expansion decisions are driven by **peak-hour passenger throughput vs. terminal design capacity**, not annual totals: "the design of a new passenger terminal is based on much shorter-term demands, typically a 'peak hour'." Overall terminal capacity is "set by the weakest link" — the single most-constrained functional area (check-in, security, gate hold room) determines the whole terminal's effective capacity, a bottleneck framing worth citing directly.
- **IATA Level of Service (LoS)** is the standard industry framework: it grades space-per-passenger and queueing-time targets by letter grade (A–F), e.g. one commonly cited figure is 13 sq ft/passenger corresponding to LoS "B" for gate hold rooms. (Source: IATA "Level of Service Best Practice" paper; IATA Airport Development Reference Manual, ADRM.)
- **ACRP Report 25** (Airport Passenger Terminal Planning and Design) is the standard US methodology reference: gate requirements are derived either from a **Design Day Flight Schedule (DDFS)** or from enplanement/departure trend extrapolation with a peak-hour factor; **"sustainable capacity"** is ACRP's term for "the hourly capacity that can be realistically achieved for several consecutive hours" — deliberately distinct from a single theoretical peak.
- US average passenger terminal congestion delay is cited at roughly **19.5 minutes** in recent operational literature — useful as a sanity-check benchmark, not a KPI input (no live API exposes it per-airport).

**Recommended KPI for this project:** since gate counts and passenger-per-gate figures aren't in a free live API either, use **runway/movement-side capacity utilization** (from OpenSky + facility data) as the primary signal, and treat "gate/terminal capacity" as a stated *unmeasured dimension* rather than faking a number — this is more honest than inventing a gate-utilization figure with no data behind it.

### Long-Haul Definition

**No single universal regulatory threshold exists** — this must be stated as an explicit assumption in the design doc and in any answer that depends on it (directly relevant to Q4). Found conventions:

| Source | Short-haul | Medium-haul | Long-haul |
|---|---|---|---|
| Eurocontrol | < 1,500 km | 1,500–4,000 km | > 4,000 km |
| UK CAA | < 1,500 km | 1,500–3,500 km | > 3,000 km (overlap in source) |
| US EPA | < 300 mi (482 km) | 300–2,300 mi (482–3,701 km) | > 2,300 mi (3,701 km) |
| American Airlines (industry) | — | < 3,000 mi | > 3,000 mi |
| IATA (time-based) | < 3 hr | 3–6 hr | 6–16 hr |

**Recommendation:** adopt the **American Airlines / industry-convention threshold of 3,000 statute miles (~2,607 nautical miles, ~4,828 km) as "long-haul,"** because (1) it is a round, commonly-cited commercial-aviation figure rather than an environmental-policy cutoff (EPA's is designed for emissions accounting, not capacity planning), and (2) it roughly matches IATA's ~6-hour time threshold at typical cruise speed. State this choice as an explicit, labeled assumption every time the metric is used — do not present it as regulatory fact, because it isn't.

**Calculation method:** great-circle (haversine) distance between origin and destination airport coordinates is the standard method used across aviation distance/emissions tooling: `d = 2R·arctan2(√a, √(1−a))`, `a = sin²(Δlat/2) + cos(lat₁)·cos(lat₂)·sin²(Δlon/2)`, `R = 6,371 km`. Some emissions-focused methodologies (e.g. DEFRA) inflate the great-circle result by ~9% to account for indirect routing — not necessary for a capacity/investment KPI, but worth a one-line footnote if precision is questioned.

### Slot-Controlled Airports

- US **Level 3 (fully coordinated / slot-controlled)** airports are **JFK, LGA, and DCA** — confirmed directly from FAA's own "Slot Administration – U.S. Level 3 Airports" page.
- The regulatory mechanism is the **High Density Rule (14 CFR Part 93)**, established 1969, which originally covered five airports (JFK, LGA, DCA, ORD, EWR). JFK's HDR designation formally ended in 2007 but was immediately replaced by an **FAA Order Limiting Operations** (same practical effect), currently extended through October 2026, capping scheduled operations at **81/hour** during controlled hours. DCA's cap under 14 CFR Part 93 Subparts K & S is **48 scheduled operations/hour**, 6:00 am–11:59 pm.
- **Why this matters for the "unmet demand" question:** a slot cap is a government-issued, publicly documented statement that demand exceeds (or would exceed) capacity at that airport. This is the single most defensible, verifiable, *live-API-independent* proxy for unmet demand available to this project — flagging an airport as slot-controlled is strictly correct and requires zero invented modeling.

---

## Feature Landscape

### Table Stakes (Project Fails Without These)

| Feature | Why Required | Complexity (hrs) | Notes |
|---|---|---|---|
| Airport identity resolution (name/nickname/city/IATA/ICAO → code) | Every sample question (a–d) depends on resolving a natural-language reference to a specific airport or set of airports; without this the agent cannot even start | 2–3 | Needs a static facility dataset (OurAirports CSV or FAA NASR) as ground truth; disambiguation logic for ambiguous names like "LA" is part of this, not separate |
| Region-to-airport lookup (fixed lists: New England, etc.) | Q1a requires resolving "New England" to a set of airports; this is not fuzzy NLP, it's a small static table (state → airports, filtered to primary commercial-service facilities) | 1 | Cheap once the facility dataset exists — filter by state |
| Deterministic scoring engine (Expansion Opportunity Score), pure TypeScript, zero LLM in the numeric path | Explicit brief requirement (include deterministic scoring, not only LLM output) and PROJECT.md Core Value; also the only way every stated number stays auditable | 4–5 | Must expose per-KPI component breakdown, not just a final score — this is what makes Q1d ("why") answerable at all |
| Live data ingestion (OpenSky movements, FAA NAS status, facility/runway data) | No scoring or metric answer is possible without real numbers behind it; brief mandates live public APIs | 3–4 | OpenSky `estDepartureAirport`/`estArrivalAirport` fields are required for Q1c (haul classification), not just counts |
| Multi-airport ranking/sort on score | Directly implied by Q1a ("strong candidates" = ranked list) | 1 | Thin layer over the scoring engine once it exists |
| Pairwise comparison mode (single-KPI, not full score) | Directly implied by Q1b — comparing "congestion levels," a component, not the composite | 1–2 | Must be able to compare on a *named* KPI, not only the aggregate score |
| Direct single-metric answer with great-circle haul classification | Directly implied by Q1c | 2 | Haversine distance + a stated, cited threshold (see Q2) |
| Causal "why" explanation via componentized score breakdown | Directly implied by Q1d; also matches the explicit requirement "agent explains its reasoning: which KPIs drove the score" | 2 | Reuses the scoring engine's component exposure — build once, use for both ranking rationale and causal explanation |
| Assumption / uncertainty / confidence statement on every answer | Explicit grading criterion: clearly communicating assumptions, uncertainty and scoping | 2 | See Q4 patterns below; this is graded, not optional polish |
| Security guardrails: server-side secrets, allowlist-validated airport identifiers before any outbound call, per-session rate limiting, treat upstream API text as untrusted LLM input | Explicit, non-deferrable requirements in PROJECT.md Constraints | 2–3 | The allowlist is a natural byproduct of airport identity resolution (only resolve to codes that exist in the facility dataset) — build together |
| Chat UI + basic multi-turn context ("why?", "what about Boston?", "compare those two") | Explicit active requirement; without it the four sample questions can't be asked conversationally | 3–4 | Session-scoped only, no DB — matches Out-of-Scope decision on persistence |
| Graceful no-LLM-key degraded mode | Explicit constraint: scoring/ranking must work with **no** LLM key at all | ~0 extra | Free if the LLM boundary is designed correctly from the start (LLM only touches intent-parsing and narration, never the score) — this is an architecture discipline, not a feature to build separately |

### Differentiators (What Makes a Reviewer Say "This Person Thinks Like an FDE")

| Feature | Value Proposition | Complexity (hrs) | Notes |
|---|---|---|---|
| Componentized score exposed in every answer, not a black-box number | Directly matches Core Value; turns every ranking into an auditable table the analyst can push back on | ~0 extra | Free — it's the same data the scoring engine already produces for the "why" capability; just render it |
| Real domain vocabulary cited in-app and in the design doc (declared capacity, sustainable capacity, IATA LoS, ACRP DDFS, slot control) instead of invented metric names | Signals the builder understands the domain rather than pattern-matching a generic "score" — this is the single highest-leverage, lowest-cost differentiator available | 0 (research already done — this file) | Use the Q2 definitions verbatim, cited, in the KPI glossary of the design doc |
| "What would change this answer" / sensitivity statement (e.g., "if load-factor assumed at 70% instead of 82%, unmet-demand estimate drops materially") | Shows the agent understands its own fragility — exactly what an analyst needs before acting on a recommendation | 1–2 | Cheapest version: one templated sentence per proxy metric naming the assumption and its direction of effect |
| Data-freshness timestamp + staleness flag per KPI | OpenSky data can lag or rate-limit; an honest agent says so instead of presenting stale numbers as current | 1 | Store fetch timestamp alongside each KPI value, surface it in the response |
| Slot-controlled-airport special case (JFK/LGA/DCA flagged as regulatorily capped, not organically under capacity) | Converts a genuine data gap (no live "unmet demand" API) into a credible, verifiable answer instead of a guess | 1 | Static lookup table of 3 codes; directly usable for SFO-style "why" questions if SFO itself is later found to be near a regulatory ceiling too |
| Confidence tiering per answer (HIGH/MEDIUM/LOW) tied to actual data completeness (e.g., thin OpenSky coverage for ANC vs. dense coverage for SFO/LAX) | Distinguishes a confident answer from a guess dressed as an answer — matches the grading requirements directly | 1–2 | Tie the tier to a concrete, inspectable rule (e.g., movement count below N in the observation window → downgrade confidence), not vibes |
| Ambiguity surfaced on entity resolution ("LA" → resolved to LAX; BUR/LGB/ONT/SNA also serve the LA metro) rather than silently guessing | Prevents a wrong-airport answer from looking authoritative; matches the honesty requirement | 1 | Small addition to identity resolution: log and surface the alternatives considered, not just the winner |
| Voice-ready transport seam (typed interface only, no audio code) | Costs nothing extra if designed in from the start; keeps the explicit bonus item reachable without spending project hours on it | 0 (architecture discipline) | Do not build voice; just don't hard-code the chat transport in a way that forecloses it |
| Unit tests / golden-answer fixtures for the scoring engine | Proves the "deterministic" claim is real, not asserted — directly gradeable | 1–2 | A handful of fixed input → expected-score assertions is enough; this is not full test coverage, it's proof of determinism |

### Anti-Features (Deliberately Not Building)

| Feature | Why It Looks Appealing | Why It's Wrong Here | Alternative |
|---|---|---|---|
| Real financial modeling (NPV, IRR, construction cost estimates) | "Investment" is in the product name; feels incomplete without ROI numbers | No real cost data is reachable via free live API; inventing costs to compute NPV is exactly the "confident wrong number" the grading requirements penalizes; explicitly Out of Scope in PROJECT.md | Score *opportunity* (capacity gap), not *return*; state plainly that ROI requires cost data outside this system's scope |
| Map/GIS visualization | Visually impressive, feels like a natural fit for "airports" | 3–4+ hours for a UI element the four sample questions never require (all are answered in text/tables); the brief grades reasoning and design, not polish | A simple inline ranked table/bar comparison (≤30 min) if time remains — not a map |
| User accounts / authentication / persistent database | Feels "production-grade" | Explicit Out of Scope; single-analyst demo tool; every hour spent here is an hour not spent on scoring depth or uncertainty communication, which are graded | Session-scoped state only, no login, no storage across restarts |
| Precision-dressed passenger counts (presenting the seat×load-factor proxy as if measured) | Passenger capacity is literally what the brief asks about | No free keyless API publishes passenger counts (BTS is bulk-download only, explicitly excluded by the live-APIs-only decision); presenting a guess as data would be the exact failure mode the grading requirements calls out | Compute the proxy, label it "derived — assumed load factor X%, not measured," every time it's shown |
| General-purpose aviation Q&A (anything the user asks, answered) | Feels helpful, showcases the LLM | Scope creep away from the graded task; risks the agent inventing facts outside its scoring domain | Politely redirect out-of-domain questions to the agent's actual scope (US airport investment ranking) |
| Real-time streaming / WebSocket live updates | Feels "live" and modern | The underlying signals (hourly movement counts, delay status) don't meaningfully change at sub-minute granularity for an investment-ranking use case; adds real complexity (connection handling, reconnect logic) for no analytical value | Fetch-on-request with a visible freshness timestamp is sufficient and far cheaper to build correctly |
| Multi-LLM-provider abstraction layer | Looks like good engineering practice | Premature architecture for a one-day project with exactly one model choice; the LLM boundary just needs to be *thin and swappable*, not *pluggable across providers* | One clearly isolated call site (intent parsing + narration only), not a provider framework |
| Elaborate onboarding/tutorial flow | Improves perceived polish | Zero relevance to the grading requirements ("clarity, reasoning, and thoughtful design over completeness or polish") | A small set of example-question chips is enough affordance |
| Voice input/output implementation | Explicitly mentioned as a bonus in the brief | Building it consumes hours the requirements says should go to reasoning depth instead; explicit Out of Scope | Keep the transport seam open (see Differentiators), implement nothing |
| Production hardening (retry/backoff tuning, observability stack, CI/CD, load testing) | Feels responsible | Explicit Out of Scope — this is a one-day project artifact, not a service that will run unattended | Basic error handling and one rate limiter is enough; no infra beyond that |

---

## Feature Dependencies

```
Airport Facility Dataset (OurAirports / FAA ADIP-NASR)
    └──requires──> (nothing — this is the ground-truth base layer)

Airport Identity Resolution + Disambiguation
    └──requires──> Airport Facility Dataset
    └──enables──> Security allowlist (only resolve to codes present in the dataset)

Region-to-Airport Lookup (New England, etc.)
    └──requires──> Airport Facility Dataset (filtered by state)

Live Data Ingestion (OpenSky movements + O-D pairs, FAA NAS status, facility/runway data)
    └──requires──> Airport Identity Resolution (need a validated code before any outbound call)

Deterministic Scoring Engine (Expansion Opportunity Score, componentized)
    └──requires──> Live Data Ingestion
    └──requires──> Airport Facility Dataset (runway count/length as capacity denominator)

Multi-Airport Ranking ──requires──> Deterministic Scoring Engine
Pairwise Comparison Mode ──requires──> Deterministic Scoring Engine + Airport Identity Resolution (both sides)
Causal "Why" Explanation ──requires──> Deterministic Scoring Engine's component breakdown

Great-Circle Distance Calculator + Haul-Length Classifier
    └──requires──> Live Data Ingestion (per-flight O-D pairs)
    └──requires──> Airport Facility Dataset (lat/lon for both endpoints)

Assumption/Uncertainty Statement ──requires──> Deterministic Scoring Engine (per-KPI confidence must exist to state it)
Confidence Tiering (differentiator) ──enhances──> Assumption/Uncertainty Statement
Data-Freshness Stamp (differentiator) ──enhances──> Assumption/Uncertainty Statement
Slot-Controlled Special Case (differentiator) ──enhances──> Causal "Why" Explanation

Multi-Turn Follow-Up Context ──requires──> Chat UI
    └──enhances──> Ranking, Comparison, Causal Explanation (all become referenceable across turns)

Voice-Ready Transport Seam ──conflicts──> nothing (zero-build architectural constraint only)
Real Financial Modeling ──conflicts──> Core Value (honesty) — deliberately excluded, not sequenced
```

### Dependency Notes

- **Everything traces back to the Airport Facility Dataset.** It is the one piece of static ground-truth data (codes, coordinates, state, runway count/length) that every other feature — identity resolution, region lookup, scoring, and haul classification — depends on. Load and validate this first.
- **Identity resolution gates the security allowlist.** Because outbound calls must be allowlist-validated against known airport identifiers, building resolution and the allowlist together (rather than allowlisting as an afterthought) avoids a rework pass.
- **The scoring engine's componentized breakdown is a single build that serves three separate requirements** (ranking rationale, pairwise comparison, and causal "why" explanation). Do not build a single opaque score first and retrofit breakdown later — design the component structure from the start.
- **Differentiators mostly "enhance" rather than "require" new subsystems** — nearly all of them (confidence tiering, freshness stamps, slot-controlled flagging, ambiguity surfacing) are cheap precisely because they decorate data the table-stakes features already produce. This is why the complexity column for most differentiators is 0–2 hours: the expensive work is the table-stakes layer underneath them.
- **Real financial modeling conflicts with the Core Value**, not with any specific feature — it is excluded on principle (no data, would require inventing numbers), not sequenced for later.

---

## MVP Definition

### Launch With (v1 — Table Stakes)

- [ ] Airport facility dataset loaded and validated (OurAirports or FAA ADIP/NASR) — ground truth for every other feature
- [ ] Airport identity resolution with disambiguation (handles "LA," "Santa Ana," "New England," IATA/ICAO codes)
- [ ] Region-to-airport lookup for at least New England (extendable to other regions if time allows)
- [ ] Deterministic, componentized Expansion Opportunity Score computed from live OpenSky + FAA NAS status + facility data
- [ ] Multi-airport ranking and single-KPI pairwise comparison
- [ ] Great-circle haul-length classifier with a cited, stated threshold
- [ ] Causal "why" explanation driven by the score's component breakdown
- [ ] Assumption/uncertainty/confidence statement attached to every answer
- [ ] Security guardrails: server-side secrets, allowlist validation, per-session rate limiting, untrusted-input treatment of upstream API text
- [ ] Chat UI with session-scoped multi-turn context
- [ ] Functions with no LLM key present (scoring/ranking run standalone; LLM only adds intent parsing and narration)

### Add After Validation (v1.x — if hours remain)

- [ ] "What would change this answer" sensitivity statements
- [ ] Data-freshness timestamps and staleness flags per KPI
- [ ] Confidence tiering (HIGH/MEDIUM/LOW) tied to observable data completeness
- [ ] Slot-controlled-airport special case (JFK/LGA/DCA) as an unmet-demand proxy
- [ ] Ambiguity surfacing on entity resolution (show alternatives considered, not just the pick)
- [ ] Unit tests / golden-answer fixtures proving scoring determinism
- [ ] Additional region lookups beyond New England (Pacific Northwest, Texas Triangle, etc.)

### Future Consideration (v2+ — Not This Project)

- [ ] Map/GIS visualization — defer indefinitely; text/table output serves the graded questions
- [ ] Voice input/output — explicit bonus item, seam kept open, not implemented
- [ ] Real financial modeling with actual cost data — requires a data source this project doesn't have and shouldn't fake
- [ ] Persistent database / user accounts — out of scope for a single-analyst demo
- [ ] BTS bulk-download ingestion for measured passenger counts — would resolve the passenger-proxy honesty gap, but contradicts the live-APIs-only decision; revisit only if that constraint changes

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| Airport facility dataset | HIGH | LOW | P1 |
| Identity resolution + disambiguation | HIGH | MEDIUM | P1 |
| Region lookup (New England) | HIGH | LOW | P1 |
| Deterministic componentized scoring engine | HIGH | HIGH | P1 |
| Live data ingestion (OpenSky, NAS status, facility data) | HIGH | MEDIUM | P1 |
| Ranking / pairwise comparison | HIGH | LOW | P1 |
| Great-circle haul classifier | HIGH | LOW | P1 |
| Causal "why" explanation | HIGH | LOW | P1 |
| Assumption/uncertainty statements | HIGH | LOW | P1 |
| Security guardrails | HIGH | MEDIUM | P1 |
| Chat UI + multi-turn context | HIGH | MEDIUM | P1 |
| No-LLM-key degraded mode | MEDIUM | LOW (architectural) | P1 |
| Sensitivity ("what would change this") statements | MEDIUM | LOW | P2 |
| Data-freshness stamps | MEDIUM | LOW | P2 |
| Confidence tiering | MEDIUM | LOW | P2 |
| Slot-controlled special case | MEDIUM | LOW | P2 |
| Ambiguity surfacing | MEDIUM | LOW | P2 |
| Scoring engine unit tests | MEDIUM | LOW | P2 |
| Map visualization | LOW | HIGH | P3 |
| Voice I/O | LOW (explicit bonus only) | HIGH | P3 |
| Real financial modeling | N/A (excluded on principle) | HIGH | Excluded |
| User accounts / database | N/A (explicit Out of Scope) | MEDIUM | Excluded |

**Priority key:** P1 = must have for the project to succeed at all; P2 = should have, adds differentiation cheaply; P3 = defer past this project.

---

## Q4 — Communicating Assumption, Uncertainty, and Scoping

The brief explicitly grades this. Concrete, agent-facing patterns (not generic advice):

- **Categorical confidence labels over raw probabilities.** Analyst-facing AI agents should surface confidence as plain-language tiers ("High confidence," "Mixed signals," "Low confidence") paired with a one-line reason, rather than a bare probability score a non-technical analyst can't act on. Implementation pattern: attach one of three labels to each answer, driven by a concrete, inspectable rule (e.g., movement-count sample size in the observation window), never by vibes.
- **Explicit assumption blocks, inline, per answer.** Every derived/proxy number should carry a labeled one-line assumption note directly beneath or beside it — e.g., "Long-haul threshold: >3,000 mi (industry convention, not FAA regulation)" or "Passenger count is a proxy: seat capacity × 82% assumed load factor, not measured." This is cheaper than a global disclaimer and far more credible because it's attached to the specific number it qualifies.
- **Data-freshness stamps per KPI, not just per page.** Because different upstream sources (OpenSky vs. FAA NAS status vs. static facility data) refresh at different cadences, a single "last updated" timestamp for the whole answer is misleading. Pattern: "Movement data: as of 14:32 UTC (12 min ago) · Runway data: static reference, not time-stamped."
- **"What would change this answer" sensitivity statements.** A concrete, low-cost pattern: name the one assumption or data gap most likely to flip the conclusion, and state its direction of effect — e.g., "If the assumed load factor were 70% instead of 82%, the unmet-demand estimate would drop materially; this cannot be verified without BTS passenger data." This converts an unverifiable proxy from a liability into a demonstration of analytical rigor.
- **Surface the reasoning path, not just the number.** Agent dashboards that build trust let the user drill from a headline number into the inputs and steps that produced it — the componentized score breakdown (already required for causal explanation) doubles as this drill-down surface; no separate UI is needed if the score's components are exposed by default rather than hidden behind a click.
- **Scope refusal as an uncertainty pattern, not a dead end.** When a question falls outside available data (e.g., asking for exact construction cost), the correct pattern is not silence or a fabricated number — it's a stated boundary: "This system scores investment *opportunity* from live flight-movement data; it does not have construction-cost data, so it cannot estimate ROI." This is itself a form of scoping communication the requirements rewards.

---

## Sources

- FAA, "FACT3: Airport Capacity Needs in the National Airspace System" — https://www.faa.gov/sites/faa.gov/files/airports/resources/publications/reports/FACT3-Airport-Capacity-Needs-in-the-NAS.pdf
- FAA, "Capacity Needs in the National Airspace System" (NAS_needs.pdf) — https://www.faa.gov/sites/faa.gov/files/airports/resources/publications/reports/NAS_needs.pdf
- FAA, AC 150/5060-5, "Airport Capacity and Delay" — https://www.faa.gov/documentlibrary/media/advisory_circular/150_5060_5.pdf
- FAA, "Capacity Analysis" (ATO Systems Ops) — https://www.faa.gov/about/office_org/headquarters_offices/ato/service_units/systemops/perf_analysis/airport_capacity
- FAA, "Slot Administration – U.S. Level 3 Airports" — https://www.faa.gov/about/office_org/headquarters_offices/ato/service_units/systemops/perf_analysis/slot_administration/slot_administration_schedule_facilitation/level-3-airports
- flyreagan.com (Reagan National / DCA), "Slot & Perimeter Rules" — https://www.flyreagan.com/about-airport/aircraft-noise-information/dca-reagan-national-slot-perimeter-rules
- ACI Europe, "Airport Capacity Guidance on Airport Capacity Declarations, First Edition" — https://www.aci-europe.org/component/attachments/attachments.html?id=2503
- ACI Europe, "Airport Capacity Position Paper," Nov 2024 — https://www.aci-europe.org/downloads/resources/ACI%20EUROPE%20POSITION%20PAPER%20-%20AIRPORT%20CAPACITY.pdf
- ACRP Report 25, "Airport Passenger Terminal Planning and Design" (TRB/National Academies) — https://onlinepubs.trb.org/onlinepubs/acrp/acrp_rpt_025v1.pdf
- IATA, "Level of Service (LoS) Best Practice" — https://www.iata.org/contentassets/d1d4d535bf1c4ba695f43e9beff8294f/iata-level-of-service-paper-best-practice.pdf
- IATA, Airport Development Reference Manual (ADRM) — https://www.iata.org/en/publications/manuals/airport-development-reference-manual/
- TxDOT, "13.6 Unmet Demand" (transportation-planning definition of latent/suppressed demand) — https://www.txdot.gov/manuals/des/tsp/chapter-13-microsimulation-analysis/13-6-unmet-demand.html
- Eurocontrol / UK CAA / American Airlines / US EPA / IATA haul-length conventions — aggregated via SimpleFlying, PointHacks, and airline/regulator glossary pages (see haul-length comparison table above for individual attributions)
- Aviation Formulary (haversine / great-circle distance) — https://edwilliams.org/avform147.htm
- Airlabs, "Great Circle Distance Between Airports" — https://airlabs.co/great-circle-distance-between-airports
- Fuselab Creative, "Agent UX: designing UI for AI agents" — https://fuselabcreative.com/ui-design-for-ai-agents/
- Groto, "How to Design AI Dashboards That Users Actually Trust" — https://www.letsgroto.com/blog/ai-dashboard-design
- ScienceDirect, "Ratio-based design hour determination for airport passenger terminal facilities" — https://www.sciencedirect.com/science/article/pii/S0969699721001071
- Project context: `.planning/PROJECT.md` (constraints on live-APIs-only, no-LLM-key degraded mode, security requirements, Out-of-Scope decisions)

---
*Feature research for: AI-powered airport-investment ranking agent (FDE project)*
*Researched: 2026-08-12*
