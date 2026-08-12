# Pitfalls Research

**Domain:** AI agent over live aviation APIs, deterministic scoring engine, 24-hour take-home project (FDE)
**Researched:** 2026-08-12
**Confidence:** MEDIUM-HIGH (aviation facts verified against current web sources; LLM-agent and project-grading pitfalls are informed synthesis, not independently source-verified per item)

Phase names below (`Phase 1` … `Phase 6`) are illustrative buckets for the roadmap, not a finalized plan — map them onto whatever phase structure `/gsd-new-project` produces:

- **Phase 1** — Data Layer & Canonical Airport Registry
- **Phase 2** — Deterministic Scoring Engine
- **Phase 3** — Agent/LLM Integration (intent parsing + narration)
- **Phase 4** — Chat UI & Transport
- **Phase 5** — Security Guardrails & Rate Limiting
- **Phase 6** — Docs, Tests & Submission Packaging

---

## TOP 5 PROJECT-KILLERS (ranked)

These are the failures most likely to sink the grade. Everything else in this document is secondary to getting these five right.

### 1. Hallucinated numbers — the LLM states a figure the engine never computed
The Core Value in PROJECT.md is literally "every number the agent states must be traceable to a deterministic computation." A single fabricated percentage in a demo answer falsifies the project's central claim in front of the reviewer. This is worse than any UI flaw because it is a correctness failure of the one thing the project explicitly grades: include deterministic scoring logic, not only LLM output. **Prevention must be structural (Phase 3), not a prompt instruction** — see Q3 Pitfall 1 below.

### 2. The ANC cargo/long-haul trap — this is literally the project's own sample question
"% of long-haul flights out of Anchorage" is a named sample question in the brief. ANC is the #1 US / #3 world cargo airport by tonnage, with 500+ weekly freighter landings and ~80% of transpacific cargo flights making a technical stop there. A naive haul-length metric computed from raw OpenSky movements will report a huge "long-haul %" that is really freighter traffic, not passenger demand — and if unlabeled, the agent will confidently draw an investment conclusion ("high long-haul demand → expand terminal") from cargo data. Getting this wrong on the one question the project telegraphs in advance is disproportionately costly. See Q1 Pitfall 6.

