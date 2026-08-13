// Opt-in live run against the real OpenSky and FAA NAS Status endpoints. Never runs as part of
// `npm test` - the smoke config's include pattern (src/**/*.smoke.ts) does not overlap the
// default config's (src/**/*.test.ts). Run with `npm run smoke`.
import { describe, expect, it } from "vitest";
import { clearCache, getCacheStats } from "./cache";
import { fetchMovements } from "./opensky";
import { fetchNasStatus } from "./nasStatus";

describe("live smoke", () => {
  it("both adapters return real data from the live upstreams, and repeat calls hit cache", async () => {
    clearCache();

    const opensky = await fetchMovements("KATL");
    if (!opensky.ok) throw new Error(`OpenSky failed: ${opensky.reason} ${opensky.detail ?? ""}`);
    expect(typeof opensky.data.departureCount).toBe("number");
    expect(typeof opensky.data.arrivalCount).toBe("number");

    const faa = await fetchNasStatus("KATL");
    if (!faa.ok) throw new Error(`FAA failed: ${faa.reason} ${faa.detail ?? ""}`);
    expect(faa.data.lid).toBe("ATL");
    expect(Array.isArray(faa.data.events)).toBe(true);

    const before = getCacheStats();
    await fetchMovements("KATL");
    await fetchNasStatus("KATL");
    const after = getCacheStats();
    expect(after.hits).toBe(before.hits + 2);
  });
});
