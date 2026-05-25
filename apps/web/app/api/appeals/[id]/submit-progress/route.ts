/**
 * GET /api/appeals/[id]/submit-progress
 *
 * Returns the persisted event log (status/step/thought/screenshot/metadata)
 * for the most recent `submit_appeal` job belonging to this appeal. Powers
 * the inline Watch-Live gallery inside the smart ticket card after a
 * submission has completed — without this, a page refresh would lose the
 * in-memory SSE buffer and the gallery would go blank.
 *
 * Ownership-gated through `canViewAppeal`. Returns `{ events: [] }` when no
 * submit_appeal job has run for the appeal.
 */
import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/server/db/client";
import { getAppealById } from "@/lib/server/appeals";
import { jsonError } from "@/lib/server/contracts";
import {
  canViewAppeal,
  getRequestSessionId,
  getViewer,
} from "@/lib/server/viewer";
import type { JobProgressEvent } from "@/lib/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const appeal = await getAppealById(id);
  if (!appeal) {
    return NextResponse.json(jsonError("NOT_FOUND", `Appeal ${id} not found`), {
      status: 404,
    });
  }
  const viewer = await getViewer();
  const sessionId = getRequestSessionId(req);
  if (!canViewAppeal(viewer, appeal, sessionId)) {
    return NextResponse.json(jsonError("FORBIDDEN", "Not authorised"), {
      status: 403,
    });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ events: [], jobId: null, status: null });

  const rows = await db
    .select({
      id: schema.jobs.id,
      status: schema.jobs.status,
      progress: schema.jobs.progress,
    })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.appealId, id),
        eq(schema.jobs.kind, "submit_appeal"),
      )!,
    )
    .orderBy(desc(schema.jobs.createdAt))
    .limit(1);

  const job = rows[0];
  if (!job) {
    return NextResponse.json({ events: [], jobId: null, status: null });
  }

  const events: JobProgressEvent[] = job.progress ?? [];
  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    events,
  });
}
