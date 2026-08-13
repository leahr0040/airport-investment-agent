# Phase 2: Live Data Adapters & Caching - Pattern Map

**Mapped:** 2026-08-13
**Files analyzed:** 8 (1 edit, 7 new)
**Analogs found:** 8 / 8 (5 from real codebase files, 3 fully-specified by RESEARCH.md's Code Examples since no adapter precedent exists yet)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/domain/airports/regions.ts` (edit) | model/data | transform | itself (existing file) | exact — edit in place |
| `src/domain/adapters/types.ts` | model | transform | RESEARCH.md Code Examples §`AdapterResult<T>` | no codebase analog — spec fully given |
| `src/domain/adapters/validate.ts` | utility | transform | RESEARCH.md Code Examples §D-08 gate | partial analog: `src/config/env.ts`'s zod-validate-at-boundary style |
| `src/domain/adapters/cache.ts` | utility | CRUD (get/set) | RESEARCH.md Architecture Patterns §Pattern 1 | no codebase analog — new dependency (`lru-cache`) |
| `src/domain/adapters/opensky.ts` | service | request-response (HTTP fetch + OAuth2) | RESEARCH.md Code Examples §OpenSky adapter; `src/config/env.ts` (getEnv/server-only conventions) | role-match on conventions, no in-repo HTTP-adapter precedent |
| `src/domain/adapters/nasStatus.ts` | service | request-response (HTTP fetch + XML parse) | RESEARCH.md Code Examples §FAA NAS adapter; `src/domain/adapters/opensky.ts` (sibling, same phase) | role-match on conventions, no in-repo HTTP-adapter precedent |
| `src/domain/adapters/opensky.test.ts` | test | — | `src/domain/airports/regions.test.ts` | exact — same vitest style, same repo |
| `src/domain/adapters/nasStatus.test.ts` | test | — | `src/domain/airports/regions.test.ts` | exact — same vitest style, same repo |

## Pattern Assignments

### `src/domain/airports/regions.ts` (edit — model/data, transform)

**Analog:** itself, `src/domain/airports/regions.ts` (full file read above)

**Current shape to change** (lines 9-38):
```typescript
const REGION_LOOKUP: Readonly<Record<string, readonly string[]>> = {
  'new england': ['BOS', 'BDL', 'PWM'],
  ...
};
```
Per D-09, change the value type from `readonly string[]` to `readonly {iata: string; icao: string}[]` — every entry gets a real ICAO code as data, not derived. Preserve the exact same key set (region/metro names + `pbi` alias), same lowercase-key convention, same JSDoc-comment style at the top of the file (lines 1-7) explaining what the table is and isn't.

**`lookupAirports()` return-type change** (lines 40-50):
```typescript
export function lookupAirports(query: string): string[] {
  const key = query.trim().toLowerCase();
  const known = REGION_LOOKUP[key];
  if (known) return [...known];
  return [query.trim().toUpperCase()];
}
```
Change return type to `{iata: string; icao: string}[]`. For the table-hit branch, return the stored `{iata, icao}` pairs unchanged (D-09). For the passthrough branch (bare code typed by analyst), derive ICAO via the K+IATA prefix rule with explicit Alaska/Hawaii exceptions hardcoded alongside it — `ANC`→`PANC`, `HNL`→`PHNL` — per D-10. Keep the same trim/uppercase/lowercase-key idioms already in this function; do not introduce a new normalization style.

**Test analog:** `src/domain/airports/regions.test.ts` (full file, 24 lines) — same `describe`/`it` vitest structure, asserting exact array equality per case (known region, known metro, legacy alias, passthrough). New/updated tests for `lookupAirports` should follow this exact structure but assert on `{iata, icao}` object arrays instead of bare strings, and add a case each for the K-prefix rule and the two documented AK/HI exceptions.

---

### `src/domain/adapters/types.ts` (model, transform)

**No in-repo analog** — this is a brand-new shared contract type. Use RESEARCH.md's fully-specified shape verbatim (Code Examples §"`AdapterResult<T>` shape"):

```typescript
// domain/adapters/types.ts
export type AdapterFailReason = "timeout" | "invalid_input" | "rate_limited" | "no_data" | "error";

export type AdapterResult<T> =
  | { ok: true; data: T; fetchedAt: string; source: string }
  | { ok: false; reason: AdapterFailReason; detail?: string };
// No "stale" branch — D-06 overrides ARCHITECTURE.md's stale-serve suggestion.
```

---

### `src/domain/adapters/validate.ts` (utility, transform)

**Partial analog:** `src/config/env.ts` — establishes the project's "validate at the boundary, throw/reject with a clear message" posture (zod schema, lines 12-17), and the `import "server-only";` guard convention (line 1) that all new adapter modules must also carry (per CONTEXT.md's "Established Patterns").

