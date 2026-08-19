---
phase: 04-conversational-agent
verified: 2026-08-19T13:35:00Z
status: gaps_found
score: 5/10 must-haves verified
behavior_unverified: 2
overrides_applied: 0
gaps:
  - truth: "Numeric values shown in the UI are rendered directly from the scoring engine's structured tool output, never parsed out of the LLM's prose (CHAT-02 / Roadmap SC #2)."
    status: failed
    reason: "The API response and UI have exactly one payload field, `data.narrative` — the raw text Gemini writes itself (`response.text` in google.ts). page.tsx renders `message.text` with no other rendering path. There is no code that takes ExpansionScore's structured numbers and injects/renders them into the UI independent of the LLM's own prose; the LLM is only asked, via a system-prompt instruction, not to invent numbers. That is a trust-based convention, not a structural guarantee, and it is the opposite of what the success criterion requires (numbers rendered directly from structured output, never parsed out of prose)."
    artifacts:
      - path: "src/app/api/chat/route.ts"
        issue: "Only returns `{ data: { narrative: string } }` — no structured score/comparison payload alongside the prose."
      - path: "src/app/page.tsx"
        issue: "Renders only `message.text` (the narrative string) — no separate rendering of ExpansionScore fields."
      - path: "src/adapters/llm/google.ts"
        issue: "`runAgent` returns `response.text ?? ''` — the model's own free-form text is the entire deliverable; tool results (real ExpansionScore objects) are fed back into the chat but never surfaced to the caller directly."
    missing:
      - "A code path that renders/attaches the actual ExpansionScore (or a derived ranked-list/comparison structure) to the API response and UI independent of the LLM's prose, per the roadmap's explicit wording."
  - truth: "Analyst can ask for the share of long-haul flights from an airport, computed by great-circle distance against a stated, cited threshold (QUERY-03 / part of Roadmap SC #4)."
    status: failed
    reason: "Confirmed via grep across src/domain/scoring and src/domain/agent (and the whole src tree): no great-circle-distance, haversine, or long-haul-share logic exists anywhere in the codebase. ExpansionScore's components are limited to volume/headroom/delayFrequency; there is no distance calculation and no distance/duration field on any flight-movement record that a long-haul threshold could be computed against."
    artifacts:
      - path: "src/domain/scoring/expansionScore.ts"
        issue: "No long-haul / distance-threshold computation exists; only volume, headroom, and delay-frequency KPIs are computed."
      - path: "src/domain/agent/tools.ts"
        issue: "No tool exposes a long-haul-share capability for the LLM to call."
    missing:
      - "A great-circle-distance function over resolved flight endpoints (or airport-pair coordinates), a stated/cited long-haul threshold, and a tool/handler surfacing the computed share."
  - truth: "Analyst can ask why an airport has unmet demand and receive an explanation naming the airport-specific physical cause via runway separation cross-referenced with delay conditions, not a generic high-utilization statement (QUERY-04 / part of Roadmap SC #4)."
    status: failed
    reason: "FaaFacility.runways carries each runway's endpoint lat/lon (RunwayGeometry), which is the raw material needed to compute parallel-runway separation — but no function anywhere computes that separation distance, and it is never surfaced into ExpansionScore or any tool result. The only capacity-related metric the LLM can see is `headroom.kpi.movementsPerRunway` (total movements ÷ runway count) — exactly the generic 'high utilization' statistic the requirement explicitly says does not satisfy it. Confirmed via grep: zero matches for 'separation' anywhere in src/ (the only match is an unrelated word inside a test file, not implementation)."
    artifacts:
      - path: "src/domain/adapters/faaFacility.ts"
        issue: "RunwayGeometry captures end1/end2 lat/lon per runway but nothing derives a parallel-runway separation distance from it."
      - path: "src/domain/scoring/expansionScore.ts"
        issue: "computeHeadroomKpi only computes movementsPerRunway (a count-based ratio), not a physical-cause explanation tied to runway geometry or cross-referenced with delay events."
    missing:
      - "A runway-separation computation from RunwayGeometry endpoints, cross-referenced with NasStatus delay events, exposed to the LLM as a distinct unmet-demand-cause signal."
  - truth: "Every answer states its assumptions, the data window used, and what is measured versus proxied (final clause of Roadmap SC #4 / QUERY-05)."
    status: failed
    reason: "Movements.window (begin/end ISO timestamps) is computed by the OpenSky adapter but is discarded before reaching ExpansionScore — computeVolumeKpi only extracts passengerMovements/cargoMovements/totalMovements, dropping `window`. No structured field carries the data window, an assumptions list, or a measured-vs-proxied label into the tool results the LLM sees. The system prompt (google.ts SYSTEM_PROMPT) instructs the model only not to invent numbers; it says nothing about disclosing assumptions, data window, or proxy status. There is no code-level guarantee this disclosure happens, and no data is even available for the model to disclose accurately (e.g. the exact window used)."
    artifacts:
      - path: "src/domain/scoring/expansionScore.ts"
        issue: "ScoringInput/ExpansionScore carry no window, assumptions, or measured-vs-proxied metadata."
      - path: "src/adapters/llm/google.ts"
        issue: "SYSTEM_PROMPT does not instruct disclosure of assumptions/data window/measured-vs-proxied status."
    missing:
      - "Surface Movements.window (and any other proxy/assumption metadata) through ScoringInput/ExpansionScore into the tool result, and instruct the model (or structurally enforce) that every answer states it."
