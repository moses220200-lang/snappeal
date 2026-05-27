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
import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { enqueue } from "../jobs/queue";
import {
  getAppealById,
  persistPortalLookup,
  DatabaseNotConfiguredError,
} from "../appeals";
import {
  appealTicketIdentity,
  getCachedSnapshot,
  logAudit,
  upsertTicketFromAppeal,
} from "../tickets";
import type { PortalLookupSnapshot } from "../db/schema";

export type EnqueueLookupOutcome =
  | { outcome: "enqueued"; jobId: string }
  | { outcome: "in_flight"; jobId: string }
  /** v0.3.12 — the (council, pcn) has a fresh-enough cached snapshot
   *  from a previous lookup (possibly by a different user). No job
   *  enqueued; a sanitised snapshot was written to this appeal's
   *  portal_lookup so the UI can advance immediately. */
  | { outcome: "cached"; ticketId: string; ageMs: number }
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

  // v0.3.12 — promote-if-needed. By the time someone asks for a portal
  // lookup, we have everything needed to materialise the canonical
  // tickets row. patchAppealDraft will also do this on user-typed
  // writes (Step 4); the call here covers the auto-fire-from-extract
  // path (where /api/extract's PATCH lands first and this fires
  // synchronously after).
  //
  // Idempotent — if the appeal already has ticket_id pointing at a
  // matching identity, upsertTicketFromAppeal short-circuits.
  let ticketId: string | null = appeal.ticketId ?? null;
  const identity = appealTicketIdentity(appeal);
  if (identity && !ticketId) {
    const t = appeal.ticket ?? null;
    const issuedAt = typeof t?.issuedAt === "string" && t.issuedAt.length
      ? new Date(t.issuedAt)
      : null;
    ticketId = await upsertTicketFromAppeal(db, identity, {
      issuer: t?.issuer ?? null,
      contraventionCode: t?.contraventionCode ?? null,
      contraventionDescription: t?.contraventionDescription ?? null,
      issuedAt: issuedAt && !Number.isNaN(issuedAt.getTime()) ? issuedAt : null,
      location: t?.location ?? null,
      amountPence:
        typeof t?.amountPence === "number" && t.amountPence > 0
          ? t.amountPence
          : null,
    });
    await db
      .update(schema.appeals)
      .set({ ticketId, updatedAt: new Date() })
      .where(eq(schema.appeals.id, appealId));
    logAudit("promoted", { ticketId, appealId }, {
      source: "enqueueLookup",
      identity,
    });
  }

  // v0.3.12 — Step 2: cache READ. If a recent snapshot exists for this
  // (council, pcn), fast-forward without firing a real lookup. Saves
  // ~$0.30 + ~60s when the same PCN has been validated recently by
  // ANYONE (this user OR a different user).
  //
  // getCachedSnapshot enforces the verdict-aware TTL ladder
  // (paid/closed 30d, open 1h, etc.) and refuses to return per-user
  // 'overridden' state — see lib/server/tickets.ts.
  if (ticketId && identity) {
    const cached = await getCachedSnapshot(identity.councilSlug, identity.pcnRef);
    if (cached) {
      // Build a fresh per-appeal snapshot from the cached shape.
      // Critically: jobId=null and status derived from the verdict
      // — never copy A's jobId or status to B (Plan agent concern #2).
      const perAppealStatus: PortalLookupSnapshot["status"] =
        cached.snapshot.verdict === "open" ? "verified" : "invalid";
      const newSnapshot: PortalLookupSnapshot = {
        jobId: null,
        status: perAppealStatus,
        verdict: cached.snapshot.verdict,
        verdictReason: cached.snapshot.verdictReason,
        photoUrls: cached.snapshot.photoUrls,
        metadata: cached.snapshot.metadata,
        fetchedAt: cached.snapshot.fetchedAt,
      };
      await persistPortalLookup({ appealId, snapshot: newSnapshot });
      logAudit("cache_hit", { ticketId: cached.ticketId, appealId }, {
        verdict: cached.snapshot.verdict,
        ageMs: cached.ageMs,
        source: cached.snapshot.source,
      });

      // v0.3.12 — Step 2.5: opt-in shadow validation. When
      // PARKINGRABBIT_CACHE_SHADOW=1, also fire a real lookup in
      // the background. The worker's shadow branch will run the
      // lookup but skip persistPortalLookup + dispatchAppealEvent
      // (so this user's card stays on the fast-forwarded cached
      // state), and instead call cacheSnapshot directly — which
      // triggers the drift detection in lib/server/tickets.ts.
      //
      // Off by default. Operational tool — flip on for the prod
      // rollout window, leave for ~48h to catch TTL bugs + council
      // verdict changes that the cache held over. Costs ~$0.30 per
      // shadow run; that's the trade-off for verification confidence.
      if (process.env.PARKINGRABBIT_CACHE_SHADOW === "1") {
        await enqueue({
          kind: "pcn_lookup",
          appealId,
          payload: { appealId, shadow: true },
          maxAttempts: 1,
        }).catch(() => {
          /* shadow enqueue is best-effort */
        });
      }

      return { outcome: "cached", ticketId: cached.ticketId, ageMs: cached.ageMs };
    }
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

  // v0.3.12 — Idempotency layer 1.5: cross-ticket in-flight. A
  // pcn_lookup for ANY OTHER appeal that shares this ticket_id counts
  // as in-flight for us too. When that job completes, the worker's
  // propagateSnapshotToSiblings call will write the verdict onto this
  // appeal's portal_lookup automatically.
  //
  // Until then this appeal also stamps status='pending' below pointing
  // at the sibling job's id — its card shows "Validating with
  // [council]…" same as if its own job were running. Critically: when
  // mergeDuplicateDraftIfAny later deletes a duplicate appeal whose
  // job was the in-flight one (Plan agent concern #5), the merge
  // transaction TRANSFERS the job's appealId to the survivor — so this
  // sibling reference stays valid.
  if (ticketId) {
    const siblingJob = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .innerJoin(schema.appeals, eq(schema.appeals.id, schema.jobs.appealId))
      .where(
        and(
          eq(schema.jobs.kind, "pcn_lookup"),
          inArray(schema.jobs.status, ["queued", "running"]),
          eq(schema.appeals.ticketId, ticketId),
          ne(schema.appeals.id, appealId),
        ),
      )
      .limit(1);
    if (siblingJob[0]) {
      // Stamp pending snapshot pointing at the sibling job. When the
      // worker lands the verdict, propagateSnapshotToSiblings will
      // overwrite this with a 'verified'/'invalid' snapshot.
      await persistPortalLookup({
        appealId,
        snapshot: {
          jobId: siblingJob[0].id,
          status: "pending",
          photoUrls: [],
          fetchedAt: new Date().toISOString(),
        },
      });
      return { outcome: "in_flight", jobId: siblingJob[0].id };
    }
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
