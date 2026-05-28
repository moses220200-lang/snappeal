import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const a = await sql<{
      id: string;
      session_id: string;
      ticket_id: string | null;
      pcn: string | null;
    }[]>`SELECT id, session_id, ticket_id, ticket->>'pcnRef' as pcn FROM appeals ORDER BY created_at`;
    console.log(`appeals (${a.length}):`);
    for (const row of a) console.log(`  ${row.id} sess=${row.session_id.slice(0, 16)} ticket=${row.ticket_id} pcn=${row.pcn}`);
    const t = await sql<{ id: string; pcn_ref: string; council_slug: string }[]>`SELECT id, pcn_ref, council_slug FROM tickets`;
    console.log(`tickets (${t.length}):`);
    for (const row of t) console.log(`  ${row.id} ${row.council_slug}/${row.pcn_ref}`);
    const v = await sql<{
      appeal_id: string;
      session_id: string;
      user_id: string | null;
    }[]>`SELECT appeal_id, session_id, user_id FROM appeal_viewers`;
    console.log(`viewers (${v.length}):`);
    for (const row of v) console.log(`  appeal=${row.appeal_id} sess=${row.session_id.slice(0, 16)} user=${row.user_id ?? "(guest)"}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