behavior_unverified_items:
  - truth: "Analyst can ask a follow-up (\"why?\", \"what about Boston?\", \"compare those two\") and the agent resolves it against prior turns' resolved airports and results (CHAT-03 / Roadmap SC #3)."
    test: "Send two /api/chat requests with the same x-session-id: (1) 'which New England airports are strong candidates?', (2) 'what about Boston?' or 'why?' — inspect whether the second answer correctly references airports/scores from turn 1."
    expected: "The second answer resolves the ambiguous follow-up against the first turn's actual resolved airports and scores, not a fresh unrelated answer."
    why_human: "sessionStore.ts + google.test.ts prove the mechanism (same sessionId reuses the same Gemini Chat object, which natively retains prior turns' history including tool results) is present and unit-tested, but whether Gemini's own reasoning genuinely resolves a pronoun/ellipsis follow-up correctly is live LLM behavior — it cannot be verified via grep/static analysis, and the only smoke test present (live.smoke.ts) checks a single-turn function-call round-trip, not cross-call follow-up resolution, and is opt-in/not run in this verification pass."
  - truth: "Given a region, two named airports, or one named airport, the analyst gets a ranked list with scores or a side-by-side single-KPI comparison with the difference (first two clauses of Roadmap SC #4 — QUERY-01/QUERY-02)."
    test: "Ask 'which New England airports are strong candidates?' and 'compare KATL and KSFO on movements per runway' against a live Gemini session; inspect whether the narrated answer is actually formatted as a ranked list / states an explicit numeric difference."
    expected: "A ranked list with each airport's real score, or a comparison stating both KPI values and their numeric difference, sourced from the real score_airports tool result."
    why_human: "The underlying data path is real (score_airports calls the deterministic scoring engine), but no code computes a ranked ordering or a numeric difference — that formatting/arithmetic is left entirely to the LLM's own prose generation, so whether the final answer is actually presented as a ranked list or a correct difference can only be confirmed by an actual live model response, not by reading the code."
human_verification:
  - test: "Send two /api/chat requests with the same x-session-id: (1) 'which New England airports are strong candidates?', (2) 'what about Boston?' or 'why?' — inspect whether the second answer correctly references airports/scores from turn 1."
    expected: "The second answer resolves the ambiguous follow-up against the first turn's actual resolved airports and scores, not a fresh unrelated answer."
    why_human: "Requires a live Gemini call; session continuity mechanism is unit-tested but actual multi-turn reasoning is not verifiable statically."
  - test: "Ask 'which New England airports are strong candidates?' and 'compare KATL and KSFO on movements per runway' against a live Gemini session; inspect whether the narrated answer is actually formatted as a ranked list / states an explicit numeric difference."
    expected: "A ranked list with each airport's real score, or a comparison stating both KPI values and their numeric difference, sourced from the real score_airports tool result."
    why_human: "Ranking/differencing is left to LLM prose generation with no code-level guarantee; only a live response can confirm."
---

# Phase 4: Conversational Agent — Chat, Tool-Calling & Analyst Questions Verification Report

**Phase Goal:** An analyst can ask airport-investment questions in plain English through a chat UI and get ranked, explained, narrated answers whose every number is drawn directly from the scoring engine's output — including follow-ups that build on prior turns. This is the earliest point at which the system is demoable end-to-end.

**Verified:** 2026-08-19T13:35:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Important Context Acknowledged

