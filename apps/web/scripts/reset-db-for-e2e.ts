/**
 * Reset the dev/staging Postgres for an E2E test run.
 *
 * 1. Applies migration 0013_appeal_strength_and_kb.sql (idempotent — all
 *    columns use ADD COLUMN IF NOT EXISTS).
 * 2. Truncates the volatile tables that hold per-appeal state plus the
 *    canonical-ticket cache so the next E2E run starts on a clean
 *    slate.
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
  // 2026-05-27 — canonical-ticket cache tables (added by migration 0017,
  // feat/ticket-normalisation). Without these in the truncate list the
  // shared portal_snapshot cache survives an E2E reset, so the cache
  // READ in enqueueLookupIfAutomated short-circuits the council lookup
  // and tests of the "fresh PCN, fresh council check" path see stale
  // verdicts from the previous run. List order matters: tickets has a
  // FK referenced by appeals.ticket_id, but CASCADE on the TRUNCATE
  // handles that ordering. ticket_normalisation_audit is a leaf event
  // log so it goes last.
  "tickets",
  "ticket_normalisation_audit",
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

    // Quick sanity check — count rows in appeals + tickets (both
    // should be 0 post-reset), plus councils (preserved).
    const countAppeals = await sql<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM appeals`;
    const countCouncils = await sql<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM councils`;
    const countTickets = await sql<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM tickets`;
    console.log(
      `\nappeals=${countAppeals[0].count}  tickets=${countTickets[0].count}  councils=${countCouncils[0].count}`,
    );
    console.log("\nDB reset complete — ready for E2E.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
