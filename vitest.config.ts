import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30000,
    env: {
      OPENSKY_CLIENT_ID: "test-opensky-client-id",
      OPENSKY_CLIENT_SECRET: "test-opensky-client-secret",
      GOOGLE_GENERATIVE_AI_API_KEY: "test-gemini-key",
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@test": resolve(__dirname, "test"),
      "server-only": resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
});