- `04-PLAN.md` predates the structured GSD plan format (no frontmatter, no `must_haves`, no `requirements:` field). Must-haves for this verification were derived from ROADMAP.md's Phase 4 Success Criteria (the roadmap contract) plus the requirement IDs traced to Phase 4 in REQUIREMENTS.md, per the fallback procedure.
- The architecture pivoted during implementation from the plan's original manual `parseIntent()`/`narrateAnswer()` design to Gemini's native function-calling (`runAgent` in `src/adapters/llm/google.ts`, tools in `src/domain/agent/tools.ts`). This is a legitimate, documented pivot (CLAUDE.md Architecture section, 04-SUMMARY.md key-decisions) and is not itself treated as a gap. However, verifying the *goal* against the *as-built* architecture surfaced a structural consequence: because the model writes the entire final answer as free text, and the API/UI expose only that text, the roadmap's specific wording for SC #2 ("never parsed out of the LLM's prose") is not met by construction — see the CHAT-02 gap below.
- Two gaps flagged in advance in 04-SUMMARY.md/STATE.md were independently confirmed in this session:
  1. `MAX_AIRPORTS_PER_QUERY` cap removed from `buildScoringInputs.ts`, nothing replaced it (confirmed: no such symbol exists anywhere in `src/`). This is a cost/resource-control gap, not a direct roadmap Success Criterion, so it is reported as an informational finding rather than a blocking gap — but it was knowingly left unfixed and should be tracked before any wider use.
  2. QUERY-03 (long-haul/great-circle) is confirmed genuinely unimplemented — see gap above, not a false alarm.
