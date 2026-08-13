// Runs once per server instance, before the server accepts requests — the
// only Next.js hook that turns a missing/invalid env var into a startup
// failure instead of a surprise on the first request that happens to touch it.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/config/env");
    // Config first, registry second: a missing credential must surface as the
    // config error, not as a network failure from the ArcGIS fetch below. A
    // registry that fails to build means an empty SSRF allowlist, so the error
    // is left to propagate — the server must not become ready in that state.
    const { initRegistry } = await import("@/domain/airports/registry");
    await initRegistry();
  }
}
