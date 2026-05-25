/**
 * Reset the dev/staging Postgres for an E2E test run.
 *
 * 1. Applies migration 0013_appeal_strength_and_kb.sql (idempotent — all
 *    columns use ADD COLUMN IF NOT EXISTS).
 * 2. Truncates the volatile tables that hold per-appeal state — appeals,
 *    appeal_photos, jobs, submissions, payments, inbound_messages — so
 *    the next E2E run starts on a clean slate.
 *
 * Reference tables (councils, council_automation), user records, and
 * subscriptions are NOT touched, so the test account + Westminster
 * automation recipe survive across runs.
 *
 * Usage:   tsx --env-file=.env.local scripts/reset-db-for-e2e.ts
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

const SQL_FILE = join(process.cwd(), "drizzle", "0013_appeal_strength_and_kb.sql");

const VOLATILE_TABLES = [
  "submissions",
  "payments",
  "inbound_messages",
  "appeal_photos",
  "jobs",
  "appeals",
];

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const sql = postgres(dbUrl, { max: 1 });
  try {
    console.log("→ Applying 0013_appeal_strength_and_kb.sql…");
    const migration = await readFile(SQL_FILE, "utf8");
    await sql.unsafe(migration);
    console.log("  ok");

    console.log("→ Truncating volatile tables…");
    for (const t of VOLATILE_TABLES) {
      try {
        await sql.unsafe(`TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE;`);
        console.log(`  truncated ${t}`);
      } catch (err) {
        console.warn(`  skip ${t}: ${(err as Error).message}`);
      }
    }

    // Quick sanity check — count rows in appeals (should be 0).
    const countAppeals = await sql<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM appeals`;
    const countCouncils = await sql<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM councils`;
    console.log(`\nappeals=${countAppeals[0].count}  councils=${countCouncils[0].count}`);
    console.log("\nDB reset complete — ready for E2E.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
