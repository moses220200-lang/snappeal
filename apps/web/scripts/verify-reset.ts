import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const [a] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM appeals`;
    const [c] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM councils`;
    const [u] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM users`;
    const cols = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'appeals'
        AND (column_name LIKE 'strength%' OR column_name = 'knowledge_pack_used')
      ORDER BY column_name`;
    console.log(`appeals=${a.n} councils=${c.n} users=${u.n}`);
    console.log(`new columns: ${cols.map((r) => r.column_name).join(", ")}`);
  } finally {
    await sql.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
