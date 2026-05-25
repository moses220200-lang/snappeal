/**
 * Reset a hung appeal's `step` so the smart card flips back to the
 * gathering_evidence surface (with the user's grounds + notes intact)
 * and they can re-tap "Start drafting". Use after killing orphan
 * `claude.exe` processes that didn't release a generation slot.
 *
 * Usage: tsx --env-file=.env.local scripts/reset-appeal-step.ts <appealId>
 */
import postgres from "postgres";

async function main() {
  const appealId = process.argv[2];
  if (!appealId) {
    console.error("usage: reset-appeal-step.ts <appealId>");
    process.exit(1);
  }
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const [row] = await sql<{ id: string; step: string }[]>`
      UPDATE appeals
      SET step = 'photos', updated_at = NOW()
      WHERE id = ${appealId}
      RETURNING id, step
    `;
    if (!row) {
      console.error(`no appeal ${appealId}`);
      process.exit(1);
    }
    console.log(`reset ${row.id} → step=${row.step}`);
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
