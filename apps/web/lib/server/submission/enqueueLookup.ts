/**
 * `enqueueLookupIfAutomated(appealId)` — single source of truth for
 * firing a `pcn_lookup` job against an automated council.
 *
 * Two callers today:
 *   1. POST /api/appeals/[id]/lookup — explicit customer-initiated lookup.
 *   2. /api/extract — post-OCR auto-fire for automated councils so the
 *      card flips straight to "Validating with [Council]…" without the
 *      user having to tap anything.
 *
 * Future callers (auto-validate on view for old tickets, admin retry,
 * webhook re-validation) MUST also go through this helper so the
 * automation gate + idempotency invariant stay in lockstep.
 *
 * Outcomes:
 *   "enqueued"    — a fresh job was queued and a "pending" snapshot was
 *                   written onto `appeal.portal_lookup`.
 *   "in_flight"   — a queued/running pcn_lookup already exists; we
 *                   return that jobId without enqueueing a second one.
 *   "skipped"     — council is not automated; a "skipped" snapshot is
 *                   stamped onto `appeal.portal_lookup` so the UI can
 *                   render the right explanation.
 *   "missing_data"— appeal is missing pcnRef / vehicleReg / councilSlug;
 *                   nothing was enqueued.
 *   "appeal_missing" — no appeal row for the id.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { enqueue } from "../jobs/queue";
import {
  getAppealById,
  persistPortalLookup,
  DatabaseNotConfiguredError,
} from "../appeals";

export type EnqueueLookupOutcome =
  | { outcome: "enqueued"; jobId: string }
  | { outcome: "in_flight"; jobId: string }
  | { outcome: "skipped"; reason: "council_not_automated" }
  | { outcome: "missing_data"; reason: "no_council" | "no_pcn_ref" | "no_vehicle_reg" }
  | { outcome: "appeal_missing" };

export async function enqueueLookupIfAutomated(
  appealId: string,
): Promise<EnqueueLookupOutcome> {
  const db = getDb();
  if (!db) throw new DatabaseNotConfiguredError();

  const appeal = await getAppealById(appealId);
  if (!appeal) return { outcome: "appeal_missing" };

  if (!appeal.councilSlug) {
    return { outcome: "missing_data", reason: "no_council" };
  }
  if (!appeal.ticket?.pcnRef) {
    return { outcome: "missing_data", reason: "no_pcn_ref" };
  }
  if (!appeal.ticket?.vehicleReg) {
    return { outcome: "missing_data", reason: "no_vehicle_reg" };
  }

  const councilRows = await db
    .select()
    .from(schema.councils)
    .where(eq(schema.councils.slug, appeal.councilSlug));
  const council = councilRows[0];
  if (!council) {
    // Unknown slug — same shape as missing data; the route handler
    // surfaces this as a 404 if it's customer-initiated, otherwise
    // silently ignored from the auto-fire path.
    return { outcome: "missing_data", reason: "no_council" };
  }

  const isAutomated =
    council.automationStatus === "automated_beta" ||
    council.automationStatus === "automated_ga";

  if (!isAutomated) {
    await persistPortalLookup({
      appealId,
      snapshot: {
        jobId: null,
        status: "skipped",
        photoUrls: [],
        fetchedAt: new Date().toISOString(),
        verdictReason: `${council.name} doesn't support portal lookup yet`,
      },
    });
    return { outcome: "skipped", reason: "council_not_automated" };
  }

  // Idempotency layer 1 — a pcn_lookup already in flight for this
  // appeal. Catches concurrent enqueues (e.g. two API calls fired
  // before either has run).
  const existing = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.kind, "pcn_lookup"),
        eq(schema.jobs.appealId, appealId),
        inArray(schema.jobs.status, ["queued", "running"]),
      ),
    )
    .limit(1);
  if (existing[0]) {
    return { outcome: "in_flight", jobId: existing[0].id };
  }

  // Idempotency layer 2 — a previous lookup already SETTLED on this
  // appeal with a usable verdict. Without this guard, the flow's two
  // independent triggers (agreeTicket → POST, then startAppeal → POST
  // some seconds later) BOTH enqueue real jobs once the first one
  // reaches `done`, costing ~$0.30 + ~60s the second time for no
  // benefit. Only `error` lookups roll the dice again; everything
  // else (verified / invalid / skipped / overridden / pending) is the
  // existing state of record.
  //
  // PENDING is a special case: the stamp at the bottom of this helper
  // writes status=pending with the freshly-enqueued jobId. If the job
  // row is later deleted (worker crash purge / admin cleanup) the
  // appeal would be permanently stuck — layer 1 wouldn't find the
  // (deleted) job, layer 2 would happily return in_flight with the
  // dead jobId. So for the 'pending' case, verify the jobs row is
  // still alive; if not, fall through to enqueue a fresh one.
  const settled = appeal.portalLookup;
  if (
    settled &&
    settled.status !== "error" &&
    settled.jobId
  ) {
    if (settled.status !== "pending") {
      return { outcome: "in_flight", jobId: settled.jobId };
    }
    const liveJob = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, settled.jobId))
      .limit(1);
    if (liveJob[0]) {
      return { outcome: "in_flight", jobId: settled.jobId };
    }
    // Pending snapshot has a stale jobId — the underlying row is
    // gone. Fall through to enqueue a fresh job so the customer
    // isn't stranded on the validating screen.
  }

  const job = await enqueue({
    kind: "pcn_lookup",
    appealId,
    payload: { appealId },
    // Lookups are read-only — retrying is safe but the council portals
    // get visibly grumpy after a couple of identical lookups in a row,
    // so cap at 2.
    maxAttempts: 2,
  });

  // Stamp a 'pending' snapshot so a quick re-poll from the client sees
  // we're working on it (the real verdict lands when the worker calls
  // persistPortalLookup with the final snapshot).
  await persistPortalLookup({
    appealId,
    snapshot: {
      jobId: job.id,
      status: "pending",
      photoUrls: [],
      fetchedAt: new Date().toISOString(),
    },
  });

  return { outcome: "enqueued", jobId: job.id };
}
