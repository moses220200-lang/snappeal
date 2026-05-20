import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    await sql.unsafe(
      `ALTER TABLE "councils" ADD COLUMN IF NOT EXISTS "logo_url" text;`,
    );
    await sql.unsafe(
      `ALTER TABLE "councils" ADD COLUMN IF NOT EXISTS "logo_bg" text;`,
    );
    console.log("ok — logo_url and logo_bg ready on councils");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
