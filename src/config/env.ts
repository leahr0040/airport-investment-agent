import "server-only";
import { z } from "zod";

const OPENSKY_ID_MSG =
  "OPENSKY_CLIENT_ID is missing or empty. Register a free OAuth2 client at https://opensky-network.org (Account -> API Client), no credit card needed.";
const OPENSKY_SECRET_MSG =
  "OPENSKY_CLIENT_SECRET is missing or empty. Shown once alongside OPENSKY_CLIENT_ID at https://opensky-network.org (Account -> API Client), no credit card needed.";
const GEMINI_KEY_MSG =
  "GOOGLE_GENERATIVE_AI_API_KEY is missing or empty. Create a free API key at https://aistudio.google.com/apikey, no credit card needed.";
const LOG_LEVEL_MSG = "LOG_LEVEL must be one of debug, info, warn, error.";

const schema = z.object({
  OPENSKY_CLIENT_ID: z.string(OPENSKY_ID_MSG).trim().min(1, OPENSKY_ID_MSG),
  OPENSKY_CLIENT_SECRET: z.string(OPENSKY_SECRET_MSG).trim().min(1, OPENSKY_SECRET_MSG),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string(GEMINI_KEY_MSG).trim().min(1, GEMINI_KEY_MSG),
  // Optional: swap models without touching call sites. "gemini-flash-latest" is a Google-
  // maintained alias, not a pinned dated model - a dated id (e.g. gemini-2.5-flash) can get
  // gated for new-user projects with no warning, as verified live on 2026-08-13.
  GOOGLE_GENERATIVE_AI_MODEL: z.string().trim().min(1).default("gemini-flash-latest"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"], LOG_LEVEL_MSG).default("info"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(
    `Invalid environment configuration — the app cannot start.\n\n${issues}\n\nFix: copy .env.example to .env.local, fill in the values listed above, then restart.`,
  );
}

export const env = parsed.data;

export function getEnv() {
  return env;
}
