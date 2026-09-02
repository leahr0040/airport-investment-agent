# Phase 5: Security Hardening, Design Doc & Submission Packaging - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-02
**Phase:** 05-security-hardening-design-doc-submission-packaging
**Areas discussed:** Security verification, Design doc shape, AI-usage disclosure, Submission packaging

---

## Area selection

Four gray areas were offered: Security verification, Design doc shape, AI-usage disclosure,
Submission packaging. The user initially selected **Security verification** only; the remaining
three were reached afterwards when it was flagged that DOC-01 is the bulk of the phase and
leaving it undiscussed would force the planner to guess.

---

## Security verification — daily quota ceiling

| Option | Description | Selected |
|--------|-------------|----------|
| Global daily cap | One process-wide `RateLimiterMemory({points: 20, duration: 86400})`, constant key. Protects the real shared resource — the API key's quota is global, not per-session. | |
| Per-session daily cap | Same duration keyed by session id. Matches the requirement's literal wording, but two browser tabs get two full budgets. | |
| Both | Session daily cap plus a global backstop. Most correct; three limiter tiers on a one-day artifact. | |
| Leave it, document it | Per-minute limit stays as the only control; `DESIGN.md` names the 20/day ceiling as a known limitation with its workaround. | ✓ |

**User's choice:** Leave it, document it.
**Notes:** The problem was explained in Hebrew at the user's request. The stated tradeoff was
accepted explicitly: the Gemini free tier is 20 requests/day (confirmed live via 429 on
2026-08-23) while the session limiter is 10/minute, so a reviewer can exhaust the day's budget in
about three minutes without tripping any limit. All three code options cost roughly the same
(2–5 lines, reusing the existing `RateLimiterMemory` pattern); the user chose documentation over
code, accepting that the LLM budget itself remains unprotected.

---

## Security verification — proving SEC-01

The user first replied "I don't understand the problem, please specify." A fuller explanation
was given in Hebrew: how Next.js bundles `'use client'` files and everything they import; that
`page.tsx` currently imports nothing from `domain/` or `config/` so the boundary holds today;
that `server-only` in four files makes a client import a build failure; and that the gap is that
the three `.client.ts` files actually holding the upstream base URLs (`opensky.client.ts`,
`nasStatus.client.ts`, `faaFacility.client.ts`) are protected only transitively.

| Option | Description | Selected |
|--------|-------------|----------|
| `server-only` + documented verification | One import per client file, plus one recorded run written up in the design doc. Prevention plus evidence. | |
| `server-only` only | Three import lines. Build breaks on a client import; no written evidence for the reviewer. | ✓ |
| Bundle-scanning test | `next build` then scan `.next/static` for variable names and upstream hosts. Strongest evidence; slow and needs valid credentials. | |
| Documentation only | No code change; run the check manually once and record command and output. | |

**User's choice:** `server-only` only.
**Notes:** Prevention chosen without an accompanying written proof — SEC-01 rests on the build
failing, not on a recorded verification.

---

## Design doc shape — source of the worked example

| Option | Description | Selected |
|--------|-------------|----------|
| Existing test fixtures | `expansionScore.test.ts` already runs the engine against fixed inputs. Real, deterministic, re-verifiable with `npm test` — no credentials, no quota spent. | ✓ |
| Live API run | Run a real query and paste the output. More impressive, but the numbers go stale and the reviewer cannot reproduce them. | |
| Hand-written illustrative numbers | Invent three airports with round numbers. Most readable, but unchecked against the code and liable to drift out of sync silently. | |

**User's choice:** Existing test fixtures.

---

## Design doc shape — location and scope

| Option | Description | Selected |
|--------|-------------|----------|
| One `DESIGN.md` at the repo root | Beside `README.md`, linked from it. All four required parts in one place. | ✓ |
| `docs/` with several files | Methodology / security / AI usage split apart. Tidier, but scatters the argument across several reads. | |
| Extend `README.md` | Add the four parts to the existing README. One document, but mixes run instructions with long-form reasoning and bloats the reviewer's entry point. | |

**User's choice:** One `DESIGN.md` at the repo root.

---

## AI-usage disclosure scope

| Option | Description | Selected |
|--------|-------------|----------|
| Product and build, separately | One subsection on the LLM's runtime role (narrates, never computes), a second stating the project was built with Claude Code. Transparency over omission for an FDE submission. | ✓ |
| Product only | Describe only the LLM's runtime role. Narrower; conspicuous if the reviewer expects build-process disclosure. | |
| Product, plus one sentence on the build | Full detail on LLM architecture, one line acknowledging Claude Code. | |

**User's choice:** Product and build, separately.

---

## Submission packaging

Multi-select. Offered: README correction (flagged mandatory), sample questions in the README,
a sample chat transcript, and shipping `.planning/` as an evidence trail.

| Option | Description | Selected |
|--------|-------------|----------|
| Fix `README.md` | Correct the "does not yet ship a chat UI or the scoring engine" claim; link to `DESIGN.md`. | ✓ |
| Sample questions in README | The brief's four questions, so the reviewer knows what to type and does not burn the 20/day quota guessing. | |
| Sample chat transcript | One real answer copied into the docs — proves the system works even if the reviewer's quota runs out. | |
| Ship `.planning/` | Keep the full planning and decision trail in the submission as evidence of reasoning depth. | |

**User's choice:** README correction only.
**Notes:** `.planning/` was neither selected nor explicitly excluded. It is already committed to
git, so the standing default is that it ships untouched. Recorded in CONTEXT.md as an open item
rather than resolved by assumption.

---

## Claude's Discretion

- Section ordering and headings inside `DESIGN.md`.
- Which fixture airport carries the worked example, and how the normalization step is presented.
- Exact wording of the README correction.
- Whether the stale SEC-02 note in `REQUIREMENTS.md` gets corrected as part of this phase.

## Deferred Ideas

- Daily quota cap (global and/or per-session, `duration: 86400`) — declined; documented instead.
- Bundle-scanning SEC-01 test — declined.
- Documented manual SEC-01 verification — declined.
- `docs/` directory with split design documents — declined.
- Sample questions in the README; sample chat transcript in the submission — not selected.
- Reinstating a registry-backed airport allowlist (the original SEC-02 design) — out of scope.
