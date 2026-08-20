---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/proxy.ts
  - src/proxy.test.ts
  - src/middleware.ts (deleted)
  - src/middleware.test.ts (deleted)
autonomous: true
requirements: [QUICK-01]
must_haves:
  truths:
    - "Dev server no longer prints the middleware-to-proxy deprecation warning"
    - "Chat endpoint per-session and per-IP rate limiting still runs before every /api/chat request"
  artifacts:
    - "src/proxy.ts"
    - "src/proxy.test.ts"
  key_links:
    - "src/proxy.ts config.matcher still scopes the proxy to /api/chat"
---

<objective>
Migrate the deprecated `src/middleware.ts` Next.js file convention to the Next.js 16 `src/proxy.ts` convention, per the framework's own deprecation notice and documented migration (verified live against `nextjs.org/docs/app/api-reference/file-conventions/proxy`, updated 2026-08-04, version 16.3.1).

Purpose: silence the "middleware file convention is deprecated" warning and stay on the supported code path, without changing any request-handling behavior (per-session + per-IP rate limiting ahead of `/api/chat`, added in quick task 260819-uzg).

Output: `src/proxy.ts` (renamed from `src/middleware.ts`, exported function renamed `middleware` → `proxy`, invalid `runtime` config key removed) and `src/proxy.test.ts` (renamed from `src/middleware.test.ts`, updated to import/exercise `proxy`).
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Confirmed live against current Next.js docs (16.3.1, updated 2026-08-04):
- The file must be named `proxy.ts` (or `.js`) at the same directory level middleware.ts occupied (project root or `src/`, per `pageExtensions`).
- The exported function must be named `proxy` (or be the default export) — `middleware` is not a recognized export name in a proxy.ts file. The official codemod does exactly this: rename the file and rename `export function middleware` to `export function proxy`.
- The `config` object's `matcher` field is unchanged and still required to scope the proxy to `/api/chat`.
- Critical, non-obvious finding: Proxy always defaults to the Node.js runtime, and **the `runtime` config option is not available in Proxy files — setting it throws an error at build/dev time.** The current file's `config` object sets `runtime: 'nodejs'`, which must be dropped, not carried over — this is not a pure rename, the config shape also changes.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rename middleware.ts to proxy.ts and rename the middleware test file, updating both to the proxy convention</name>
  <files>src/proxy.ts, src/proxy.test.ts, src/middleware.ts, src/middleware.test.ts</files>
  <action>
    Read src/middleware.ts in full, then create src/proxy.ts with identical logic except: rename the exported async function from `middleware` to `proxy` (keep its `NextRequest` param and body — the two calls to `ipRateLimitCheck`/`sessionRateLimitCheck` from `@/lib/middleware/ipRateLimitCheck` and `@/lib/middleware/sessionRateLimitCheck`, short-circuit-return on either non-null result, otherwise `NextResponse.next()` — is unchanged), and change the `config` export to `{ matcher: '/api/chat' }`, dropping `runtime: 'nodejs'` (Proxy files reject the `runtime` config key — it throws, and Proxy already defaults to Node.js runtime, so no behavior is lost by removing it). Do not touch `src/lib/middleware/` — that directory name is an unrelated internal module path, not the Next.js file convention, and is out of scope.

    Delete src/middleware.ts once src/proxy.ts is confirmed correct (via a filesystem move/rename if your tool supports it, otherwise write-then-delete).

    Read src/middleware.test.ts in full, then create src/proxy.test.ts as the same test suite with: the import changed from `import { middleware } from './middleware'` to `import { proxy } from './proxy'`, the `describe('middleware', ...)` block name changed to `describe('proxy', ...)`, and every call site `middleware(req())` changed to `proxy(req())`. The `vi.mock` calls targeting `@/lib/middleware/ipRateLimitCheck` and `@/lib/middleware/sessionRateLimitCheck` are unchanged (unrelated module path). Delete src/middleware.test.ts once src/proxy.test.ts is confirmed correct.
  </action>
  <verify>
    <automated>npm test -- src/proxy.test.ts</automated>
  </verify>
  <done>src/proxy.ts and src/proxy.test.ts exist with the `proxy` export/import throughout; src/middleware.ts and src/middleware.test.ts no longer exist; the renamed test file passes.</done>
</task>

<task type="auto">
  <name>Task 2: Full verification pass — typecheck, full test suite, dev server warning gone</name>
  <files>(none — verification only)</files>
  <action>
    Run the project's typecheck and full test suite to confirm the rename introduced no dangling references to `src/middleware` or the `middleware` export anywhere else in the tree (grep confirms only `src/lib/middleware/*` matches remain, which is expected and out of scope). Then start the dev server briefly and confirm the "middleware file convention is deprecated" line is no longer printed, and that a request to /api/chat is still rate-limited (still returns 429 once the per-session/per-IP limiter trips, matching pre-rename behavior) — stop the dev server after confirming.
  </action>
  <verify>
    <automated>npm run typecheck && npm test</automated>
  </verify>
  <done>`tsc --noEmit` is clean, `vitest run` passes in full, `grep -rn "middleware" src --include=*.ts` returns only src/lib/middleware/* paths, and a manual `npm run dev` startup no longer prints the middleware-to-proxy deprecation warning.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|--------------|
| client -> /api/chat | Rate-limit enforcement point; unchanged by this rename — still runs before the route handler |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-01 | Denial of Service | src/proxy.ts matcher scope | low | accept | Matcher (`/api/chat`) and rate-limit logic are copied verbatim from the working src/middleware.ts; this task is a rename plus one invalid-config-key removal, not new logic — no new attack surface introduced. Task 2's manual check confirms the 429 behavior survives the rename. |
</threat_model>

<verification>
`npm run typecheck` and `npm test` both pass; `src/middleware.ts`/`src/middleware.test.ts` no longer exist in the tree; a live `npm run dev` no longer prints the deprecation warning; `/api/chat` still enforces per-session and per-IP rate limiting exactly as before (same matcher, same two checks, same NextResponse.next() passthrough).
</verification>

<success_criteria>
Next.js 16 dev server starts without the middleware-to-proxy deprecation warning, `src/proxy.ts` is the sole file implementing the chat-endpoint rate-limit gate, and all existing tests (renamed and otherwise) pass unchanged in behavior.
</success_criteria>

<output>
Create `.planning/quick/260820-kvr-rename-src-middleware-ts-to-src-proxy-ts/260820-kvr-SUMMARY.md` when done
</output>
