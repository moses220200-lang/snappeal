/**
 * One-shot backfill: normalise `portal_lookup.metadata` date fields on
 * existing appeal rows to ISO 8601. New writes already go through the
 * normaliser in `persistPortalLookup`; this catches rows that landed
 * before that shipped (and so display "Invalid Date" in
 * `formatShortDate` without the read-side fallback).
 *
 * Run once after deploy:
 *   cd apps/web && npx tsx --env-file=.env.local scripts/normalize-portal-dates.ts
 *
 * Idempotent: rows already in ISO are skipped (the helper returns the
 * input unchanged on values it can't improve).
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../lib/server/db/client";
import { parseUkDateToIso } from "../lib/parseUkDate";
import type { PortalLookupSnapshot } from "../lib/server/db/schema";

/** Mirror of the keys list in `appeals.ts` — kept duplicated here so
 *  this script can run standalone without exporting an internal helper. */
const PORTAL_METADATA_DATE_KEYS = [
  "issuedAt",
  "dueDateAt",
  "discountUntil",
  "fullChargeFrom",
] as const;

async function main() {
  const db = getDb();
  if (!db) {
    console.error("DATABASE_URL not set — nothing to normalise.");
    process.exit(1);
  }

  const rows = await db
    .select({
      id: schema.appeals.id,
      portalLookup: schema.appeals.portalLookup,
      ticket: schema.appeals.ticket,
    })
    .from(schema.appeals);

  let scanned = 0;
  let touched = 0;
  const changes: Array<{ id: string; field: string; from: string; to: string }> = [];

  for (const row of rows) {
    const lookup = row.portalLookup;
    if (!lookup?.metadata) continue;
    scanned++;

    const meta = { ...lookup.metadata } as Record<string, unknown>;
    let metadataChanged = false;
    for (const key of PORTAL_METADATA_DATE_KEYS) {
      const raw = meta[key];
      if (typeof raw !== "string" || raw.length === 0) continue;
      const iso = parseUkDateToIso(raw);
      if (iso && iso !== raw) {
        changes.push({ id: row.id, field: `metadata.${key}`, from: raw, to: iso });
        meta[key] = iso;
        metadataChanged = true;
      }
    }

    // Also pass the ticket through — the lookup-time backfill stored
    // raw council dates onto `ticket.issuedAt` etc. for legacy rows.
    const ticket = (row.ticket ?? {}) as Record<string, unknown>;
    let ticketChanged = false;
    const nextTicket: Record<string, unknown> = { ...ticket };
    for (const key of PORTAL_METADATA_DATE_KEYS) {
      const raw = nextTicket[key];
      if (typeof raw !== "string" || raw.length === 0) continue;
      const iso = parseUkDateToIso(raw);
      if (iso && iso !== raw) {
        changes.push({ id: row.id, field: `ticket.${key}`, from: raw, to: iso });
        nextTicket[key] = iso;
        ticketChanged = true;
      }
    }

    if (!metadataChanged && !ticketChanged) continue;

    const nextLookup: PortalLookupSnapshot = metadataChanged
      ? { ...lookup, metadata: meta as PortalLookupSnapshot["metadata"] }
      : lookup;

    type AppealUpdate = Partial<typeof schema.appeals.$inferInsert>;
    const updates: AppealUpdate = { updatedAt: new Date() };
    if (metadataChanged) updates.portalLookup = nextLookup;
    if (ticketChanged) {
      updates.ticket = nextTicket as AppealUpdate["ticket"];
    }
    await db
      .update(schema.appeals)
      .set(updates)
      .where(eq(schema.appeals.id, row.id));
    touched++;
  }

  console.log(`Scanned ${scanned} appeals with portal_lookup.metadata.`);
  console.log(`Updated ${touched} rows.`);
  for (const c of changes) {
    console.log(`  ${c.id}  ${c.field}  ${c.from}  →  ${c.to}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
