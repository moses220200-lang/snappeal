import { NextResponse } from "next/server";
import {
  GenerateRequest,
  GenerateResponse,
  jsonError,
} from "@/lib/server/contracts";
import { generateDraft } from "@/lib/server/ai";
import { env } from "@/lib/server/env";

export const runtime = "nodejs";
/** Vision + drafting can take up to ~30s; bump the function timeout. */
export const maxDuration = 60;

/**
 * POST /api/generate
 *
 * Single Claude vision call via Vercel AI Gateway: extracts the ticket
 * fields from the PCN photo, identifies the strongest grounds, and drafts
 * the appeal letter — all in one structured response.
 *
 * Authorisation: this endpoint should only be hit AFTER a successful
 * Stripe payment. v0.1 trusts the client to call it post-payment; v0.2
 * gates it on a server-side payment-intent status check (a TODO at the
 * bottom of this file).
 */
export async function POST(request: Request) {
  let body: GenerateRequest;
  try {
    const json = await request.json();
    body = GenerateRequest.parse(json);
  } catch (err) {
    return NextResponse.json(
      jsonError("BAD_REQUEST", "Invalid generate request body", String(err)),
      { status: 400 },
    );
  }

  try {
    const draft = await generateDraft({
      pcnPhotoDataUrl: body.pcnPhoto,
      evidencePhotoDataUrls: body.evidencePhotos,
      notes: body.notes,
    });

    const response: GenerateResponse = {
      ticket: draft.ticket,
      groundIds: draft.groundIds,
      letter: draft.letter,
      modelUsed: env.AI_MODEL_ID,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate appeal";
    return NextResponse.json(jsonError("AI_ERROR", message), { status: 500 });
  }
}

// TODO (v0.2):
//   1. Require `paymentIntentId` in the request body.
//   2. Verify `paymentIntent.status === "succeeded"` via Stripe before
//      running the AI call — defeats the "skip pay + call generate" abuse.
//   3. Persist the draft to Postgres against the appeal record.
//   4. Stream tokens to the client (replace generateObject → streamObject).