**Regex gate — use RESEARCH.md's exact spec** (Code Examples §"D-08 format-check gate"):
```typescript
// domain/adapters/validate.ts
const ICAO_PATTERN = /^[A-Z]{4}$/;
const IATA_PATTERN = /^[A-Z]{3}$/;

export function isValidIcao(code: string): boolean {
  return ICAO_PATTERN.test(code);
}
export function isValidIata(code: string): boolean {
  return IATA_PATTERN.test(code);
}
```
Note: unlike `env.ts`, this is a pure synchronous utility (no zod, no throw) — it returns a boolean for the caller to branch on and produce an `AdapterResult` fail, matching the "reject early, never throw past the adapter boundary" contract in RESEARCH.md's Architecture Patterns diagram.

---

### `src/domain/adapters/cache.ts` (utility, CRUD get/set)

**No in-repo analog** — first use of `lru-cache` in this codebase (D-01, new dependency). Use RESEARCH.md's fully-specified generic wrapper verbatim (Architecture Patterns §"Pattern 1"):

```typescript
// domain/adapters/cache.ts
import { LRUCache } from "lru-cache";

const cache = new LRUCache<string, unknown>({ max: 2000 });

export async function withCache<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key);
  if (hit !== undefined) return hit as T;
  const value = await fn();
  cache.set(key, value, { ttl: ttlMs });
  return value;
}
```
Cache-key bucketing rule (avoid Pitfall 1 — un-bucketed `Date.now()` keys defeat caching): round the OpenSky time window down to a 5-minute bucket before it enters both the cache key and the outbound URL. See `opensky.ts` pattern below.

---

### `src/domain/adapters/opensky.ts` (service, request-response / OAuth2)

**Conventions analog:** `src/config/env.ts` — `import "server-only";` as line 1 (line 1 of env.ts), and reading credentials exclusively via `getEnv()` (`src/config/env.ts` lines 30-32) rather than `process.env` directly.

**Full pattern — use RESEARCH.md's fully-specified adapter verbatim** (Code Examples §"OpenSky adapter: token lifecycle + timeout + cache"), reproduced here for the token-lifecycle + fetch + cache-key-bucketing shape:

```typescript
import "server-only";
import { getEnv } from "@/config/env";
import { withCache } from "./cache";
import { isValidIcao } from "./validate";
import type { AdapterResult } from "./types";

const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) return cachedToken.token;

  const { OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET } = getEnv();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: OPENSKY_CLIENT_ID,
      client_secret: OPENSKY_CLIENT_SECRET,
    }),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`OpenSky token exchange failed: ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: body.access_token, expiresAt: now + (body.expires_in - 30) * 1000 };
  return cachedToken.token;
}

export async function fetchMovements(icao: string): Promise<AdapterResult<unknown>> {
  if (!isValidIcao(icao)) return { ok: false, reason: "invalid_input" };
  try {
    const token = await getToken();
    const BUCKET_S = 5 * 60;
    const end = Math.floor(Date.now() / 1000 / BUCKET_S) * BUCKET_S;
    const begin = end - 24 * 60 * 60;
    const key = `opensky:${icao}:${begin}-${end}`;

    const data = await withCache(key, 5 * 60 * 1000, async () => {
      const [dep, arr] = await Promise.all([
        fetch(
          `https://opensky-network.org/api/flights/departure?airport=${encodeURIComponent(icao)}&begin=${begin}&end=${end}`,
          { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) },
        ),
        fetch(
          `https://opensky-network.org/api/flights/arrival?airport=${encodeURIComponent(icao)}&begin=${begin}&end=${end}`,
          { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) },
        ),
      ]);
      if (!dep.ok || !arr.ok) throw new Error(`OpenSky ${dep.status}/${arr.status}`);
      return { departures: await dep.json(), arrivals: await arr.json() };
    });
    return { ok: true, data, fetchedAt: new Date().toISOString(), source: "opensky" };
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError" ? "timeout" : "error";
    return { ok: false, reason, detail: err instanceof Error ? err.message : String(err) };
  }
}
```

**Error handling pattern:** catch-all at the function boundary, distinguish `TimeoutError` (from `AbortSignal.timeout`) from generic `error`, never throw past this function — matches the `AdapterResult` contract in `types.ts`.

**Normalization note (Pitfall 4):** the normalized `Movements` output type must treat `estDepartureAirport`/`estArrivalAirport` as `string | null`, and should carry through `departureAirportCandidatesCount`/`arrivalAirportCandidatesCount` per RESEARCH.md's Open Question 2 — cheap now, expensive to re-fetch later.

---

### `src/domain/adapters/nasStatus.ts` (service, request-response / XML fetch)

**Conventions analog:** same `server-only` + boundary-catch pattern as `opensky.ts` (its sibling in this phase); structurally simpler (no OAuth2, no per-airport query params — see Pitfall 2).

**Full pattern — use RESEARCH.md's fully-specified adapter verbatim** (Code Examples §"FAA NAS Status adapter: whole-feed fetch + XML parse + per-airport filter"):

```typescript
import "server-only";
import { XMLParser } from "fast-xml-parser";
import { withCache } from "./cache";
import { isValidIcao } from "./validate"; // correctness-only here, not SSRF — see Pitfall 3
import type { AdapterResult } from "./types";

