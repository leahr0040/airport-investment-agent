# CR-02 Fix Options: Cargo-Carrier Callsign Misclassification

## Summary

`CARGO_CALLSIGN_PREFIXES` in `src/domain/scoring/expansionScore.ts` includes `'DAL'`
(Delta Air Lines), `'AAL'` (American Airlines), and `'ACA'` (Air Canada) — three
large-scale **passenger**-mainline ICAO callsign prefixes. `isCargoCallsign` prefix-matches
against this list inside `computeVolumeKpi`, so every Delta/American/Air Canada movement in
the observed window is counted as `cargoMovements` instead of `passengerMovements`. Since
`passengerMovements` feeds the "volume" KPI (1/3 of `SCORING_WEIGHTS`), this systematically
deflates the volume score — and therefore the final expansion score — for every major hub
with meaningful Delta/American/Air Canada traffic, i.e. most large US airports. This is
silent: no flag, no "assumed" label, and `expansionScore.test.ts`'s existing "case group 6"
test currently locks the misclassification in as intended behavior. `03-02-PLAN.md`'s
threat model (T-03-08) previously accepted this at "low" severity as a disclosed,
non-security scoring assumption; the Phase 3 code review's "critical" classification
supersedes that earlier acceptance and is the current, correct severity — that tension is
not resolved here, it is the user's call.

## Option 1: Remove `'DAL'`, `'AAL'`, `'ACA'` from `CARGO_CALLSIGN_PREFIXES`

**Change required:** Delete the three entries from the `CARGO_CALLSIGN_PREFIXES` array in
`expansionScore.ts`. No other code changes; `isCargoCallsign`/`computeVolumeKpi` logic is
untouched.

**What it fixes:** Eliminates the systematic deflation of `passengerMovements`/volume score
for every airport with material Delta, American, or Air Canada mainline traffic — the
dominant, real-world case for nearly all major US hubs. This is the simplest possible fix
and directly reverses the miscategorization the code review flagged as critical.

**Residual inaccuracy left behind:** Air Canada in particular does operate some dedicated
freighter aircraft under the same `'ACA'` ICAO callsign prefix as its passenger flights (and
Delta/American each have limited belly-cargo-only operations, not a separate freighter
callsign prefix, so removing `'DAL'`/`'AAL'` has no equivalent freighter-undercounting
side effect). Removing `'ACA'` means any genuine Air Canada Cargo freighter movement is now
counted as a passenger movement instead of cargo — a small, disclosed residual gap, not a
full fix of "distinguish freighter from passenger flights within one carrier's callsign
prefix." OpenSky's `Movements` type carries no aircraft-type or seat-capacity field (per
CLAUDE.md's Q1 findings: "No passenger count, no aircraft type/seat capacity, no carrier
name field — only `callsign`"), so this residual gap cannot be closed without a new data
source (see Option 2).

## Option 2: Layer a secondary freighter-vs-passenger heuristic on top of the prefix check

**Change required:** In addition to Option 1's removal, add a secondary signal (e.g. a
known freighter flight-number range, or an aircraft-type lookup keyed by `icao24`) to
distinguish a carrier's dedicated freighter movements from its passenger movements when
both share one ICAO callsign prefix (the Air Canada Cargo case left open by Option 1).

**What it fixes:** Closes the residual gap Option 1 leaves for carriers that fly both
freighter and passenger service under one callsign prefix.

**Residual inaccuracy / new assumption:** OpenSky's `Movements` type — the only flight-level
data source this project has wired — does not carry aircraft type, seat capacity, or a
carrier-name field, only `callsign` (confirmed in CLAUDE.md's Q1 research: "No passenger
count, no aircraft type/seat capacity, no carrier name field — only `callsign`"). Building
this heuristic therefore requires either a new adapter/data source (e.g. an aircraft-type
registry keyed by `icao24`) or a hand-maintained freighter-flight-number table, neither of
which exists today. This is not implementable as a same-file, same-plan change — it is new
scope, and any hand-maintained table would itself be an unverified assumption requiring its
own "labeled as assumed" disclosure.

## Option 3: Disclose the residual misclassification risk in the score breakdown output, instead of eliminating it in code

**Change required:** Apply Option 1 (remove the three passenger prefixes), then add a
static, always-present disclosure string to `ScoringComponentBreakdown`'s output (e.g. a
`volume.assumptionNote` field) stating that the cargo/passenger split is a callsign-prefix
heuristic with known limitations (e.g. "may undercount a small number of mixed
freighter/passenger carriers' cargo movements").

**What it fixes:** Same correctness improvement as Option 1, plus makes the residual
uncertainty visible to the analyst at the point of use, directly serving this project's core
value ("every derived or assumed number must be labeled as such").

**Residual inaccuracy / new assumption:** Does not close the Air Canada Cargo gap Option 1
already leaves open — it only labels it. Adds a small amount of new surface area (a new
field threaded through `ScoringComponentBreakdown` and, eventually, the Phase 4 chat
narration layer) for a disclosure that could equally live in this project's design
doc/README instead of in the API response shape.

## Recommendation

**Option 1** (remove `'DAL'`/`'AAL'`/`'ACA'` from `CARGO_CALLSIGN_PREFIXES`), with the
residual Air Canada Cargo gap disclosed in prose in the project's design doc rather than
built as a new output field. Rationale: it fixes the dominant real-world error (three major
passenger carriers' movements being wholesale miscounted as cargo) with a one-line, fully
tested code change; Option 2 requires new data this project does not have and is out of
scope for a 24-hour build; Option 3's code-level disclosure field is a reasonable idea but
adds complexity for a residual gap small enough to state in the design doc's known-limitations
section instead. This is a recommendation for the user to approve or reject, not a decision
already made — no code change has been made as part of this task.