- Separately, ROADMAP.md's Phase 3 checkbox is unchecked and STATE.md's `completed_phases: 2`, even though git history (`967beaa`, `03-REVIEWS.md`) shows Phase 3 code-reviewed and its adapters (`faaFacility.ts`, `expansionScore.ts`) are live, tested, and actively used by Phase 4's tool-calling path. Phase 4 functionally depends on and consumes Phase 3's scoring engine successfully (confirmed by passing tests and working imports), but Phase 3 is not administratively marked complete in ROADMAP.md/STATE.md. This is flagged for the project owner's attention, not resolved here — Phase 4's own goal achievement does not hinge on Phase 3's roadmap checkbox state, only on the actual code being present and working, which it is.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Analyst can type an NL question and receive a narrated answer (CHAT-01 / SC #1) | ✓ VERIFIED | `POST /api/chat` (route.ts) validates body, rate-limits, calls `runAgent`, returns `{ok:true,data:{narrative}}`; `page.tsx` renders it. `route.test.ts` (3/3) and `google.test.ts` (4/4) pass. |
| 2 | Numeric values shown in the UI are rendered directly from the scoring engine's structured tool output, never parsed out of the LLM's prose (CHAT-02 / SC #2) | ✗ FAILED | See gaps. UI/API expose only `narrative` (the LLM's own text). |
| 3 | Follow-up questions resolve against prior turns' resolved airports/results (CHAT-03 / SC #3) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `sessionStore.ts` + `google.test.ts` prove session-scoped Chat reuse is wired; actual cross-turn resolution is live-LLM behavior, not statically verifiable. |
| 4a | Region query → ranked list with scores (QUERY-01, part of SC #4) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `resolve_region` → `score_airports` chain is real and tested (`tools.test.ts`); "ranked list" formatting is left to LLM prose with no code-level guarantee. |
| 4b | Two named airports → side-by-side single-KPI comparison with the difference (QUERY-02, part of SC #4) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `score_airports` returns real per-airport KPIs; no code computes the stated "difference" — left to the LLM. |
| 4c | Long-haul flight share by great-circle distance against a stated, cited threshold (QUERY-03, part of SC #4) | ✗ FAILED | No great-circle/haversine/long-haul logic anywhere in `src/` (grep-confirmed). |
| 4d | Airport-specific unmet-demand explanation via runway separation cross-referenced with delay conditions (QUERY-04, part of SC #4) | ✗ FAILED | `RunwayGeometry` endpoint data exists but no separation computation exists or is surfaced; only a generic movements-per-runway ratio is computed. |
| 4e | Every answer states assumptions, data window used, and measured-vs-proxied (QUERY-05, tail of SC #4) | ✗ FAILED | `Movements.window` is computed but discarded before reaching `ExpansionScore`; no assumptions/proxy metadata is surfaced; system prompt doesn't instruct disclosure. |
| 5a | Chat transport sits behind an adapter interface with a single text implementation (CHAT-04, first half of SC #5) | ✓ VERIFIED | `runAgent(sessionId, query): Promise<string>` is the single text-in/text-out seam; `route.ts` is its only caller. (Not a formally declared TS `interface`, but functionally a single seam — no second implementation exists to violate it.) |
| 5b | Text from third-party API responses is treated as untrusted data inside LLM context, never as instructions (SEC-04, second half of SC #5) | ✓ VERIFIED | `ExpansionScore`/tool results carry only numbers and fixed enum reason codes (`AdapterFailReason`) — no raw upstream text (airport names, NAS event `Reason` strings, callsigns) is ever included in any tool response fed back to Gemini. Confirmed by reading `expansionScore.ts` types and `tools.ts` handlers end-to-end. |

**Score:** 5/10 truths verified (2 present, behavior-unverified; 3 failed as structural/code gaps, counted among the 10 sub-clauses of the 5 roadmap Success Criteria)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/app/api/chat/route.ts` | Zod-validated, rate-limited chat endpoint | ✓ VERIFIED | Present, substantive, wired; 3/3 tests pass. |
| `src/adapters/llm/google.ts` | Gemini client + tool-round orchestration | ✓ VERIFIED | Present, substantive, wired; 4/4 tests pass. |
| `src/adapters/llm/sessionStore.ts` | Session-scoped Chat TTL map | ✓ VERIFIED | Present, substantive, wired into `google.ts`. |
| `src/domain/agent/tools.ts` | Tool declarations + handlers bridging to scoring/airports | ✓ VERIFIED | Present, substantive, wired; 2/2 tests pass. |
| `src/lib/rateLimiter.ts` | Per-session rate limiting | ✓ VERIFIED | Present, substantive, wired; exercised by `route.test.ts`'s burst test. |
| `src/app/page.tsx` | Chat UI | ✓ VERIFIED (as a text-narrative renderer) | Present, substantive, wired — but only renders the narrative string (see CHAT-02 gap; this is a wiring/scope gap, not a missing artifact). |
| Long-haul/great-circle module | QUERY-03 support | ✗ MISSING | Does not exist anywhere in `src/`. |
| Runway-separation computation | QUERY-04 support | ✗ MISSING | Does not exist; only raw endpoint geometry is fetched, never reduced to a separation distance. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `route.ts` | `google.ts` (`runAgent`) | direct call | ✓ WIRED | Confirmed by import + test mocks. |
| `google.ts` | `tools.ts` (`TOOL_HANDLERS`) | function-call dispatch loop | ✓ WIRED | Confirmed by `isToolName` gate + handler invocation + tests. |
| `tools.ts` | `buildScoringInputs.ts` / `expansionScore.ts` | direct call | ✓ WIRED | `scoreAirportsTool` calls `buildScoringInputs` then `scoreAirports`; confirmed by `tools.test.ts`. |
| `tools.ts` | `regions.ts` (`lookupAirports`) | direct call | ✓ WIRED | `resolveRegion` calls `lookupAirports`; confirmed by `tools.test.ts`. |
| `google.ts` tool result | `route.ts` response `data.narrative` | `response.text` only | ⚠️ PARTIAL (by design gap) | The structured tool result (real `ExpansionScore[]`) is fed back into the Gemini conversation but is never itself forwarded to the API response or UI — only the model's subsequent free-text reply is. This is the mechanical root of the CHAT-02 gap. |
| `page.tsx` | `/api/chat` | `fetch` in `handleSubmit` | ✓ WIRED | Confirmed: request sent, response parsed, rendered into message list. |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| CHAT-01 | NL question → narrated answer via chat UI | ✓ SATISFIED | route.ts + page.tsx + google.ts, tests passing. |
| CHAT-02 | Numeric values rendered from structured tool output, never parsed from LLM prose | ✗ BLOCKED | See gap above — no structured rendering path exists. |
| CHAT-03 | Follow-ups resolve against prior turns | ? NEEDS HUMAN | Mechanism present and unit-tested; live LLM behavior not verifiable statically. |
| CHAT-04 | Chat transport behind adapter interface, single text implementation | ✓ SATISFIED | `runAgent` is the sole seam. |
| QUERY-01 | Region → ranked list with scores | ? NEEDS HUMAN | Real data path exists; ranking format left to LLM. |
| QUERY-02 | Two-airport single-KPI comparison with difference | ? NEEDS HUMAN | Real data path exists; difference computation left to LLM. |
| QUERY-03 | Long-haul share via great-circle distance, stated/cited threshold | ✗ BLOCKED | Not implemented anywhere. |
| QUERY-04 | Unmet-demand explanation via runway separation × delay conditions | ✗ BLOCKED | Not implemented; only a generic utilization ratio exists. |
| QUERY-05 | Every answer states assumptions, data window, measured-vs-proxied | ✗ BLOCKED | Data window is computed then discarded; no assumptions/proxy metadata surfaced. |
| SEC-04 | Third-party API text treated as untrusted, never as instructions | ✓ SATISFIED | No raw upstream text ever enters any tool response fed to the LLM. |

No orphaned requirements: all 10 IDs mapped to Phase 4 in REQUIREMENTS.md's traceability table were addressed above (04-PLAN.md carries no `requirements:` frontmatter to cross-check against, consistent with 04-SUMMARY.md's stated deviation).

### Anti-Patterns Found

None. Grep for `TODO|FIXME|XXX|TBD|HACK|PLACEHOLDER` and stub-narration phrases across `src/` returned no real hits inside Phase 4's files (the only "placeholder" matches were the HTML `placeholder=` attribute on `page.tsx`'s input element, a false positive, confirmed by re-grep restricted to debt-marker keywords only).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes | `npx vitest run` | 100/100 tests passed, 18/18 files, in 1.79s | ✓ PASS |
| Type-checks cleanly | `npx tsc --noEmit` | No output, exit clean | ✓ PASS |
| Phase-4-specific tests | `npx vitest run --reporter=verbose src/domain/agent/tools.test.ts src/app/api/chat/route.test.ts src/adapters/llm/google.test.ts` | 9/9 passed | ✓ PASS |
| Live Gemini follow-up behavior | N/A — would require live `GOOGLE_GENERATIVE_AI_API_KEY` call and network access | Not run | ? SKIP — routed to human verification |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention exists in this project and neither `04-PLAN.md` nor `04-SUMMARY.md` declares any probe scripts. Skipped.

## Gaps Summary

Phase 4 delivers a genuinely working, demoable chat agent: the transport, session memory mechanism, rate limiting, tool-calling wiring into the real deterministic scoring engine, and untrusted-data hygiene are all real and test-covered (confirmed independently, not just per SUMMARY.md's claims — 100/100 tests, clean `tsc`). That is the majority of the phase's value and it is solid.

However, three of the roadmap's stated Success Criteria are not met by the current code, not merely "unverified":

1. **CHAT-02 (SC #2)** is structurally unmet: the UI/API only ever expose the LLM's own free-text narrative. There is no code path that renders scoring-engine numbers independent of what the model chooses to type. This directly contradicts the project's stated Core Value ("every number... must be traceable to a deterministic computation") — the *computation* is deterministic and correct, but nothing enforces that the *displayed* number is the one the computation produced. This is the most important gap: it undermines the project's central claim, not a peripheral feature.
2. **QUERY-03 (part of SC #4)** — long-haul flight share by great-circle distance — is entirely unimplemented. Confirmed by exhaustive grep, not just a naming mismatch.
3. **QUERY-04 (part of SC #4)** — the airport-specific physical-cause unmet-demand explanation via runway separation — is unimplemented; only a generic movements-per-runway ratio exists, which is exactly what the requirement explicitly rules out as insufficient.
4. **QUERY-05 (tail of SC #4)** — universal disclosure of assumptions/data-window/measured-vs-proxied — has no code-level support; the underlying data window is computed and then discarded before it could ever be disclosed accurately.

Two additional Success-Criterion sub-clauses (QUERY-01 ranked list, QUERY-02 comparison-with-difference) and CHAT-03 (follow-up resolution) have real, tested data plumbing but their user-facing correctness depends entirely on live LLM behavior with no code-level guarantee — these are routed to human verification, not marked failed, since the mechanism is genuinely present and wired.

The already-known, deliberately-deferred gap (`MAX_AIRPORTS_PER_QUERY` cap removal) is reported for completeness but does not block phase-goal achievement on its own; it is a resource/cost-control concern, not one of the roadmap's stated Success Criteria.

---

_Verified: 2026-08-19T13:35:00Z_
_Verifier: Claude (gsd-verifier)_
