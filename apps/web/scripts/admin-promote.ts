/**
 * Promote a user to admin by email.
 *   npm run admin:promote -- email@example.com
 *
 * Idempotent. Prints the resulting row.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../lib/server/db/client";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run admin:promote -- email@example.com");
  process.exit(1);
}

async function main() {
  const db = getDb();
  if (!db) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const rows = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (rows.length === 0) {
    console.error(`No user with email ${email}`);
    process.exit(2);
  }
  await db.update(schema.users).set({ role: "admin" }).where(eq(schema.users.email, email));
  const fresh = await db.select().from(schema.users).where(eq(schema.users.email, email));
  console.info(`Promoted ${email} → role=admin`);
  console.info(fresh[0]);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
