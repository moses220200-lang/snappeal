/**
 * POST /api/appeals/[id]/lookup
 *
 * Customer-initiated council-portal lookup. Thin wrapper around the
 * shared `enqueueLookupIfAutomated` helper in
 * `lib/server/submission/enqueueLookup.ts` — every gate (council
 * automation, idempotency, pending-snapshot stamp) lives in the helper
 * so the auto-fire path (post-OCR) and any future trigger share one
 * code path.
 *
 * Responses:
 *   200 { jobId, skipped: false }     — fresh job enqueued
 *   200 { jobId, skipped: false, inFlight: true } — existing job reused
 *   200 { skipped: true, reason }     — non-automated council; "skipped"
 *                                       snapshot persisted; client moves on
 *   400 ...                           — missing PCN / VRM / council
 *   403 ...                           — viewer can't see this appeal
 *   404 ...                           — appeal or council unknown
 */
import { NextResponse } from "next/server";
import {
  getAppealById,
  patchAppealDraft,
  DatabaseNotConfiguredError,
} from "@/lib/server/appeals";
import { jsonError } from "@/lib/server/contracts";
import { enqueueLookupIfAutomated } from "@/lib/server/submission/enqueueLookup";
import {
  canViewAppeal,
  getRequestSessionId,
  getViewer,
} from "@/lib/server/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  // Optional `preferredMethod` query param — stamped from the ticket-
  // page recommendation card tap so the downstream `/api/submit` knows
  // which path to take. NULL/missing = no preference yet.
  const methodParam = url.searchParams.get("preferredMethod");
  const preferredMethod =
    methodParam === "email" || methodParam === "portal" ? methodParam : null;
  try {
    if (preferredMethod) {
      await patchAppealDraft(id, { preferredMethod });
    }

    // Ownership check up front so we never expose council automation
    // status or job ids to non-owners.
    const appeal = await getAppealById(id);
    if (!appeal) {
      return NextResponse.json(
        jsonError("NOT_FOUND", `Appeal ${id} not found`),
        { status: 404 },
      );
    }
    const viewer = await getViewer();
    const sessionId = getRequestSessionId(request);
    if (!canViewAppeal(viewer, appeal, sessionId)) {
      return NextResponse.json(
        jsonError("FORBIDDEN", `Appeal ${id} not editable by this viewer`),
        { status: 403 },
      );
    }

    const result = await enqueueLookupIfAutomated(id);

    switch (result.outcome) {
      case "enqueued":
        return NextResponse.json({ jobId: result.jobId, skipped: false });
      case "in_flight":
        return NextResponse.json({
          jobId: result.jobId,
          skipped: false,
          inFlight: true,
        });
      case "cached":
        // v0.3.12 — cache hit. The snapshot was already persisted onto
        // appeal.portal_lookup by enqueueLookupIfAutomated, so we just
        // hand the client the freshly-updated appeal row and a flag it
        // can show ("Council already validated — fast-forwarded").
        return NextResponse.json({
          skipped: false,
          cached: true,
          ticketId: result.ticketId,
          ageMs: result.ageMs,
          appeal: await getAppealById(id),
        });
      case "skipped":
        return NextResponse.json({
          skipped: true,
          reason: result.reason,
          appeal: await getAppealById(id), // returns the freshly persisted snapshot
        });
      case "missing_data":
        return NextResponse.json(
          jsonError(
            "BAD_REQUEST",
            result.reason === "no_council"
              ? "Appeal has no council yet — finish PCN intake first"
              : "Appeal is missing PCN reference or vehicle reg — cannot look up",
          ),
          { status: 400 },
        );
      case "appeal_missing":
        // Caught above as 404 already, but kept for exhaustiveness.
        return NextResponse.json(
          jsonError("NOT_FOUND", `Appeal ${id} not found`),
          { status: 404 },
        );
    }
  } catch (err) {
    if (err instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(
        jsonError("DATABASE_NOT_CONFIGURED", err.message),
        { status: 503 },
      );
    }
    return NextResponse.json(
      jsonError(
        "INTERNAL",
        err instanceof Error ? err.message : "Failed to enqueue lookup",
      ),
      { status: 500 },
    );
  }
}
