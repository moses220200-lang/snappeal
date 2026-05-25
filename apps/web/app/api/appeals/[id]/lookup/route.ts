/**
 * POST /api/appeals/[id]/lookup
 *
 * Kick off a council-portal lookup for this appeal. The Playwright MCP
 * agent visits the public appeals portal, looks up the PCN, and returns
 * a validity verdict + warden photos (a "pcn_lookup" job).
 *
 * Behaviour:
 *   - Ownership-checked (same rules as PATCH /api/appeals/[id]).
 *   - Council MUST have automationStatus ∈ {automated_beta, automated_ga}.
 *     For non-automated councils we DON'T enqueue a job — we write a
 *     "skipped" snapshot inline and return { skipped: true }. This keeps
 *     the codepath identical so flipping a council to "automated_beta"
 *     later is a one-row DB change, not a code change.
 *   - Returns either { jobId } (the validating page subscribes via SSE)
 *     or { skipped: true } (the capture page navigates straight to the
 *     evidence/quiz page).
 */
import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import {
  getAppealById,
  patchAppealDraft,
  persistPortalLookup,
  DatabaseNotConfiguredError,
} from "@/lib/server/appeals";
import { jsonError } from "@/lib/server/contracts";
import { getDb, schema } from "@/lib/server/db/client";
import { enqueue } from "@/lib/server/jobs/queue";
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
  // Optional `preferredMethod` query param — stamped from the ticket-
  // page recommendation card tap so the downstream `/api/submit` knows
  // which path to take. NULL/missing = no preference yet.
  const url = new URL(request.url);
  const methodParam = url.searchParams.get("preferredMethod");
  const preferredMethod =
    methodParam === "email" || methodParam === "portal" ? methodParam : null;
  try {
    if (preferredMethod) {
      await patchAppealDraft(id, { preferredMethod });
    }
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
    if (!appeal.councilSlug) {
      return NextResponse.json(
        jsonError(
          "BAD_REQUEST",
          "Appeal has no council yet — finish PCN intake first",
        ),
        { status: 400 },
      );
    }
    if (!appeal.ticket?.pcnRef || !appeal.ticket?.vehicleReg) {
      return NextResponse.json(
        jsonError(
          "BAD_REQUEST",
          "Appeal is missing PCN reference or vehicle reg — cannot look up",
        ),
        { status: 400 },
      );
    }

    const db = getDb();
    if (!db) throw new DatabaseNotConfiguredError();
    const councilRows = await db
      .select()
      .from(schema.councils)
      .where(eq(schema.councils.slug, appeal.councilSlug));
    const council = councilRows[0];
    if (!council) {
      return NextResponse.json(
        jsonError("NOT_FOUND", `Unknown council ${appeal.councilSlug}`),
        { status: 404 },
      );
    }

    const isAutomated =
      council.automationStatus === "automated_beta" ||
      council.automationStatus === "automated_ga";

    if (!isAutomated) {
      // No portal MCP available for this council yet. Record a
      // "skipped" snapshot so the evidence page can render an
      // explanatory state, then tell the client to bypass the
      // validating screen.
      const updated = await persistPortalLookup({
        appealId: id,
        snapshot: {
          jobId: null,
          status: "skipped",
          photoUrls: [],
          fetchedAt: new Date().toISOString(),
          verdictReason: `${council.name} doesn't support portal lookup yet`,
        },
      });
      return NextResponse.json({
        skipped: true,
        reason: "council_not_automated",
        appeal: updated,
      });
    }

    // Idempotency guard: if a pcn_lookup for this appeal is already in
    // flight, reuse it instead of enqueueing a second one. The user might
    // be double-clicking Validate, or refreshing /app/capture and re-firing.
    // Either way, one ticket → one lookup.
    const existing = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.kind, "pcn_lookup"),
          eq(schema.jobs.appealId, id),
          inArray(schema.jobs.status, ["queued", "running"]),
        ),
      )
      .limit(1);
    if (existing[0]) {
      return NextResponse.json({ jobId: existing[0].id, skipped: false });
    }

    const job = await enqueue({
      kind: "pcn_lookup",
      appealId: id,
      payload: { appealId: id },
      // Lookups are read-only — retrying is safe but the council portals
      // get visibly grumpy after a couple of identical lookups in a row,
      // so cap at 2.
      maxAttempts: 2,
    });

    // Stamp a 'pending' snapshot so a quick re-poll from the client sees
    // we're working on it (the real verdict lands when the worker
    // persistPortalLookups).
    await persistPortalLookup({
      appealId: id,
      snapshot: {
        jobId: job.id,
        status: "pending",
        photoUrls: [],
        fetchedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({ jobId: job.id, skipped: false });
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
