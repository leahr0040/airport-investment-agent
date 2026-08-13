import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  process.loadEnvFile();
} catch {
  // no .env file present - fetchMovements/fetchNasStatus will fail loudly with a clear reason
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.smoke.ts"],
    testTimeout: 60000,
    env: {
      OPENSKY_CLIENT_ID: process.env.OPENSKY_CLIENT_ID ?? "",
      OPENSKY_CLIENT_SECRET: process.env.OPENSKY_CLIENT_SECRET ?? "",
      GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "",
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "server-only": resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
});
