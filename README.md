# Airport Investment Intelligence Agent

A conversational AI agent that helps investment analysts at a US airport-modernization firm
identify which airports are the strongest candidates for renovation and terminal expansion,
backed by a deterministic scoring engine over live aviation data rather than LLM guesswork.
**Every number the agent states must be traceable to a deterministic computation over real
data, with its assumptions and uncertainty stated out loud.**

The chat UI, the deterministic scoring engine, and the three live-data adapters (OpenSky,
FAA NAS Status, FAA ADIP) are implemented and covered by tests. Security hardening and the
design document are the remaining work.

## Prerequisites

- Node.js 24 or newer (developed and verified on Node 24.18.0)
- npm

No database, no Python, no Docker.

## Quickstart

1. `git clone <repo-url>`
2. `cd airport-investment-agent`
3. `npm install`
4. Copy the environment template:
   - macOS/Linux: `cp .env.example .env.local`
   - Windows PowerShell: `Copy-Item .env.example .env.local`
5. Open `.env.local` and fill in the three required credentials (see Credentials below).
6. `npm run dev`
7. Open `http://localhost:3000`

## Credentials

v1 builds no degraded or keyless mode: every required credential below must be present or
the app refuses to start. Both providers are free and need no credit card.

| Variable | Required? | Where to get it | Cost |
|----------|-----------|------------------|------|
| `OPENSKY_CLIENT_ID` | Required | https://opensky-network.org -> sign up -> Account -> API Client | Free, no credit card |
| `OPENSKY_CLIENT_SECRET` | Required | Shown once alongside `OPENSKY_CLIENT_ID` at the same screen | Free, no credit card |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Required | https://aistudio.google.com/apikey -> sign in with Google -> Create API key | Free, no credit card |
| `LOG_LEVEL` | Optional (defaults to `info`) | One of `debug`, `info`, `warn`, `error` | — |

## If the app refuses to start

This is intended behavior, not a crash. If any required credential is missing or empty,
`npm run dev` prints a message naming the variable, where to get it, and how to fix it, for
example:

```
Invalid environment configuration — the app cannot start.

  OPENSKY_CLIENT_ID: OPENSKY_CLIENT_ID is missing or empty. Register a free OAuth2 client
  at https://opensky-network.org (Account -> API Client), no credit card needed.

Fix: copy .env.example to .env.local, fill in the values listed above, then restart.
```

Remedy: fill in the named variable(s) in `.env.local` and restart `npm run dev`.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Next.js dev server at `http://localhost:3000` |
| `npm run build` | Build the production bundle |
| `npm start` | Run the production build (after `npm run build`) |
| `npm test` | Run the Vitest test suite once |
| `npm run test:watch` | Run the Vitest test suite in watch mode |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm run lint` | Run ESLint |

## Project layout

- `src/app` — Next.js App Router entry points (layout, pages)
- `src/config` — validated environment configuration (`env.ts`); the only module that reads
  the ambient process environment
- `src/domain/airports` — airport domain types and (in progress) the resolution/registry logic
- `src/instrumentation.ts` — Next.js boot hook that forces environment validation to run
  before the server accepts any request

## Data sources

- **FAA ADIP/NASR (ArcGIS FeatureServer)** — airport identity and runway geometry, fetched at
  startup, no API key required.
- **OpenSky Network** — live flight-movement data, authenticated via an OAuth2 client
  (`OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET`).

Passenger-side figures derived from this data are proxies, not measured passenger counts —
no keyless live API publishes per-airport passenger volumes.
