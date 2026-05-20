import { NextResponse } from "next/server";
import { getJob } from "@/lib/server/jobs/queue";
import { jsonError } from "@/lib/server/contracts";
import { getAppealById } from "@/lib/server/appeals";
import {
  canViewAppeal,
  getRequestSessionId,
  getViewer,
} from "@/lib/server/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/jobs/[id] — frontend polls this after /api/submit to watch
 * the submit_appeal job progress. Ownership-gated: the caller must be
 * the appeal's owner (signed-in user, matching anonymous session, or
 * admin). Strips the `payload` field on the wire so internal IDs
 * (paymentIntentId, etc.) never leak.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json(jsonError("NOT_FOUND", `Job ${id} not found`), { status: 404 });
  }

  // Jobs are only ever scoped to an appeal in v0.1. Defence-in-depth: if a
  // future job kind has no appealId, default to admin-only access.
  if (!job.appealId) {
    const viewer = await getViewer();
    if (viewer.role !== "admin") {
      return NextResponse.json(jsonError("FORBIDDEN", "Not authorised"), { status: 403 });
    }
  } else {
    const appeal = await getAppealById(job.appealId);
    const viewer = await getViewer();
    const sessionId = getRequestSessionId(req);
    if (!appeal || !canViewAppeal(viewer, appeal, sessionId)) {
      return NextResponse.json(
        jsonError("FORBIDDEN", `Job ${id} not accessible`),
        { status: 403 },
      );
    }
  }

  // Strip payload + lockedBy on the wire — they're internals.
  const {
    payload: _payload, // eslint-disable-line @typescript-eslint/no-unused-vars
    lockedBy: _lockedBy, // eslint-disable-line @typescript-eslint/no-unused-vars
    ...safe
  } = job;
  return NextResponse.json({ job: safe });
}
