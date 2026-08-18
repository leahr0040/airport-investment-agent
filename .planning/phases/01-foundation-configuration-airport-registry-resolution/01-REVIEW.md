---
phase: 01-foundation-configuration-airport-registry-resolution
reviewed: 2026-08-18T00:00:00Z
depth: quick
files_reviewed: 6
files_reviewed_list:
  - src/app/layout.tsx
  - src/app/page.tsx
  - src/config/env.ts
  - src/domain/airports/regions.test.ts
  - src/domain/airports/regions.ts
  - src/instrumentation.ts
findings:
  critical: 1
  warning: 2
  info: 1
  total: 4
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-08-18T00:00:00Z
**Depth:** quick
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Pattern-matched and directly inspected all six listed files (no hardcoded secrets, no `eval`/`innerHTML`, no empty catch blocks, no debug artifacts found via grep). `env.ts` and `instrumentation.ts` are sound — the Zod schema and its `.safeParse(process.env)` fail-closed behavior were verified interactively against the installed `zod@4.4.3` and produce the intended per-field error messages for both "missing" and "empty" cases.

The one real defect is in `regions.ts`'s `lookupAirports` passthrough branch — the function that this phase is explicitly named for ("airport registry resolution"). It has no character/format allowlisting and returns a fabricated `{iata: '', icao: ''}` pair for empty or malformed input instead of failing closed, which conflicts with this project's own explicit, non-deferrable requirement (CLAUDE.md: "allowlist-validate every user-supplied identifier before it reaches an outbound URL"). This was proven by direct execution, not inference — see CR-01 below.

## Critical Issues

### CR-01: `lookupAirports` passthrough has no format allowlist and fabricates garbage identifiers for invalid input

**File:** `src/domain/airports/regions.ts:143-161`

**Issue:** For any input that doesn't match a table key, `lookupAirports` falls through to length-based branches (`norm.length === 4`, `norm.length === 3`) with **no character validation** — `norm` is only `.trim().toUpperCase()`'d, never checked against `/^[A-Z0-9]+$/` or similar. Any input containing punctuation, whitespace-collapsed symbols, etc. is accepted and returned as a fabricated `{iata, icao}` pair. Worse, for inputs that hit none of the length branches (empty string, whitespace-only, 1-2 chars, 5+ chars) the function falls through to the final `return [{ iata: norm, icao: norm }]`, which for an empty string produces `{iata: '', icao: ''}` — verified live:

```
lookupAirports('')      -> [{"iata":"","icao":""}]
lookupAirports('  ')    -> [{"iata":"","icao":""}]
lookupAirports('K$T!')  -> [{"iata":"$T!","icao":"K$T!"}]
```

This is the canonical identifier-resolution function for this phase and is the single choke point this project's CLAUDE.md designates for allowlisting user-supplied identifiers before they reach an outbound URL ("treat third-party API responses as untrusted input... allowlist-validate every user-supplied identifier before it reaches an outbound URL"). As written, it fails open: malformed or empty input silently becomes a syntactically-plausible-looking ICAO/IATA pair rather than being rejected, and downstream consumers (e.g. `resolveRegion`/`scoreAirportsTool` in `src/domain/agent/tools.ts`, confirmed as callers of `lookupAirports`) receive it as if it were valid.

**Fix:**
```ts
export function lookupAirports(query: string): AirportCodes[] {
  const key = query.trim().toLowerCase();
  const known = REGION_LOOKUP[key];
  if (known) return known.map((x) => ({ ...x }));

  const norm = query.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(norm)) return [];

  if (norm.length === 4) {
    return [{ iata: norm.slice(1), icao: norm }];
  }

  const exceptions: Record<string, string> = { ANC: 'PANC', HNL: 'PHNL' };
  const icao = exceptions[norm] ?? `K${norm}`;
  return [{ iata: norm, icao }];
}
```
Callers (`resolveRegion`, `scoreAirportsTool`) should then treat an empty result as "unrecognized identifier" and surface that to the user/agent rather than silently forwarding it.

## Warnings

### WR-01: Six regions/metros are stored as fully duplicated literal arrays instead of aliases

**File:** `src/domain/airports/regions.ts:19-34, 54-69, 74-87, 88-102, 103-112, 113-122`

**Issue:** `'mid-atlantic'`/`'mid atlantic'`, `'pacific'`/`'west coast'`, `'la'`/`'los angeles'`, `'nyc'`/`'new york'`/`'new york city'`, `'bay area'`/`'san francisco bay area'`, and `'dc'`/`'washington dc'` each duplicate the identical array literal verbatim rather than referencing a shared constant. A future edit to one alias (e.g. adding a new Bay Area airport) will silently leave the other alias out of date, producing inconsistent results for semantically identical queries with no compiler or test signal.

**Fix:** Define each canonical list once and reference it from the aliases:
```ts
const BAY_AREA = [
  { iata: 'SFO', icao: 'KSFO' },
  { iata: 'OAK', icao: 'KOAK' },
  { iata: 'SJC', icao: 'KSJC' },
] as const;

const REGION_LOOKUP: Readonly<Record<string, readonly AirportCodes[]>> = {
  'bay area': BAY_AREA,
  'san francisco bay area': BAY_AREA,
  // ...
};
```

### WR-02: `page.tsx` parses the response body as JSON without checking `res.ok`, masking real server errors behind a generic message

**File:** `src/app/page.tsx:30-37`

**Issue:** `handleSubmit` calls `res.json()` unconditionally on every response, assuming the server always returns the `ChatApiResponse` JSON shape. If the API route (or an intermediary, e.g. a platform rate limiter or a Next.js error page) returns a non-JSON body — plausible for a 429/500 during the explicitly-required per-session rate limiting, or an unhandled exception — `res.json()` throws, which is caught by the outer `catch` and shown to the user as `'Could not reach the server. Please try again.'`. This is misleading (the server *was* reached; it errored) and makes rate-limit/server-error conditions indistinguishable from real network failure during a graded demo session.

**Fix:**
```ts
const res = await fetch('/api/chat', { ... });
if (!res.ok) {
  setMessages((prev) => [...prev, { role: 'error', text: `Request failed (${res.status}). Please try again.` }]);
  return;
}
const body = (await res.json()) as ChatApiResponse;
```

## Info

### IN-01: Chat message list keys on array index

**File:** `src/app/page.tsx:54`

**Issue:** `messages.map((message, i) => (<div key={i} ...>` uses the array index as the React key. This is append-only and never reorders/removes items today, so it's not currently a correctness bug, but it's a latent footgun if the list ever gains delete/edit/reorder behavior (e.g. a "retry last message" feature), since React will misattribute DOM state across re-renders.

**Fix:** Key on a stable id, e.g. generate one alongside each message (`{ id: crypto.randomUUID(), role, text }`) or use a monotonically increasing counter stored outside render.

---

_Reviewed: 2026-08-18T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