### 3. The "LA" multi-airport trap — also literally in the project's sample questions
"Compare LA and Santa Ana congestion" only makes sense once you know: (a) "LA" is ambiguous across LAX, BUR, LGB, ONT, SNA — five distinct commercial airports in the metro area, and (b) "Santa Ana" *is* John Wayne Airport (SNA) — there is no airport literally named "Santa Ana Airport," so a lookup that fails to resolve "Santa Ana" → SNA either errors or silently picks nothing. Silently picking one LA-area airport (almost always LAX, because it's the famous one) instead of disambiguating produces a confidently wrong comparison. See Q1 Pitfall 2.

### 4. Scope sprawl / UI polish eating the reasoning budget
The requirements states outright: clarity, reasoning and thoughtful design count for more than completeness or polish. In a 24-hour build it is very easy to burn half the day on chat UI styling, streaming animations, or extra features, leaving the scoring methodology shallow and the design doc thin. This is graded against the opposite of what a typical dev instinct optimizes for. See Q4 Pitfall 1.

### 5. Demo doesn't run on the reviewer's machine
Zero-effort to detect, catastrophic if missed: a missing/expired API key, a rate-limited OpenSky quota already exhausted from dev testing, or a Windows-vs-POSIX path/tooling assumption baked in from this dev environment (Hebrew-character home path, Python unavailable) breaks the app the moment the reviewer clones it. An unrunnable submission cannot be graded on its reasoning at all — it scores zero regardless of how good the scoring logic is. See Q4 Pitfall 3.

---

## Q1 — Aviation Data Pitfalls

### Pitfall 1: ICAO vs IATA code confusion
**What goes wrong:** OpenSky's flight endpoints key airports by **ICAO** code (e.g. `KLAX`, `PANC`), while users type and think in **IATA** (`LAX`, `ANC`), and other data sources (OurAirports, NASR/ADIP) expose both inconsistently. Passing an IATA code straight into an ICAO-keyed field returns empty/wrong results silently (no error — OpenSky just returns no flights for an unrecognized/mismatched identifier in some cases, or the wrong airport if a collision exists).

**Why it happens:** The continental-US "K-prefix" rule (`KLAX`, `KJFK`, `KORD`) is easy to memorize and hard-code as `"K" + IATA`, but it **breaks for Alaska and Hawaii**: Alaska airports use the `PA` prefix (Anchorage IATA `ANC` → ICAO `PANC`, Fairbanks `FAI` → `PAFA`), Hawaii uses `PH` (Honolulu `HNL` → `PHNL`, Kahului `OGG` → `PHOG`). Both states were assigned to the ICAO Pacific region before/around statehood (1959), so they never got `K` codes. A naive `"K" + IATA` string-concat function will silently produce an invalid code for exactly the two states most likely to appear in a "seasonality/cargo" demo question (Anchorage).

**How to avoid:** Build one canonical lookup table (from OurAirports' airports.csv, which has both codes) at ingestion time. Every user-facing identifier and every upstream API response gets normalized to a single canonical ID (recommend ICAO, since OpenSky needs it) immediately at the boundary — never pass a bare user-typed code into an outbound request.

**Warning signs:** Any code path that does string concatenation to derive ICAO from IATA (`"K" + code`); any airport lookup that returns empty results specifically for AK/HI airports; test fixtures that only include continental-US airports.

**Phase to address:** Phase 1 (Data Layer & Canonical Airport Registry) — this is a foundational normalization step, not a fix-later detail; every downstream phase depends on it being correct.

---

### Pitfall 2: Metro-area airport ambiguity ("LA" is 5 airports, "Santa Ana" is one specific one)
**What goes wrong:** A fuzzy location resolver that maps "LA" to a single airport code (almost always LAX by popularity bias) silently wrecks any comparison or ranking question involving a metro area. The LA basin alone has five commercial-service airports: LAX, Hollywood Burbank (BUR), Long Beach (LGB), John Wayne/Santa Ana (SNA), and Ontario (ONT). "Santa Ana" is not a separate mystery airport — it *is* John Wayne Airport, located in Santa Ana, CA. A resolver that doesn't know this either returns nothing for "Santa Ana" or (worse) guesses SNA is a typo and substitutes something else.

**Why it happens:** LLM-based fuzzy resolution "sounds" confident regardless of correctness — an LLM asked "what airport is Santa Ana" will usually answer SNA correctly from parametric knowledge, but a lightweight regex/keyword resolver built for speed under a 24-hour deadline often only indexes airport *names*, not *city aliases*, and metro-area groupings aren't in most raw datasets at all — they have to be curated by hand.

**How to avoid:** Hand-curate metro-area groupings for the regions the project brief actually references (LA basin, New England, SF Bay Area at minimum) as static allowlisted data, not inferred. When a fuzzy reference resolves to more than one airport, the agent must **say so explicitly** ("Interpreting 'LA' as: LAX, BUR, LGB, SNA, ONT") rather than silently picking one — this converts a silent wrong-answer risk into a visible, correctable assumption, which is exactly what the requirements rewards (clearly communicating assumptions, uncertainty and scoping).

**Warning signs:** Any single-airport-per-query assumption in the resolver's type signature (`resolve(query: string): AirportCode` instead of `AirportCode[]`); no test case for "Santa Ana" or "LA" in the resolver's test suite; resolver falls back to "most famous airport" heuristics.

**Phase to address:** Phase 1 (Data Layer & Canonical Airport Registry) for the static groupings data; Phase 3 (Agent Integration) for the disambiguation-in-response behavior.

---

### Pitfall 3: OpenSky ADS-B coverage bias treated as ground truth
**What goes wrong:** OpenSky Network's flight and state-vector data comes from a crowdsourced network of volunteer ADS-B ground receivers. Receiver density is uneven — dense in Western Europe and populated US metro areas, sparse over oceans and remote terrain. OpenSky's own 2025 report explicitly discusses coverage gaps over oceanic and remote regions and is actively adding satellite (ADS-C) data specifically to compensate. This means **movement counts are undercounts, and the undercount is not uniform** — a rural or Alaskan airport can show artificially low activity purely from thin receiver coverage, not thin air traffic, while a Bay Area or East Coast airport gets fuller, more accurate counts from receiver density alone. A cross-airport ranking that doesn't disclose this treats "measured less accurately" as "less busy."

**Why it happens:** It's tempting to treat an API response as a ground-truth measurement rather than a sampled proxy with known geographic bias, especially under time pressure. Verifying the exact undercount magnitude per airport is itself hard (there's no independent ground truth easily available in a keyless-API-only project), so it's easier to ignore than to quantify.

**How to avoid:** You cannot fully correct for this in 24 hours, so the honest move is disclosure, not correction: state explicitly in the design doc and in agent narration that OpenSky movement counts are receiver-coverage-limited, name it as a known limitation for less-instrumented regions (call out Alaska/remote airports specifically), and avoid comparing a high-receiver-density coastal airport against a low-density remote one without that caveat attached to the answer. If time allows, a cheap partial mitigation: prefer OpenSky's `arrivalAirport`/`departureAirport` (from flight endpoints keyed by airport ICAO, which OpenSky derives from flight plan/callsign correlation) over raw state-vector proximity counts, since the former is somewhat less receiver-density-sensitive than trying to count aircraft physically observed near an airport's coordinates.

**Warning signs:** A ranking where every low-traffic-looking airport happens to be rural/remote and every high-traffic one happens to be a major dense metro — that pattern is exactly what coverage bias produces, and it's a good self-check to run against the output.

**Phase to address:** Phase 2 (Scoring Engine) for the disclosure/confidence-flag mechanism; Phase 6 (Docs) for stating it explicitly in the design doc's limitations section.

---

### Pitfall 4: UTC/epoch time window left ambiguous
**What goes wrong:** OpenSky's REST API takes `begin`/`end` as Unix epoch seconds in UTC. "Flights per day" is meaningless without stating which day, in which timezone, and how boundaries are drawn — a flight departing at 11:58pm local time can land on the "wrong" UTC day, shifting counts across a midnight boundary differently depending on the airport's timezone (Anchorage is UTC-9, Boston is UTC-5).

**Why it happens:** It's the path of least resistance to just pass `now - 7*86400` to `now` and call it "last week" without writing down, anywhere visible, exactly what window was sampled.

**How to avoid:** Pick one explicit definition (e.g., "trailing N full UTC days as of query time") and state it in both the API response payload and the chat narration every time a rate-based metric is shown. Never silently mix UTC-day and local-day framing across airports.

**Warning signs:** Any place in the codebase where a Date object's local-time methods (`getDate()`, `getHours()`) are used against epoch data that's conceptually UTC; no visible "as of" or "sample window" string anywhere in the UI/response.

**Phase to address:** Phase 2 (Scoring Engine).

---

### Pitfall 5: Seasonality — a one-week sample presented as if representative
**What goes wrong:** A live-API snapshot necessarily captures whatever week the project happens to be built in. Presenting that as "the" traffic picture for an airport is misleading for any seasonal airport, and Anchorage is the extreme case in this project's own domain — ANC's cargo and passenger mix shifts substantially between summer tourist season and winter, on top of its baseline cargo-hub role. A ranking built on a single week silently encodes "whatever this week looked like" as "this airport's characteristic behavior."

**Why it happens:** There's no free way to pull a full year of live movement history from OpenSky's anonymous/low-quota tier in a day, so a snapshot is the only realistic option — the mistake is not sampling once, it's *not saying so*.

**How to avoid:** Label every metric with its exact sample date range. State explicitly, in the design doc and ideally in-chat, that the score reflects the sampled window and that seasonal airports (name Anchorage specifically, since it's the project's own example) may look materially different at other times of year. If budget allows, pull two non-adjacent short windows just to sanity-check the magnitude of week-to-week variance and mention the delta.

**Warning signs:** No date range visible anywhere near a "flights per week" or "% long-haul" figure; scoring code that treats the sampled week as a stored constant with no timestamp attached.

**Phase to address:** Phase 2 (Scoring Engine) for timestamping every metric; Phase 6 (Docs) for the explicit caveat.

---

### Pitfall 6: Cargo vs. passenger flights conflated at Anchorage (and other freight hubs)
**What goes wrong:** ANC is the #1 US / #3 world cargo airport by tonnage (nearly 4M tonnes in 2025), hosting 500+ weekly wide-body freighter landings, largely because ~80% of all transpacific cargo flights make a fuel/crew "technical stop" there en route between Asia and the Lower 48/Europe. If "long-haul %" is computed purely from great-circle distance between origin/destination without regard to what's flying that route, ANC will show an enormous long-haul share — and it will look like the answer to "should we invest in ANC for passenger capacity" is "yes, huge long-haul demand," when the actual driver is cargo aircraft refueling, not passenger origin-destination demand. Worse, a technical stop can appear in OpenSky as *two separate movements* (an arrival leg from Asia, a distinct departure leg to the mainland US) rather than one through-flight, which can inflate ANC's raw movement count on top of misclassifying the traffic type.

**Why it happens:** OpenSky's flight/state-vector data doesn't carry a clean "cargo vs. passenger" flag. Distinguishing them requires cross-referencing callsign/operator against known all-cargo carriers (FedEx `FDX`, UPS `UPS`, Atlas Air `GTI`, Polar Air Cargo `PAC`, Kalitta `CKS`, ABX Air `ABX`, Cargolux `CLX`, etc.) — an extra step that's easy to skip under time pressure, especially since it's not needed for airports without heavy freighter traffic.

**How to avoid:** Maintain a small hardcoded allowlist of known all-cargo-carrier ICAO callsign prefixes and use it to flag (not necessarily perfectly exclude — a curated list won't be exhaustive) likely freighter movements before computing any passenger-facing metric. Regardless of how good the filter is, **explicitly disclose ANC (and any airport where the cargo-flag rate is high) as a special case** in the score narrative — e.g., "ANC's movement count and apparent long-haul share are heavily influenced by cargo carrier technical stops, not passenger origin-destination demand; treat this score's passenger-capacity implications with caution." This is the project's own sample question, so an honest caveat here is worth more than a false-precision number.

**Warning signs:** ANC scoring unusually high on any passenger-demand-flavored metric without a visible caveat; no cargo-carrier filter anywhere in the codebase; long-haul % computed as a single undifferentiated formula applied identically to every airport with no per-airport flags.

**Phase to address:** Phase 2 (Scoring Engine) for the carrier-filter/flag logic; Phase 3 (Agent) for surfacing the caveat in narration.

---

### Pitfall 7: Great-circle distance errors (haversine misuse, antimeridian)
**What goes wrong:** Classifying "long-haul" requires computing distance between two lat/lon points. A naive planar/Euclidean distance on raw latitude/longitude, or a haversine implementation that manually differences longitudes without proper trig, breaks near the antimeridian (±180°) — directly relevant here because Alaska/Aleutian routes and transpacific cargo routes through ANC cross it. A longitude difference computed as simple subtraction (e.g., 179° minus -179°) yields 358° instead of the correct ~2°, producing a wildly wrong "distance" that misclassifies a short hop as an ultra-long-haul flight or vice versa.

**Why it happens:** Haversine is usually implemented correctly by copy-pasting a standard formula, but ad hoc "let me just compute distance quickly" code sometimes reinvents it with a plain coordinate delta, which silently breaks only for the small set of routes that cross ±180° — exactly the routes involved in the project's Anchorage question.

**How to avoid:** Use a standard, correctly-derived haversine (or Vincenty) implementation — the trig-based formula naturally handles antimeridian wraparound because it operates on angular differences via `atan2`/`sin`/`cos`, not raw coordinate subtraction. Add one explicit test case for a known Anchorage-to-Asia route that crosses the antimeridian and assert the distance matches a known-good value (e.g., a cross-check against a public distance calculator).

**Warning signs:** Any distance function that does `lon2 - lon1` without wrapping into [-180, 180]; no test case with coordinates on both sides of ±180°.

**Phase to address:** Phase 2 (Scoring Engine).

---

## Q2 — Scoring / Ranking Methodology Pitfalls

### Pitfall 1: Raw counts favor big airports trivially (size vs. rate confusion)
**What goes wrong:** Comparing JFK's raw movement count against a small regional field's raw count tells you nothing except that JFK is bigger — which everyone already knows. If "expansion opportunity" is scored partly on raw activity volume, big airports always win by construction, and the score stops measuring what the brief actually asks for (capacity pressure relative to what the airport can currently handle).

**Why it happens:** Raw counts are the easiest numbers to pull directly from an API response; converting them into a normalized, comparable rate requires a denominator (runway count, estimated capacity, historical baseline) that takes extra research/data-joining effort.

**How to avoid:** Normalize every volume metric by a size-appropriate denominator before it enters the score — e.g., movements per runway, or a utilization ratio (observed movements ÷ an estimated capacity ceiling derived from runway count/configuration). Where possible use percentile or z-score normalization within a comparable peer set rather than absolute magnitude.

**How to avoid (verification):** For any two airports of very different size, sanity-check that the *component* scores, not just the final composite, reflect pressure/growth-need rather than sheer scale.

**Warning signs:** Score correlates almost perfectly with airport size/rank regardless of any other input; removing all normalization terms doesn't change the ranking order.

**Phase to address:** Phase 2 (Scoring Engine).

---

### Pitfall 2: Arbitrary weights presented as objective
**What goes wrong:** A composite score is a weighted sum of component KPIs. The weights are a value judgment (how much does "delay" matter relative to "runway utilization" relative to "long-haul mix"?), not a measured fact — but once printed as a single number, a score reads as objective even when the weights were picked by feel in the last hour of a 24-hour sprint.

**Why it happens:** There's genuinely no "correct" weighting without a labeled outcome to fit against (which doesn't exist here — the brief doesn't provide historical investment ROI data), so *some* judgment call is unavoidable. The pitfall isn't making the judgment call, it's hiding it.

**How to avoid:** Publish the weight table itself, next to the score, with a one-line rationale per weight tied back to the brief's stated goal (increased flight and passenger capacity). Where time allows, show a lightweight sensitivity note — e.g., "if delay were weighted 2x, LAX and ORD would swap rank #2/#3, but the top and bottom of the list are stable" — which is far more defensible than a bare number and directly serves the requirements's "communicate assumptions" requirement.

**Warning signs:** Weights exist only inside the scoring function's source code with no user-visible representation; no rationale comment anywhere near the weight constants.

**Phase to address:** Phase 2 (Scoring Engine) for making weights a visible, structured part of the output, not a buried constant; Phase 6 (Docs) for the rationale writeup.

---

### Pitfall 3: Double-counting correlated KPIs
**What goes wrong:** Delay rate and utilization/movement-density are not independent — congestion causes delay, so both measure largely the same underlying phenomenon from two angles. Including both at full weight in a composite score effectively weights "congestion" twice versus every other factor, distorting the composite without anyone intending it to.

**Why it happens:** Each KPI looks reasonable in isolation; the correlation only becomes visible when you look at the full set of inputs together, which is easy to skip when building the formula incrementally.

**How to avoid:** Either combine correlated signals into a single sub-score before weighting (e.g., one "congestion" sub-score built from delay + utilization, weighted once), or explicitly note the correlation in the doc and deliberately downweight one of the pair so the effective influence of "congestion-as-a-concept" matches its intended share of the total.

**Warning signs:** Two or more KPI names in the formula that are, on inspection, describing the same real-world phenomenon (delay, utilization, and "on-time performance" would all fall in this bucket, for example).

**Phase to address:** Phase 2 (Scoring Engine).

---

### Pitfall 4: Small-sample noise at low-traffic airports
**What goes wrong:** A regional airport with, say, 40 movements in the sampled week has enormous variance on any rate-based metric — one canceled or diverted flight swings a percentage by several points. Presenting that rate with the same implied precision as JFK's (computed over thousands of movements) misrepresents its reliability.

**Why it happens:** A ratio is a ratio regardless of the denominator size; nothing in a naive implementation distinguishes "reliable rate" from "noisy rate" unless it's coded to.

**How to avoid:** Track sample size (n) alongside every rate metric, and flag confidence as LOW below a stated threshold (pick a number and justify it, e.g., n < 100 movements). Prefer smoothed estimators (Laplace/add-one smoothing, or a Wilson score interval) over raw ratios for small-n airports, and surface the confidence flag in both the score payload and the chat narration.

**Warning signs:** A tiny regional airport swinging wildly in rank between two adjacent sample weeks; no `n` or `sampleSize` field anywhere near a percentage metric.

**Phase to address:** Phase 2 (Scoring Engine).

---

### Pitfall 5: Circularity — "expansion opportunity" scored using pure size metrics
**What goes wrong:** If the opportunity score includes raw traffic volume as a direct positive input, then "high opportunity" collapses into "already large," which is tautological — a big airport looks like a great expansion candidate simply because it's already big, not because it has unmet demand pressure. This directly undermines the project's own framing ("unmet demand," "expansion opportunity"), which is about pressure relative to current capacity, not scale.

**Why it happens:** Size-related fields are the most abundant and easiest to pull from the API, making them an attractive default input; the distinction between "activity" and "activity relative to capacity" requires deliberate normalization (see Pitfall 1) that's easy to skip.

**How to avoid:** Keep "scale" (how big is this airport) and "pressure" (how strained is this airport relative to its own capacity) as clearly separate concepts in the formula; only pressure/ratio-type metrics should feed the "opportunity" score, with scale used at most as a peer-grouping/normalization denominator, never as a direct positive scoring input.

**Warning signs:** The top of the "expansion opportunity" ranking is just the list of the biggest US airports in size order.

**Phase to address:** Phase 2 (Scoring Engine).

---

### Pitfall 6: Score isn't defensible to a skeptical analyst
**What goes wrong:** A single opaque number ("Score: 78") invites the reasonable question "why?" — and if the answer isn't immediately inspectable, the analyst (and the reviewer, who is explicitly evaluating "reasoning") won't trust it.

**Why it happens:** It's faster to compute and return a final number than to also structure and expose the component breakdown, formula, and assumptions behind it.

**How to avoid:** Every score response should carry its own audit trail: the component KPI values, the weights applied, the formula (or a link/reference to it), and the assumptions/proxies used — not just the final number. Make the scoring function itself a pure, independently callable/testable unit so "reproduce this score" is a literal one-line call, not an opaque pipeline.

**Warning signs:** The chat agent can state a score but can't explain, using only data already in the response payload, which factors drove it.

**Phase to address:** Phase 2 (Scoring Engine) for the structured output; Phase 3 (Agent) for narrating the breakdown, not just the total.

---

## Q3 — LLM Agent Pitfalls in an Analytics Context

### Pitfall 1: Hallucinated numbers — structural prevention, not prompting
**What goes wrong:** The single most damaging failure mode for this project. An LLM asked to narrate a comparison can — especially under multi-turn follow-ups — restate, round, recompute, or simply invent a number that doesn't match what the scoring engine actually returned. "Please don't make up numbers" in the system prompt reduces but does not eliminate this; LLMs are not deterministic function evaluators.

**Why it happens:** Free-text generation over numeric content is inherently probabilistic; an LLM has no built-in mechanism to distinguish "I am quoting a fact from the tool result" from "I am producing a plausible-sounding number," and long conversation histories increase the chance it drifts from the literal source value while narrating.

**How to avoid (structural, in order of strength):**
1. **Template-fill, don't free-generate, the numeric parts of an answer.** The scoring engine returns structured JSON; construct the numeric portions of the response via string interpolation of that JSON directly (server-side, deterministic code), and let the LLM generate only the connective prose around pre-filled numeric slots it cannot alter.
2. If full free-text narration is used instead (e.g., for flexibility on follow-ups), add a **post-generation verification pass**: regex-extract every number the LLM's response contains, and programmatically check each one appears (allowing for rounding) in the structured tool-result payload it was given. Reject/regenerate (or flag) on any number with no provenance in the source data.
3. Never let the LLM see a "narration-only" system prompt without also being handed the exact structured numbers to narrate — don't ask it to "explain SFO's unmet demand" without first calling the scoring engine and injecting its literal output into context.

**Warning signs:** Any chat response containing a number that isn't a substring (or rounding) of a number present in the corresponding tool-call/API response logged for that turn; no automated check comparing narrated numbers to engine output.

**Phase to address:** Phase 3 (Agent Integration) — this needs to be designed in from the start, not bolted on; test it explicitly before considering the phase done.

---

### Pitfall 2: LLM silently re-deriving a metric instead of using the engine's value
**What goes wrong:** Related to but distinct from outright hallucination — the LLM might correctly *compute* a plausible number (e.g., "roughly 40% long-haul") using its own reasoning over raw data shown to it, rather than reading the engine's actual computed value, producing two different numbers for the same metric across the app (one in a structured "score card" UI element, a different one in the chat prose) with neither being flagged as wrong.

**Why it happens:** If raw movement data (not just the final computed metric) is present anywhere in the LLM's context — e.g., for transparency/explainability — the model has the raw material to "help" by computing its own version, especially on a follow-up question phrased slightly differently from the original.

**How to avoid:** Whenever raw data is shown to the LLM for explanation purposes, also show the engine's own pre-computed metric value directly alongside it, and instruct the model to always cite that value rather than deriving a new one — combined with the Pitfall 1 provenance check, which will also catch this case, since a re-derived number is by definition not sourced from the engine's returned value.

**Warning signs:** The same conceptual metric (e.g., "long-haul %") displaying two different values in two different places in the same conversation turn.

**Phase to address:** Phase 3 (Agent Integration).

---

### Pitfall 3: Fuzzy location resolution failing quietly — confidently answering about the wrong airport
**What goes wrong:** As covered in Q1 Pitfall 2, but the *agent-layer* failure mode specifically: the resolver picks a wrong or incomplete airport set, and the LLM narrates a fluent, confident, well-formatted answer about that wrong set with no visible signal anything went wrong. This is worse than an error message — a wrong-but-confident answer is more likely to be trusted and acted on.

**Why it happens:** LLMs are trained to produce fluent, confident-sounding prose regardless of the correctness of the underlying facts fed to them; nothing about a wrong resolution "feels" different to the generation process.

**How to avoid:** Make resolution a separate, deterministic, inspectable step (not an LLM freeform guess) that returns either a specific airport code, a disambiguated set (with the ambiguity stated), or an explicit "not found" — never a silent best-guess. Require the agent's response to always restate which airport code(s) it resolved a fuzzy reference to, every time, so a wrong resolution is visible in the answer itself rather than hidden inside it.

**Warning signs:** Chat responses that never mention the specific airport code(s) being discussed, only the fuzzy phrase the user typed; no logging of the resolver's intermediate output for debugging.

**Phase to address:** Phase 1 (resolver logic) and Phase 3 (surfacing resolution in every response).

---

### Pitfall 4: Multi-turn context drift on follow-ups
**What goes wrong:** "What about Boston?" or "compare those two" relies on the agent correctly tracking which airports/metrics were under discussion. An LLM relying purely on its own attention over raw chat history can lose track after a few turns, especially if the conversation branches (compares one pair, then asks about a third airport, then says "compare those two" — which "those two"?).

**Why it happens:** Implicit conversational state (relying on the model's own reading of history) degrades faster than explicit state, especially as history grows or when a turn is ambiguous even to a human reader.

**How to avoid:** Maintain an explicit, programmatically-updated conversation state object (e.g., `focusAirports: string[]`, `lastMetric: string`) alongside the chat history, updated by code (not LLM judgment) after each turn based on the resolved entities in that turn, and pass that explicit state into every subsequent tool call rather than relying on the LLM to "remember" correctly from raw transcript alone.

**Warning signs:** A follow-up like "what about Boston?" resolving to the wrong prior comparison, or "compare those two" failing after three or more turns of conversation.

**Phase to address:** Phase 3 (Agent Integration) — budget explicit test turns for this before considering the phase done, since it's one of the stated requirements ("follow-up questions that build on prior turns").

---

### Pitfall 5: Prompt injection carried in third-party API response fields
**What goes wrong:** Any free-text field from an upstream API (NOTAM-style status text, delay-reason strings, airport facility descriptions) that gets concatenated into the LLM's context is untrusted input from the LLM's perspective — if such a field ever contained text resembling an instruction ("ignore previous instructions and..."), a naive pipeline that pastes upstream text directly into the prompt gives it the same authority as the system prompt or developer instructions.

**Why it happens:** It's natural to treat "our own backend's API call results" as trusted just because *we* control which API to call — but the *content* of the response is still authored by a third party (FAA, OpenSky, or any upstream), and this project's own constraints explicitly flag this as a live surface, not a theoretical one.

**How to avoid:** Wrap all upstream text fields in explicit data delimiters when injected into the LLM's context (e.g., a clearly labeled `<upstream_data>` block), and instruct the model (via system prompt/framing) that content inside those delimiters is data to summarize, never instructions to follow. Where feasible, strip/neutralize text that pattern-matches common injection phrasing before it reaches the model. Never pass upstream free text directly into a position that could be read as system-level or developer-level instruction.

**Warning signs:** Any string concatenation that builds LLM context by directly embedding raw upstream API response text without a delimiter/label; no distinction in the prompt-construction code between "trusted instruction" and "untrusted data" text.

**Phase to address:** Phase 5 (Security Guardrails) — but the delimiter convention should be established as soon as any upstream text starts flowing into LLM context in Phase 3, not retrofitted later.

---

### Pitfall 6: Latency — a chained tool-calling loop over slow upstream APIs feels broken in a demo
**What goes wrong:** A question that requires resolving a fuzzy location, then calling OpenSky for movement data for each resolved airport, then computing a score, then narrating, can chain multiple sequential network round-trips (each potentially several seconds, especially OpenSky under load or with a large state-vector query). In a live demo, several seconds of silent spinner reads as "broken," independent of whether the underlying architecture is sound.

**Why it happens:** It's simplest to write the tool-calling loop as sequential awaits; independent calls (e.g., fetching data for 5 LA-area airports) that could run in parallel often end up serialized by default.

**How to avoid:** Parallelize independent upstream calls (`Promise.all` across airports in a multi-airport query) rather than looping sequentially; cache per-airport results in-memory for the session so a repeated or follow-up question about the same airport doesn't re-fetch; set explicit timeouts with a graceful "data temporarily unavailable, here's what I have" degradation path rather than an indefinite hang; and show progressive status text ("Fetching flight data for LAX, BUR, SNA...") so the perceived latency reads as "working," not "broken," even when the raw latency doesn't change.

**Warning signs:** A multi-airport comparison question taking noticeably longer, roughly linearly, per additional airport in the query — a sign calls are serialized rather than parallel; no loading/status indicator between question submission and answer.

**Phase to address:** Phase 3 (Agent Integration) for parallelization/caching; Phase 4 (Chat UI) for progressive status feedback.

---

## Q4 — Take-Home Project Pitfalls Specifically

### Pitfall 1: Spending the day on UI polish instead of reasoning
**What goes wrong:** The requirements explicitly rewards clarity/reasoning over completeness/polish, but the default instinct under a deadline with a visible chat window is to make it *look* finished — streaming text, nice bubbles, animations — which consumes hours that would score higher spent on scoring-methodology depth, edge-case handling, or the design doc.

**Why it happens:** UI progress is immediately visible and satisfying; reasoning/methodology depth is invisible until someone reads the doc or probes the agent with hard questions, so it's easy to unconsciously deprioritize.

**How to avoid:** Set an explicit time budget before starting (e.g., roughly 40% scoring engine + data layer, 30% agent integration, 20% UI, 10% docs/tests-polish) and treat it as a hard constraint, not a suggestion — check elapsed time against budget at each phase boundary. Default to the plainest workable chat UI (a scrollable message list, no animation) unless there's clear budget surplus late in the day.

**Warning signs:** More time spent adjusting CSS/layout than time spent writing or testing the scoring formula; the design doc still unstarted past the halfway point of the available time.

**Phase to address:** All phases — this is a budget-discipline pitfall, best enforced by the phase plan/roadmap itself allocating explicit time boxes per phase.

---

### Pitfall 2: A README/design doc that doesn't actually explain the scoring methodology
**What goes wrong:** A doc that describes the tech stack, how to run the app, and a feature list — but never states the actual formula, the actual weights, a worked numeric example, or the explicit list of assumptions/proxies — fails the project's explicit requirement ("design/architecture document covering scoring methodology, key tradeoffs, and where AI is used") even if the underlying code is excellent.

**Why it happens:** Docs are typically written last, when time is short and energy is low, and "how to run this" feels more urgent to document than "why the score is computed this way," even though the latter is what's actually graded.

**How to avoid:** Write the methodology section of the doc incrementally, as each scoring decision is made during Phase 2 — not as a single write-up at the end. Include: the literal formula, the weight table with rationale, one fully worked numeric example end-to-end (raw API data → normalized KPI → weighted score), an explicit assumptions list, and a "known limitations" section that names the ANC-cargo caveat, the OpenSky coverage-bias caveat, and the LA/metro-area disambiguation behavior — since all three are concrete, checkable things a reviewer can verify against the project's own sample questions.

**Warning signs:** The doc's word count on "how to install/run" exceeds its word count on "how the score is computed"; no worked numeric example anywhere in the doc.

**Phase to address:** Phase 6 (Docs), but start it in parallel with Phase 2, not after.

---

### Pitfall 3: Demo can't run on the reviewer's machine
**What goes wrong:** The submission is graded by cloning/running it on a machine that is not the dev machine. Failure modes: an LLM API key that's missing, expired, or scoped wrong; an OpenSky quota already exhausted by the developer's own testing (anonymous tier is roughly 100–400 calls/day, a number easy to burn through while iterating); hardcoded absolute paths (this project is being built on Windows with a **non-ASCII, Hebrew-character home directory path** — any tooling or script that assumes a plain-ASCII path, or that relies on Python, which this environment explicitly lacks, will break on a different machine even if it happens to work here); or a `.env`/config file that isn't documented as required.

**Why it happens:** "It works on my machine" is the default state during development, and the one clean-environment test often gets skipped when time is short — exactly the situation a 24-hour deadline creates.

**How to avoid:** Explicitly stated project constraint: the app must run with **no LLM key at all** (degraded but functional scoring/ranking) — treat this as a literal test to run before submission, not just a design principle. Test a fresh `git clone` into a new directory (ideally with a plain-ASCII path) followed by a clean `npm install && npm run dev`, with no pre-existing local cache or environment state, before calling any phase done. Document every required environment variable in the README with a note on what happens if it's absent. Budget OpenSky calls during development deliberately (or use a mock/fixture mode for iteration) to avoid burning the daily quota before the actual demo/grading run.

**Warning signs:** Any file path containing a hardcoded drive letter, username, or non-portable separator; no `.env.example`; the app has never been run from a completely fresh clone.

**Phase to address:** Phase 6 (Docs & Submission Packaging) should include an explicit "fresh clone" verification step as a checklist item, not an afterthought.

---

### Pitfall 4: No tests on the one piece that's supposed to be deterministic
**What goes wrong:** The scoring engine is the part of the system explicitly required to be deterministic and inspectable — it's also the easiest part to unit test, since it's pure functions over structured input, with no LLM or network nondeterminism involved. Shipping it untested undercuts the project's own emphasis on rigor exactly where rigor is cheapest to demonstrate.

**Why it happens:** Tests feel like "extra" work under a deadline, and it's tempting to reason "I'll test it manually by checking the demo output looks right," which doesn't scale to edge cases (the antimeridian, a zero-movement airport, a tied score) and isn't visible to a reviewer reading the repo.

**How to avoid:** Write unit tests for the scoring engine against fixed, recorded fixture data (a snapshot of real API responses captured once, not live network calls) so tests are fast, deterministic, and don't depend on OpenSky being reachable or rate-limit-available during grading. Cover at minimum: the antimeridian distance case, a zero/near-zero-movement airport (division-by-zero risk in any rate calculation), the ANC cargo-flag behavior, and one full end-to-end worked example matching the one in the design doc.

**Warning signs:** Zero test files anywhere near the scoring module; the design doc's worked example doesn't match what the actual code produces when run.

**Phase to address:** Phase 2 (Scoring Engine) — tests should be written alongside the formula, not deferred to a separate "testing phase" that competes with docs/UI time at the end.

---

### Pitfall 5: Over-claiming — proxy metrics presented as if measured
**What goes wrong:** Per PROJECT.md, passenger-side numbers (capacity, load factor) are unavoidably **derived proxies** (seats × an assumed load factor), not measured data, because no free keyless API publishes passenger counts. If the chat agent or UI presents a proxy number with the same visual/verbal confidence as a directly-measured movement count, it's over-claiming precision the data doesn't have — and the requirements explicitly grades clearly communicating assumptions, uncertainty and scoping, making this a direct requirements miss, not just a nice-to-have.

**Why it happens:** Once a number is computed and displayed, it's easy for the distinction between "measured" and "assumed" to get lost in formatting — both just look like numbers in a UI unless deliberately labeled otherwise.

**How to avoid:** Tag every metric, at the data-model level (not just in prose), with its provenance: `measured` (directly from live movement data), `derived` (computed from measured data via a stated formula, e.g., haul-length from distance), or `proxy` (based on an explicit assumption not derivable from any live API, e.g., load factor). Surface that tag visibly in both the structured API response and the chat narration — a proxy number should never appear without its assumption stated in the same breath.

**Warning signs:** A passenger-capacity number displayed with no visible caveat or footnote; the word "estimated," "assumed," or "proxy" absent from any answer that includes a passenger-derived figure.

**Phase to address:** Phase 2 (Scoring Engine) for the provenance tagging in the data model; Phase 3 (Agent) for surfacing it in every relevant answer.

---

### Pitfall 6: Scope sprawl past the deadline
**What goes wrong:** Additional features (voice input, extra data sources, a fancier ranking algorithm, more chat polish) keep looking tractable "if I just spend one more hour," and the cumulative effect is a submission that's either late or that arrives with its core pieces (scoring rigor, tested code, a clear doc) unfinished because time went to breadth instead.

**Why it happens:** Take-home projects create an unusual incentive to keep adding scope to "seem more impressive," even though this particular requirements explicitly rewards depth of reasoning on a narrower surface over broader completeness.

**How to avoid:** Treat the "Out of Scope" list already written into PROJECT.md (voice, measured passenger volumes, auth, persistent DB, non-US airports, production hardening, real financial modeling) as binding, not aspirational — any new feature idea that shows up mid-build gets checked against that list before any code is written for it. Set a hard feature freeze checkpoint partway through the available time (e.g., roughly two-thirds through the budget) after which only bug fixes, tests, and documentation are added — no new features.

**Warning signs:** A new item being added to the feature list less than a few hours before the deadline; time spent on anything explicitly listed in PROJECT.md's "Out of Scope" section.

**Phase to address:** All phases — enforced by treating PROJECT.md's Out of Scope list as a gate at every phase transition, per its own "Evolution" process.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Hardcoded metro-area groupings (LA, New England, Bay Area) instead of a general geo-clustering algorithm | Fast, correct for the project's actual sample questions | Won't generalize to an unlisted metro area a reviewer might ask about | Acceptable for this project — state the limitation explicitly in the doc |
| In-memory session cache instead of a real cache/DB layer | Zero infra setup, matches "no persistent database" constraint | State lost on restart; no multi-instance sharing | Always acceptable here — explicitly matches PROJECT.md's constraints |
| Single-week OpenSky snapshot instead of a rolling/scheduled data pipeline | Fits the 24-hour, keyless-friendly, live-API constraint | Can't show trend over time, vulnerable to one anomalous week | Acceptable with an explicit seasonality caveat in the doc (see Q1 Pitfall 5) |
| Curated cargo-carrier callsign allowlist instead of a proper aircraft-type/operator database | Cheap, directly solves the ANC case that's actually graded | Incomplete coverage of every cargo operator worldwide | Acceptable — disclose it's a best-effort heuristic, not exhaustive |
| Template-filled numeric answers instead of full LLM free-generation everywhere | Structurally prevents hallucination (Q3 Pitfall 1) | Slightly less conversational flexibility on unusual phrasings | Never worth abandoning for this project — the hallucination risk outweighs the flexibility gain |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|--------------|------------------|-------------------|
| OpenSky Network REST API | Treating anonymous rate limit (~100–400 calls/day) as sufficient for both development iteration and the live grading run | Register/authenticate (OAuth2 client-credentials for accounts created after March 2025, ~4,000 calls/day) or aggressively cache/fixture data during dev so quota survives to the grading demo |
| OpenSky flight/state endpoints | Passing an IATA code where an ICAO code is required (see Q1 Pitfall 1) | Normalize all identifiers to ICAO at the data-layer boundary before any outbound call |
| FAA NAS Status / ADIP / NASR (ArcGIS REST) | Assuming these are stable, low-latency, keyless like OpenSky without verifying — some FAA ArcGIS endpoints are slower and less consistently available | Verify actual behavior/latency during Phase 1 spike, not assumed; add timeouts and graceful degradation from the start |
| LLM provider API | Building the app assuming an API key is always present, since none exists yet per PROJECT.md | Build and test the no-key degraded path (deterministic scoring/ranking only, no chat narration) as a first-class supported mode, not an edge case |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Sequential per-airport API calls in a multi-airport comparison | Response time scales roughly linearly with airport count; demo feels sluggish on any 3+ airport query | Parallelize with `Promise.all` across independent airport fetches | Any query touching more than 2 airports (e.g., the LA-metro comparison, which is 5 airports) |
| No caching of repeated per-session queries | Same airport re-fetched on every follow-up turn | In-memory per-session cache keyed by airport+time-window | Any multi-turn conversation referencing the same airport more than once |
| Unbounded LLM context growth across a long conversation | Latency and cost climb turn over turn; context drift risk (Q3 Pitfall 4) increases | Summarize/trim history, keep explicit structured state instead of relying on full raw transcript | Conversations beyond roughly 6–8 turns |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Concatenating raw upstream API text directly into LLM prompt context | Prompt injection via a third-party data field (Q3 Pitfall 5) | Delimit/label all upstream text as data, never instruction; strip suspicious instruction-like patterns before inclusion |
| Accepting a user-typed airport code/string and passing it straight into an outbound API URL | SSRF / malformed-request risk if the string isn't validated | Allowlist-validate every user-supplied identifier against the canonical airport registry before it reaches any outbound request (explicit PROJECT.md requirement) |
| No per-session rate limiting on the chat endpoint | A single client can exhaust the OpenSky daily quota or LLM budget for everyone, including the reviewer | Per-session/IP rate limiting on the chat API route (explicit PROJECT.md requirement) |
| Exposing the LLM or upstream API key to the browser | Full compromise of both quotas/keys | All secrets and upstream calls stay server-side only (explicit PROJECT.md requirement); verify with a network-tab check during Phase 5 |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Silent airport disambiguation (picks one of several matches) | Analyst gets a confidently wrong answer about the wrong airport(s) with no signal anything was assumed | Always restate the resolved airport code(s) in every answer; explicitly list all candidates for ambiguous references |
| Blank/spinner-only loading state during a multi-step tool-calling chain | Demo reads as "broken" or "hung" during grading | Progressive status text per tool call ("Fetching data for LAX... BUR... SNA...") |
| A score shown with no visible breakdown | Analyst (or reviewer) can't verify or challenge the number | Always show component KPIs, weights, and sample window alongside any composite score |
| Proxy/derived numbers formatted identically to measured numbers | Reader can't tell what's solid vs. assumed, undermining the "communicate uncertainty" requirement | Visible provenance tag (measured / derived / proxy) on every number, in both API payload and chat text |

## "Looks Done But Isn't" Checklist

- [ ] **Airport resolution:** Often missing metro-area disambiguation (LA, New England) and AK/HI ICAO-prefix handling — verify with explicit test cases for "LA," "Santa Ana," and "Anchorage."
- [ ] **Scoring engine:** Often missing unit tests against fixed fixture data, small-sample confidence flags, and a visible weight/rationale table — verify a fresh test run passes without live network access.
- [ ] **ANC handling:** Often missing the cargo-carrier flag and the passenger-demand caveat — verify by literally asking the agent the project's own sample question ("% of long-haul flights out of Anchorage") and checking the caveat appears.
- [ ] **No-LLM-key mode:** Often missing entirely, since it's easy to always test with a key present during dev — verify by unsetting the LLM key and confirming scoring/ranking still works.
- [ ] **Fresh-clone runnability:** Often broken by a hardcoded path or an assumption specific to the dev machine — verify with an actual `git clone` into a new directory and a clean install/run.
- [ ] **Design doc methodology section:** Often thin or written last — verify it contains the literal formula, weight table, one worked example, and a named limitations list (coverage bias, seasonality, ANC cargo, proxy metrics).
- [ ] **Rate limiting / security guardrails:** Often deferred as "not important for a demo" — verify these are explicit requirements in PROJECT.md, not optional polish.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|-----------------|------------------|
| Hallucinated number discovered late | MEDIUM | Retrofit the post-generation numeric-provenance check (Q3 Pitfall 1, option 2) — faster to bolt on than redesigning the narration flow from scratch |
| ANC caveat missing, discovered near deadline | LOW | Add a static, hardcoded caveat string keyed on airport code (`if code === "PANC"`) as a stopgap if the general carrier-filter logic can't be finished in time — an honest hardcoded caveat beats a missing one |
| LA disambiguation missing, discovered near deadline | LOW | Same pattern — hardcode the known metro groupings as a lookup table; this is cheap regardless of how late it's caught |
| No fresh-clone test done, deadline imminent | LOW-MEDIUM | Run it immediately in a throwaway directory before submission; budget 15–20 minutes minimum for this no matter how rushed the end of the day is |
| Scoring engine untested, deadline imminent | MEDIUM | Write at minimum the antimeridian case and one zero-movement-airport case — the two edge cases most likely to actually break something, even if full coverage isn't reached |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|--------------------|----------------|
| ICAO/IATA confusion, AK/HI prefix breakage | Phase 1 | Test resolver against ANC, PHNL, and a continental airport in one suite |
| LA / Santa Ana metro-area ambiguity | Phase 1 + Phase 3 | Ask the agent the project's own "compare LA and Santa Ana" question and confirm it lists/disambiguates |
| OpenSky coverage bias undisclosed | Phase 2 + Phase 6 | Grep the design doc for an explicit coverage-bias caveat |
| UTC/day-window ambiguity | Phase 2 | Confirm every rate metric's response payload includes an explicit sample window |
| Seasonality oversold as representative | Phase 2 + Phase 6 | Confirm every metric carries a sample date range and the doc names Anchorage's seasonality explicitly |
| ANC cargo/long-haul conflation | Phase 2 + Phase 3 | Ask the agent the project's own ANC sample question; confirm the cargo caveat appears in the answer |
| Antimeridian distance error | Phase 2 | Unit test with an Anchorage-to-Asia coordinate pair |
| Raw-count size bias / circularity in scoring | Phase 2 | Confirm ranking order changes when normalization is toggled off vs. on, and doesn't just track airport size |
| Arbitrary weights undisclosed | Phase 2 + Phase 6 | Confirm the weight table is visible in both API output and doc |
| Double-counted correlated KPIs | Phase 2 | Manual review of the KPI list for conceptual overlap before finalizing weights |
| Small-sample noise | Phase 2 | Confirm a `sampleSize`/confidence field exists on every rate-based metric |
| Hallucinated numbers | Phase 3 | Automated provenance check comparing narrated numbers to engine output, run against a fixed set of test conversations |
| Fuzzy resolution failing quietly | Phase 1 + Phase 3 | Confirm every chat response restates the resolved airport code(s) |
| Multi-turn context drift | Phase 3 | Manual multi-turn test script covering "what about X" and "compare those two" |
| Prompt injection via upstream fields | Phase 5 | Confirm all upstream text is delimited/labeled before reaching LLM context; test with a synthetic injected string in a mocked API response |
| Chained-call latency | Phase 3 + Phase 4 | Time a 5-airport comparison query; confirm parallelization and progressive status UI |
| UI polish over reasoning | All phases (budget discipline) | Time-tracking checkpoint at each phase boundary against the planned allocation |
| Thin design doc | Phase 6 (started during Phase 2) | Doc reviewed against the "methodology section" checklist item above before submission |
| Demo unrunnable on reviewer's machine | Phase 6 | Literal fresh-clone-and-run test performed before submission |
| Untested scoring engine | Phase 2 | Test suite exists and passes offline (fixture data, no live network dependency) |
| Over-claiming proxy metrics | Phase 2 + Phase 3 | Confirm every passenger-derived number carries a visible provenance tag |
| Scope sprawl | All phases | PROJECT.md's Out of Scope list checked at every phase transition per its own Evolution process |

## Sources

- [Anchorage International Airport Ranks Top in US for Cargo, 3rd Globally — Alaska Business Magazine](https://www.akbizmag.com/industry/transportation/anchorage-international-airport-ranks-top-in-us-for-cargo-3rd-globally/) — HIGH confidence (recent, specific figures)
- [Anchorage: the world's cargo hub — Flightradar24 Blog](https://www.flightradar24.com/blog/aviation-explainer-series/anchorage-worlds-cargo-hub/) — HIGH confidence (aviation-data-specialist source, corroborates freighter/technical-stop figures)
- [Why US Airports' ICAO Codes Start With The Letter K — Simple Flying](https://simpleflying.com/why-us-airports-icao-codes-start-with-the-letter-k/) — HIGH confidence, corroborated by multiple independent sources on the Alaska (PA-) / Hawaii (PH-) exception
- [OpenSky Report 2025: Improving Crowdsourced Flight Trajectories with ADS-C Data (arXiv)](https://arxiv.org/abs/2505.06254) — HIGH confidence, primary source on OpenSky's own acknowledged coverage-gap limitations
- [OpenSky REST API rate limits — openskynetwork/opensky-api docs](https://github.com/openskynetwork/opensky-api/blob/master/docs/free/rest.rst) — MEDIUM confidence (exact anonymous-tier number varies slightly across secondary sources; authenticated-tier figure and OAuth2-since-March-2025 requirement corroborated across multiple sources)
- [List of airports in the Los Angeles area — general travel/airport-guide sources cross-checked (LAX, BUR, LGB, SNA/John Wayne–Santa Ana, ONT)](https://www.godigit.com/international-travel-insurance/airports/airports-in-los-angeles) — HIGH confidence, consistent across all sources checked
- `.planning/PROJECT.md` — primary project-constraint source for all project-specific pitfalls (requirements language, scope boundaries, security/honesty requirements)

---
*Pitfalls research for: airport-investment-agent (FDE take-home)*
*Researched: 2026-08-12*
