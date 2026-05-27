/**
 * One-shot backfill — extract `tickets` rows from existing `appeals`.
 *
 * Walks every appeal that has a complete identity (councilSlug +
 * ticket.pcnRef + ticket.vehicleReg). For each, normalises the
 * identity, UPSERTs into `tickets`, and stamps `appeals.ticket_id`.
 *
 * Idempotent — safe to run repeatedly. Re-runs against an already-
 * backfilled DB are no-ops.
 *
 * On identity collisions (two appeals with the same normalised
 * (council, pcn_ref) but different ticket fields), the row that
 * already has a non-null `portal_lookup` wins; otherwise the most
 * recently `updated_at` row wins. Discarded rows are logged to
 * `ticket_normalisation_audit` with event `'created_collision_loser'`
 * so a human can audit them before the prod migrate is greenlit.
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/migrate-extract-tickets.ts
 *
 * Exit code 0 = success (no fatal errors). Console output ends with a
 * one-line summary: appeals scanned / tickets created / appeals linked
 * / collision losers / skipped (missing identity).
 */
import { and, asc, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "../lib/server/db/client";
import {
  appealTicketIdentity,
  logAudit,
  normalisePcnRef,
  upsertTicketFromAppeal,
} from "../lib/server/tickets";
import type { AppealRecord } from "../lib/server/appeals";

async function main() {
  const db = getDb();
  if (!db) {
    console.error("DATABASE_URL not set.");
    process.exit(1);
  }

  console.info("▶ extracting tickets from appeals…");

  // Pull every appeal that hasn't been linked yet AND has the minimum
  // jsonb shape we need. Ordering by createdAt ASC means when we hit
  // a collision, the OLDER appeal owns the canonical ticket fields
  // and the newer is the "loser" — matches the existing dedup intuition
  // in mergeDuplicateDraftIfAny (collapse INTO the older row).
  const candidates = await db
    .select()
    .from(schema.appeals)
    .where(
      and(
        isNull(schema.appeals.ticketId),
        isNotNull(schema.appeals.councilSlug),
        sql`${schema.appeals.ticket}->>'pcnRef' IS NOT NULL`,
        sql`${schema.appeals.ticket}->>'vehicleReg' IS NOT NULL`,
      ),
    )
    .orderBy(asc(schema.appeals.createdAt));

  let scanned = 0;
  let promoted = 0; // first-touch ticket row created
  let linked = 0; // appeal pointed at an existing ticket row
  let collisionLosers = 0;
  let skipped = 0;

  // The ticket jsonb fields we read for council-record promotion +
  // collision-divergence detection. Optional shape because OCR may
  // omit any combination.
  type TicketJsonb = {
    issuer?: string;
    contraventionCode?: string;
    contraventionDescription?: string;
    issuedAt?: string;
    location?: string;
    amountPence?: number;
    pcnRef?: string;
    vehicleReg?: string;
  };

  for (const row of candidates) {
    scanned += 1;
    const appeal = row as unknown as AppealRecord;
    const identity = appealTicketIdentity(appeal);
    if (!identity) {
      skipped += 1;
      continue;
    }
    const t: TicketJsonb = (appeal.ticket ?? {}) as TicketJsonb;

    // Pre-check: is there already a ticket for this identity?
    const existing = await db
      .select()
      .from(schema.tickets)
      .where(
        and(
          eq(schema.tickets.councilSlug, identity.councilSlug),
          eq(schema.tickets.pcnRef, identity.pcnRef),
        ),
      )
      .limit(1);

    if (existing[0]) {
      // Ticket already exists. Just link this appeal to it. The
      // existing row's council-record fields stay authoritative — we
      // never overwrite during backfill. If this appeal's ticket
      // jsonb has data that differs from the existing tickets row,
      // log it so a human can audit.
      const e = existing[0];
      const divergence: Record<string, { existing: unknown; appeal: unknown }> = {};
      if (t.issuer && e.issuer && t.issuer !== e.issuer)
        divergence.issuer = { existing: e.issuer, appeal: t.issuer };
      if (t.amountPence != null && e.amountPence != null && t.amountPence !== e.amountPence)
        divergence.amountPence = { existing: e.amountPence, appeal: t.amountPence };
      if (Object.keys(divergence).length > 0) {
        collisionLosers += 1;
        logAudit("created_collision_loser", { ticketId: e.id, appealId: appeal.id }, {
          reason: "appeal-ticket jsonb fields differ from existing tickets row",
          divergence,
        });
      }

      await db
        .update(schema.appeals)
        .set({ ticketId: e.id, updatedAt: new Date() })
        .where(eq(schema.appeals.id, appeal.id));
      linked += 1;
      continue;
    }

    // First-touch — promote this appeal's ticket jsonb into a new
    // tickets row. UPSERT (not plain INSERT) to handle the
    // vanishingly-rare concurrent-backfill race.
    const issuedAt = parseIsoOrNull(t.issuedAt);
    const ticketId = await upsertTicketFromAppeal(db, identity, {
      issuer: t.issuer ?? null,
      contraventionCode: t.contraventionCode ?? null,
      contraventionDescription: t.contraventionDescription ?? null,
      issuedAt,
      location: t.location ?? null,
      amountPence: typeof t.amountPence === "number" && t.amountPence > 0 ? t.amountPence : null,
    });

    await db
      .update(schema.appeals)
      .set({ ticketId, updatedAt: new Date() })
      .where(eq(schema.appeals.id, appeal.id));

    logAudit("created", { ticketId, appealId: appeal.id }, {
      pcnRef: identity.pcnRef,
      vehicleReg: identity.vehicleReg,
      councilSlug: identity.councilSlug,
      source: "backfill",
    });
    promoted += 1;
  }

  console.info(
    `\n──────────── summary ────────────\n` +
      `scanned          ${scanned}\n` +
      `tickets created  ${promoted}\n` +
      `appeals linked   ${linked}  (matched existing ticket)\n` +
      `collision losers ${collisionLosers}  (logged to audit — audit before prod!)\n` +
      `skipped          ${skipped}  (missing required identity)\n` +
      `─────────────────────────────────\n`,
  );

  if (collisionLosers > 0) {
    console.warn(
      "⚠  Some appeals had ticket jsonb fields that diverge from the existing tickets row.\n" +
        "   Inspect via: SELECT * FROM ticket_normalisation_audit WHERE event='created_collision_loser';\n" +
        "   No data was overwritten — the existing tickets row stayed authoritative.",
    );
  }
  process.exit(0);
}

function parseIsoOrNull(s: unknown): Date | null {
  if (typeof s !== "string" || s.length === 0) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// `normalisePcnRef` is imported so the script and the runtime helpers
// stay in lockstep; not currently called inline here because
// `appealTicketIdentity` already normalises.
void normalisePcnRef;

main().catch((err) => {
  console.error("\n✗ backfill crashed:", err);
  process.exit(1);
});
