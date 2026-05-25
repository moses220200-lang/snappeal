/**
 * POST /api/appeals/[id]/rescore
 *
 * Re-evaluate an existing appeal's strength using the (unchanged) drafted
 * letter + the latest evidence photos. Does NOT redraft the letter — only
 * `strengthScore` / `strengthRationale` / `strengthImprovements` change.
 * Used when a customer adds more evidence to a weak appeal: the score
 * updates in place so they can decide whether to submit.
 *
 * Ownership-checked (same rules as PATCH /api/appeals/[id]). Returns the
 * refreshed appeal so the card re-renders with the new score.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAppealById, updateAppealStrength } from "@/lib/server/appeals";
import { scoreAppealStrength } from "@/lib/server/ai";
import { jsonError } from "@/lib/server/contracts";
import {
  canViewAppeal,
  getRequestSessionId,
  getViewer,
} from "@/lib/server/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  sessionId: z.string().min(1).max(128).optional(),
  evidencePhotos: z
    .array(z.string().startsWith("data:image/"))
    .max(6)
    .default([]),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      jsonError("BAD_REQUEST", "Invalid rescore body", String(err)),
      { status: 400 },
    );
  }

  const appeal = await getAppealById(id);
  if (!appeal) {
    return NextResponse.json(jsonError("NOT_FOUND", `Appeal ${id} not found`), {
      status: 404,
    });
  }
  const viewer = await getViewer();
  const sessionId = getRequestSessionId(request);
  if (!canViewAppeal(viewer, appeal, sessionId)) {
    return NextResponse.json(
      jsonError("FORBIDDEN", `Appeal ${id} not editable by this viewer`),
      { status: 403 },
    );
  }
  if (!appeal.letterBody) {
    return NextResponse.json(
      jsonError("BAD_REQUEST", "No drafted letter to score yet"),
      { status: 400 },
    );
  }

  try {
    const strength = await scoreAppealStrength({
      letterBody: appeal.letterBody,
      grounds: appeal.grounds ?? [],
      notes: appeal.notes,
      council: appeal.ticket?.issuer ?? appeal.councilSlug ?? null,
      evidencePhotoDataUrls: body.evidencePhotos,
    });
    await updateAppealStrength(id, strength);
    const updated = await getAppealById(id);
    return NextResponse.json({ appeal: updated, strength });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to re-score";
    return NextResponse.json(jsonError("AI_ERROR", message), { status: 500 });
  }
}
