import { NextResponse } from "next/server";
import { z } from "zod";
import { extractTicket, coachPhoto } from "@/lib/server/ai";
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const maxDuration = 90;

const Body = z.object({
  sessionId: z.string().min(1).max(128),
  pcnPhoto: z.string().min(1).startsWith("data:image/"),
  /** Optional: skip the coach pass when re-running extract after a manual edit. */
  skipCoach: z.boolean().optional(),
});

/**
 * POST /api/extract
 *
 * Cheap pre-payment OCR pass. Pulls the ticket fields out of the PCN
 * photo via Claude CLI (with per-field confidence) AND runs a parallel
 * photo-coach pass so the capture screen can show "retake?" advice when
 * the photo isn't legible.
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
  try {
    const [extract, coach] = await Promise.all([
      extractTicket({ pcnPhotoDataUrl: body.pcnPhoto }),
      body.skipCoach ? Promise.resolve(null) : coachPhoto({ pcnPhotoDataUrl: body.pcnPhoto }),
    ]);
    return NextResponse.json({
      ticket: extract.ticket,
      confidence: extract.confidence,
      modelUsed: extract.modelUsed,
      costUsd: extract.costUsd,
      coach,
    });
  } catch (err) {
    return NextResponse.json(
      jsonError("AI_ERROR", err instanceof Error ? err.message : "Failed to extract"),
      { status: 500 },
    );
  }
}
