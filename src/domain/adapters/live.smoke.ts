// Opt-in live run against the real OpenSky and FAA NAS Status endpoints. Never runs as part of
// `npm test` - the smoke config's include pattern (src/**/*.smoke.ts) does not overlap the
// default config's (src/**/*.test.ts). Run with `npm run smoke`.
import { describe, expect, it, vi } from "vitest";
import * as cacheModule from "./cache";
import { fetchMovements } from "./opensky";
import { fetchNasStatus } from "./nasStatus";

describe("live smoke", () => {
  it("both adapters return real data from the live upstreams, and repeat calls hit cache", async () => {
    cacheModule.clearCache();

    // Pass-through spy: still runs the real cache/producer, just counts producer calls so we
    // can assert a repeat request is served from cache without mocking the live upstream.
    const realWithCache = cacheModule.withCache;
    let producerCalls = 0;
    vi.spyOn(cacheModule, "withCache").mockImplementation((key, ttlMs, fn) =>
      realWithCache(key, ttlMs, () => {
        producerCalls += 1;
        return fn();
      }),
    );

    const opensky = await fetchMovements("KATL");
    if (!opensky.ok) throw new Error(`OpenSky failed: ${opensky.reason} ${opensky.detail ?? ""}`);
    expect(typeof opensky.data.departureCount).toBe("number");
    expect(typeof opensky.data.arrivalCount).toBe("number");

    const faa = await fetchNasStatus("KATL");
    if (!faa.ok) throw new Error(`FAA failed: ${faa.reason} ${faa.detail ?? ""}`);
    expect(faa.data.lid).toBe("ATL");
    expect(Array.isArray(faa.data.events)).toBe(true);

    const callsBeforeRepeat = producerCalls;
    await fetchMovements("KATL");
    await fetchNasStatus("KATL");

    expect(producerCalls).toBe(callsBeforeRepeat);
  });
});
