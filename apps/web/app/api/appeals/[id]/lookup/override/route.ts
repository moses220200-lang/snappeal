/**
 * POST /api/appeals/[id]/lookup/override
 *
 * Customer-initiated override of a "this PCN is invalid" verdict. Flips
 * `appeals.portal_lookup.status` from `invalid` → `overridden` so the
 * combined evidence/quiz page renders a warning instead of trusting the
 * council's verdict. Used by the small "I disagree, let me appeal
 * anyway" hatch in the verdict-reveal popup (and the inline override on
 * the closed-ticket card on /app/tickets/[id]).
 *
 * No body required — the route just inspects the current snapshot and
 * stamps the new status. Ownership-checked.
 */
import { NextResponse } from "next/server";
import {
  getAppealById,
  persistPortalLookup,
  DatabaseNotConfiguredError,
} from "@/lib/server/appeals";
import { jsonError } from "@/lib/server/contracts";
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
  try {
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
    if (!appeal.portalLookup) {
      return NextResponse.json(
        jsonError("BAD_REQUEST", "No portal lookup to override"),
        { status: 400 },
      );
    }
    const updated = await persistPortalLookup({
      appealId: id,
      snapshot: {
        ...appeal.portalLookup,
        status: "overridden",
      },
    });
    return NextResponse.json({ appeal: updated });
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
        err instanceof Error ? err.message : "Failed to override lookup",
      ),
      { status: 500 },
    );
  }
}
