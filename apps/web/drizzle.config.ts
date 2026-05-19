import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load .env.local so `drizzle-kit migrate / generate` pick up DATABASE_URL
// without needing to be invoked through `next` (which loads it natively).
loadEnv({ path: ".env.local" });

/**
 * Drizzle Kit config — used for `drizzle-kit generate` / `migrate`.
 * Requires DATABASE_URL in .env.local.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
});
