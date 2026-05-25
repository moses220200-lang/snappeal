import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getAppealById,
  patchAppealDraft,
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

const PatchBody = z.object({
  notes: z.string().max(2000).nullable().optional(),
  ticket: z.record(z.string(), z.unknown()).optional().nullable(),
  serviceTier: z.enum(["buy_time", "grounds", "care_plan"]).optional(),
  evidenceCount: z.number().int().min(0).max(6).optional(),
  grounds: z.array(z.string().max(80)).max(50).optional(),
  /** Customer-picked submission path. Stamped from the ticket-page
   *  recommendation card on tap. NULL is a valid value (resets state). */
  preferredMethod: z.enum(["email", "portal"]).nullable().optional(),
  /** v0.2.15 — uploaded PCN photo URL (Blob or data URL until Blob ships). */
  pcnImageUrl: z.string().max(8 * 1024 * 1024).nullable().optional(),
  /** v0.2.16 — workflow step sentinel. Used by the smart card to flip
   *  the gathering_evidence → drafting transition. Pattern matches
   *  appeals.step (text). */
  step: z.string().max(64).optional(),
});

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const appeal = await getAppealById(id);
    if (!appeal) {
      return NextResponse.json(jsonError("NOT_FOUND", `Appeal ${id} not found`), {
        status: 404,
      });
    }
    const [viewer] = await Promise.all([getViewer()]);
    const sessionId = getRequestSessionId(request);
    if (!canViewAppeal(viewer, appeal, sessionId)) {
      return NextResponse.json(
        jsonError("FORBIDDEN", `Appeal ${id} not accessible to this viewer`),
        { status: 403 },
      );
    }
    return NextResponse.json({ appeal });
  } catch (err) {
    if (err instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(jsonError("DATABASE_NOT_CONFIGURED", err.message), { status: 503 });
    }
    return NextResponse.json(
      jsonError("INTERNAL", err instanceof Error ? err.message : "Failed to fetch appeal"),
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await request.json());
  } catch (err) {
    return NextResponse.json(jsonError("BAD_REQUEST", "Invalid patch body", String(err)), {
      status: 400,
    });
  }
  try {
    const existing = await getAppealById(id);
    if (!existing) {
      return NextResponse.json(jsonError("NOT_FOUND", `Appeal ${id} not found`), {
        status: 404,
      });
    }
    const viewer = await getViewer();
    const sessionId = getRequestSessionId(request);
    if (!canViewAppeal(viewer, existing, sessionId)) {
      return NextResponse.json(
        jsonError("FORBIDDEN", `Appeal ${id} not editable by this viewer`),
        { status: 403 },
      );
    }
    const appeal = await patchAppealDraft(id, body);
    if (!appeal) {
      return NextResponse.json(jsonError("NOT_FOUND", `Appeal ${id} not found`), {
        status: 404,
      });
    }
    return NextResponse.json({ appeal });
  } catch (err) {
    if (err instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(jsonError("DATABASE_NOT_CONFIGURED", err.message), { status: 503 });
    }
    return NextResponse.json(
      jsonError("INTERNAL", err instanceof Error ? err.message : "Failed to update appeal"),
      { status: 500 },
    );
  }
}
