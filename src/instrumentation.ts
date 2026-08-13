// Runs once per server instance, before the server accepts requests — the
// only Next.js hook that turns a missing/invalid env var into a startup
// failure instead of a surprise on the first request that happens to touch it.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/config/env");
  }
}