const FEED_URL = "https://nasstatus.faa.gov/api/airport-status-information";
const parser = new XMLParser();

async function fetchFeed(): Promise<unknown> {
  return withCache("nas:feed", 3 * 60 * 1000, async () => {
    const res = await fetch(FEED_URL, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`FAA NAS Status ${res.status}`);
    const xml = await res.text();
    return parser.parse(xml);
  });
}

export async function fetchNasStatus(icao: string): Promise<AdapterResult<unknown>> {
  if (!isValidIcao(icao)) return { ok: false, reason: "invalid_input" };
  try {
    const feed = await fetchFeed();
    // filter `feed` for entries whose ARPT matches the FAA 3-letter LID derived from icao
    // (FAA feed keys by 3-letter ARPT/IATA-ish LID, not 4-letter ICAO — see regions.ts's iata field)
    return { ok: true, data: feed, fetchedAt: new Date().toISOString(), source: "faa-nas-status" };
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError" ? "timeout" : "error";
    return { ok: false, reason, detail: err instanceof Error ? err.message : String(err) };
  }
}
```

**Critical distinction from `opensky.ts` (Pitfall 2):** cache the whole parsed feed under one fixed key `"nas:feed"`, never a per-airport key — filter after the cache read, not before. Do not mirror the URL-templating pattern from `opensky.ts`; this endpoint takes no query parameters at all.

**Security note (Pitfall 3):** `isValidIcao` here is correctness-only (which airport's data to filter out of an already-fetched static document), not an SSRF control — document this distinction in a code comment, since the FAA URL is a hardcoded constant with no user-influenced value ever reaching `fetch()`.

---

### `src/domain/adapters/opensky.test.ts` / `nasStatus.test.ts` (test)

**Analog:** `src/domain/airports/regions.test.ts` (full file, 24 lines) — `describe`/`it` blocks from `vitest`, one `describe` per exported function, direct `expect(...).toEqual(...)` assertions, no mocking framework currently in use in the repo. For these HTTP-calling adapters, mock `fetch` (e.g. via `vi.stubGlobal("fetch", ...)`) since no existing test in the repo mocks network calls — this is new ground, follow vitest's own mocking idiom rather than inventing a bespoke one.

---

## Shared Patterns

### `server-only` import guard
**Source:** `src/config/env.ts` line 1
**Apply to:** `opensky.ts`, `nasStatus.ts`, and any module that reads `getEnv()` or holds credential state (validate.ts and cache.ts have no secrets, so this guard is optional there — CONTEXT.md's "Established Patterns" ties the requirement to modules that "hold OpenSky credentials indirectly").

### Credential access via `getEnv()`, never `process.env`
**Source:** `src/config/env.ts` lines 30-32
```typescript
export function getEnv() {
  return env;
}
```
**Apply to:** `opensky.ts`'s `getToken()` function only (the sole place `OPENSKY_CLIENT_ID`/`OPENSKY_CLIENT_SECRET` are read).

### `AdapterResult<T>` — never throw past the adapter boundary
**Source:** RESEARCH.md Code Examples (no codebase precedent — this phase establishes it)
**Apply to:** `opensky.ts` and `nasStatus.ts` — both wrap their entire body in try/catch, distinguish `TimeoutError` from generic errors, and return `{ok: false, reason, detail}` rather than throwing.

### Timeout idiom
**Source:** RESEARCH.md Code Examples — `AbortSignal.timeout(3000)`
**Apply to:** every `fetch()` call in both adapters (D-07: 3s, no retry). Do not hand-roll `AbortController` + `setTimeout`.

### vitest test structure
**Source:** `src/domain/airports/regions.test.ts` (full file)
**Apply to:** `opensky.test.ts`, `nasStatus.test.ts`, and the updated `regions.test.ts` assertions for the D-09/D-10 shape change.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/domain/adapters/cache.ts` | utility | CRUD | First use of `lru-cache` in this repo; no prior caching code exists. RESEARCH.md's Code Examples fully specify the implementation — use that directly rather than searching further. |
| `src/domain/adapters/opensky.ts` / `nasStatus.ts` | service | request-response | No prior HTTP-adapter file exists in this repo (Phase 1's `fetchArcGis.ts` was deleted in the architecture pivot per CONTEXT.md). RESEARCH.md's Code Examples are the de facto reference implementation for this phase. |

## Metadata

**Analog search scope:** `src/` (entire repo — only 7 pre-existing files total, all read)
**Files scanned:** `src/config/env.ts`, `src/domain/airports/regions.ts`, `src/domain/airports/regions.test.ts`, `src/instrumentation.ts`, `src/app/*`
**Pattern extraction date:** 2026-08-13
