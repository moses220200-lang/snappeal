/**
 * Seed the `councils` table from the v0.1 verified-council list.
 *
 * Source of truth: the seven councils in `apps/web/lib/mock-data.ts` (which
 * mirrors the wiki at `wiki/docs/councils/`). When/if the wiki KB grows to
 * the full 33 boroughs, this script should be regenerated from the wiki
 * directly — for v0.1 the verified seven are the only ones with confirmed
 * portal URLs + contact details.
 *
 * Run with:
 *   DATABASE_URL=postgres://... npx tsx scripts/seed-councils.ts
 *
 * Idempotent — uses an upsert keyed on `slug`, so repeat runs are safe.
 */

// .env.local is loaded by `tsx --env-file=.env.local` in package.json.
import { councils as seedCouncils } from "../lib/mock-data";
import { getDb, schema } from "../lib/server/db/client";
import { sql } from "drizzle-orm";

/**
 * Council records expanded with the operational fields the schema expects
 * (submission_methods, identifier_hints, automation_status, etc.).
 *
 * `submission_methods` reflects what the council actually accepts:
 *   - portal:  online appeal form
 *   - email:   parking appeals inbox
 *   - post:    written representation by post
 * Almost every London authority accepts all three; we list both portal
 * and email when both are wired in the v0.1 mock submission engine.
 */
const SEED_ROWS = seedCouncils.map((c) => {
  const methods: string[] = ["portal"];
  if (c.appealEmail) methods.push("email");
  if (c.postalAddress) methods.push("post");

  // Identifier hints — strings the vision model looks for on the PCN
  // to recognise the issuer. Drawn from the council's letterheads / PCN
  // templates as documented in the wiki.
  const hints: Record<string, string[]> = {
    westminster: [
      "WESTMINSTER CITY COUNCIL",
      "City of Westminster",
      "Westminster",
      "WCC PCN",
    ],
    "kensington-chelsea": [
      "ROYAL BOROUGH OF KENSINGTON AND CHELSEA",
      "RBKC",
      "Kensington and Chelsea",
    ],
    camden: ["LONDON BOROUGH OF CAMDEN", "Camden Council", "LB Camden"],
    lambeth: ["LONDON BOROUGH OF LAMBETH", "Lambeth Council", "LB Lambeth"],
    islington: [
      "LONDON BOROUGH OF ISLINGTON",
      "Islington Council",
      "LB Islington",
    ],
    tfl: ["TRANSPORT FOR LONDON", "TfL", "Red Route"],
    "city-of-london": [
      "CITY OF LONDON CORPORATION",
      "City of London",
      "Square Mile",
    ],
  };

  return {
    slug: c.slug,
    name: c.name,
    type: c.type,
    appealPortalUrl: c.appealPortalUrl,
    paymentPortalUrl: c.paymentPortalUrl ?? null,
    appealEmail: c.appealEmail,
    postalAddress: c.postalAddress,
    submissionMethods: methods,
    identifierHints: hints[c.slug] ?? [c.name.toUpperCase()],
    automationStatus: c.automationStatus,
    notes: null as string | null,
    lastVerifiedAt: new Date("2026-05-19"),
  };
});

async function main() {
  const db = getDb();
  if (!db) {
    console.error(
      "[seed-councils] DATABASE_URL is not set. Add it to apps/web/.env.local " +
        "(see .env.example) before running this seed.",
    );
    process.exit(1);
  }

  console.info(`[seed-councils] Upserting ${SEED_ROWS.length} councils…`);

  for (const row of SEED_ROWS) {
    await db
      .insert(schema.councils)
      .values(row)
      .onConflictDoUpdate({
        target: schema.councils.slug,
        set: {
          name: row.name,
          type: row.type,
          appealPortalUrl: row.appealPortalUrl,
          paymentPortalUrl: row.paymentPortalUrl,
          appealEmail: row.appealEmail,
          postalAddress: row.postalAddress,
          submissionMethods: row.submissionMethods,
          identifierHints: row.identifierHints,
          automationStatus: row.automationStatus,
          lastVerifiedAt: row.lastVerifiedAt,
          updatedAt: sql`now()`,
        },
      });
    console.info(`  ✓ ${row.slug} — ${row.name}`);
  }

  console.info(`[seed-councils] Done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-councils] Failed:", err);
  process.exit(1);
});
