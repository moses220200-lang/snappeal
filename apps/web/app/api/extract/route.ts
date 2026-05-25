import { NextResponse } from "next/server";
import { z } from "zod";
import { extractTicket, coachPhoto } from "@/lib/server/ai";
import {
  patchAppealDraft,
  setProcessingStep,
} from "@/lib/server/appeals";
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const maxDuration = 90;

const Body = z.object({
  sessionId: z.string().min(1).max(128),
  pcnPhoto: z.string().min(1).startsWith("data:image/"),
  /** Optional: skip the coach pass when re-running extract after a manual edit. */
  skipCoach: z.boolean().optional(),
  /** v0.2.15 — when present, the route PATCHes the appeal with the OCR
   *  result on success (and marks `processing.ocr.status = "done"`) /
   *  marks `processing.ocr.status = "failed"` with the error on failure.
   *  Used by the progressive ticket-creation flow: capture posts the
   *  appealId, navigates the user to the ticket detail page immediately,
   *  and the smart card polls the appeal row until OCR settles. */
  appealId: z.string().min(1).max(64).optional(),
});

/**
 * POST /api/extract
 *
 * Cheap pre-payment OCR pass. Pulls the ticket fields out of the PCN
 * photo via Claude CLI (with per-field confidence) AND runs a parallel
 * photo-coach pass.
 *
 * Two callsites:
 *   - Legacy (no `appealId`): returns { ticket, confidence, modelUsed, costUsd, coach }
 *     to the client. The capture page used to render the review form
 *     in-page off this payload (pre-v0.2.15).
 *   - Progressive (with `appealId`): does the same OCR work but ALSO
 *     PATCHes the appeal row with the result + the processing status,
 *     so the smart card can pick up the values via its polling loop
 *     without the client having to await the response. The client may
 *     still await for the same payload — the writes are idempotent.
 */
export async function POST(request: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(jsonError("BAD_REQUEST", "Invalid extract body", String(err)), {
      status: 400,
    });
  }

  // v0.2.15 — mark the OCR step as running BEFORE we await Claude. Cheap
  // write; lets the card immediately render the "Reading PCN details…"
  // row instead of a blank ticket shell.
  if (body.appealId) {
    void setProcessingStep(body.appealId, "ocr", "running").catch(() => {});
  }

  try {
    const [extract, coach] = await Promise.all([
      extractTicket({ pcnPhotoDataUrl: body.pcnPhoto }),
      body.skipCoach ? Promise.resolve(null) : coachPhoto({ pcnPhotoDataUrl: body.pcnPhoto }),
    ]);

    // Progressive write: persist OCR result + mark step done. Done in
    // parallel so the request returns fast.
    if (body.appealId) {
      await Promise.all([
        patchAppealDraft(body.appealId, { ticket: extract.ticket }).catch(() => null),
        setProcessingStep(body.appealId, "ocr", "done"),
      ]);
    }

    return NextResponse.json({
      ticket: extract.ticket,
      confidence: extract.confidence,
      modelUsed: extract.modelUsed,
      costUsd: extract.costUsd,
      coach,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to extract";
    if (body.appealId) {
      void setProcessingStep(body.appealId, "ocr", "failed", message).catch(() => {});
    }
    return NextResponse.json(jsonError("AI_ERROR", message), { status: 500 });
  }
}
