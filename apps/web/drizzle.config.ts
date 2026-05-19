import { defineConfig } from "drizzle-kit";

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
