// Runs once per server instance, before the server accepts requests — the
// only Next.js hook that turns a missing/invalid env var into a startup
// failure instead of a surprise on the first request that happens to touch it.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/config/env");
    // Constructs the shared Gemini client singleton at startup instead of on the
    // first chat request - see the comment on geminiClient in adapters/llm/google.ts.
    await import("@/adapters/llm/google");
  }
}
