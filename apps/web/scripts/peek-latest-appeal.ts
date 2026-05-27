import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const rows = await sql<
      Array<{
        id: string;
        status: string;
        step: string;
        ticket: unknown;
        grounds: unknown;
        notes: string | null;
        preferred_method: string | null;
        processing: unknown;
        letter_body: string | null;
        strength_score: number | null;
        created_at: Date;
        updated_at: Date;
      }>
    >`
      -- model_used dropped in migration 0015 (per-stage cost telemetry
      -- moved to the ai_calls table). Use \`SELECT * FROM ai_calls WHERE
      -- appeal_id = ?\` for per-call model attribution.
      SELECT id, status, step, ticket, grounds, notes, preferred_method, processing,
             letter_body, strength_score, created_at, updated_at
      FROM appeals ORDER BY created_at DESC LIMIT 3`;
    if (rows.length === 0) {
      console.log("no appeals");
      return;
    }
    for (const r of rows) {
      const ticketObj = (r.ticket as Record<string, unknown> | null) ?? null;
      const proc = (r.processing as Record<string, unknown> | null) ?? null;
      const ageMs = Date.now() - new Date(r.updated_at).getTime();
      console.log("─".repeat(60));
      console.log(`id              ${r.id}`);
      console.log(`status          ${r.status}`);
      console.log(`step            ${r.step}`);
      console.log(`preferredMethod ${r.preferred_method}`);
      console.log(`pcnRef          ${ticketObj?.pcnRef ?? "—"}`);
      console.log(`vehicleReg      ${ticketObj?.vehicleReg ?? "—"}`);
      console.log(`grounds         ${JSON.stringify(r.grounds)}`);
      console.log(`notesLen        ${(r.notes ?? "").length}`);
      console.log(`processing      ${JSON.stringify(proc)}`);
      console.log(`letterBodyLen   ${(r.letter_body ?? "").length}`);
      console.log(`strengthScore   ${r.strength_score}`);
      console.log(`updated         ${r.updated_at.toISOString()} (${(ageMs / 1000).toFixed(0)}s ago)`);
    }
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
