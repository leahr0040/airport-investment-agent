# Phase 1: Foundation — Configuration, Airport Registry & Resolution - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-12
**Phase:** 1-Foundation — Configuration, Airport Registry & Resolution
**Areas discussed:** Registry scope/filtering, Region definitions, Metro ambiguity clusters, Resolver miss behavior

---

## Registry scope & filtering

| Option | Description | Selected |
|--------|-------------|----------|
| Part 139 commercial-service only | Filter on `FAR_139_TYPE_CODE` + public use; small, fast registry, matches analyst intent | ✓ |
| Public-use, any service level | Broader — includes small public airports without scheduled service | |
| You decide | Claude picks | |

**User's choice:** "תחליט אתה" (you decide) → Claude selected Part 139 commercial-service only.
**Notes:** —

### IATA-code sourcing

| Option | Description | Selected |
|--------|-------------|----------|
| FAA ArcGIS only, `ARPT_ID` as IATA | One source, matches PROJECT.md's "no bundled CSV" decision; holds for most major continental US airports | ✓ |
| Add OurAirports as a second live-fetched (not bundled) source | More accurate IATA/ICAO mapping; reopens "no bundled CSV" framing but stays live-fetched | |
| You decide | Claude checks how many mismatches exist | |

**User's choice:** "FAA ArcGIS בלבד, ARPT_ID כ-IATA (מומלץ)"
**Notes:** User first asked for clarification (in Hebrew) on what `ARPT_ID` actually is and how it differs from a true IATA code before choosing.

---

## Region definitions (RESOLVE-03)

| Option | Description | Selected |
|--------|-------------|----------|
| 9 curated US Census-style regions | New England, Mid-Atlantic, South, Midwest, Southwest, Mountain West, Pacific/West Coast, Alaska, Hawaii — fixed state→region map | ✓ |
| New England only (minimalist) | Only the region named in the project brief | |
| Dynamic state→region mapping (every state = its own region) | Most generic, least demo-ready | |

**User's choice:** "רשימת מדינות מקובצת בלבד (מומלץ)" → 9 curated regions
**Notes:** —

### Standalone state queries

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — a state resolves even if not a named region | Consistent mental model; no added cost since it's the same state→region table | ✓ |
| No — only the 9 named regions work | Smaller surface area | |

**User's choice:** "כן, מדינה עובדת גם אם לא ברשימת האזורים (מומלץ)"

### Washington D.C.

| Option | Description | Selected |
|--------|-------------|----------|
| Fold into Mid-Atlantic | Standard geographic grouping | ✓ |
| Standalone region | DC treated as its own region | |

**User's choice:** "צירף ל-Mid-Atlantic (מומלץ)"

---

## Metro ambiguity clusters (RESOLVE-04)

| Option | Description | Selected |
|--------|-------------|----------|
| 6 hardcoded clusters (LA, NYC, SF Bay Area, DC, Chicago, South Florida) | Covers the brief's example plus other major multi-airport metros | ✓ |
| LA only | Minimal, matches the one example in requirements | |
| Dynamic geographic-proximity algorithm | Most general, but overkill and less predictable for a demo | |

**User's choice:** "6 ערים (LA, NYC, SF, DC, Chicago, S.Florida) - מומלץ"
**Notes:** User is not familiar with US geography; Claude explained each metro cluster's constituent airports (LAX/BUR/LGB/SNA/ONT for LA; JFK/LGA/EWR for NYC; SFO/OAK/SJC for SF; DCA/IAD/BWI for DC; ORD/MDW for Chicago; MIA/FLL/PBI for South Florida) before the user chose.

---

## Resolver miss & match behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Empty result + nearest-candidate suggestions | Supports a future "did you mean X?" UX in Phase 4 | ✓ |
| Throw an exception | Simpler, but pushes handling to every caller | |

**User's choice:** "תוצאה ריקה + הצעות קרובות (מומלץ)"

### Name-matching tolerance

| Option | Description | Selected |
|--------|-------------|----------|
| Substring/contains match | Simple, predictable, sufficient for expected query patterns | ✓ |
| Typo-tolerant fuzzy match (Levenshtein) | More forgiving but adds complexity and less predictable matches | |

**User's choice:** "התאמה חלקית (substring/contains) - מומלץ"

---

## Claude's Discretion

- Exact `.env` validation error-message wording/format (SETUP-01).
- Whether `ARPT_ID`-as-IATA needs a hardcoded exception list for known mismatches — a research/verification question, not a user decision.
- Internal registry indexing/data-structure approach.

## Deferred Ideas

None — discussion stayed within Phase 1 scope; no pending todos existed to fold or review.

## Process Note

Discussion partway through switched from English to Hebrew at the user's request; the user reported the Hebrew phrasing was hard to follow and Claude reverted questions to shorter, simpler Hebrew (plus added explanatory context on US airport geography for the metro-cluster question) rather than switching back to English, per the user's stated preference to "keep trying Hebrew, but simpler."
