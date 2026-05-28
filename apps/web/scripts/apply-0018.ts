import postgres from "postgres";
import { readFile } from "node:fs/promises";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const sql = postgres(dbUrl, { max: 1 });
  try {
    const migration = await readFile("drizzle/0018_appeal_viewers.sql", "utf8");
    await sql.unsafe(migration);
    console.log("✓ 0018_appeal_viewers applied");
    const rows = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'appeal_viewers'
    `;
    console.log(`  appeal_viewers exists: ${rows.length > 0}`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
