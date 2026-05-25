import { NextResponse } from "next/server";
import { z } from "zod";
import {
  GenerateRequest,
  GenerateResponse,
  jsonError,
} from "@/lib/server/contracts";
import { generateDraft } from "@/lib/server/ai";
import {
  attachDraftToAppeal,
  createAppeal,
  getAppealById,
  DatabaseNotConfiguredError,
} from "@/lib/server/appeals";
import { stripe } from "@/lib/server/stripe";
import { env } from "@/lib/server/env";
import { getViewer } from "@/lib/server/viewer";
import { generateSemaphore } from "@/lib/server/concurrency";
import { getCardById } from "@/lib/grounds-catalog";
import { loadKnowledgePack } from "@/lib/server/knowledge";

export const runtime = "nodejs";
/** Vision + drafting can take up to ~90s; bump the function timeout. */
export const maxDuration = 180;

/**
 * POST /api/generate
 *
 * Runs the Claude CLI in headless mode to extract the PCN fields and draft
 * an appeal letter. Persists the result to the appeals table (creating a
 * fresh row when the request doesn't supply an appealId) and returns the
 * appealId + the typed draft.
 *
 * Authorisation: when SNAPPEAL_SKIP_PAYMENT_CHECK is unset, the request
 * must reference a Stripe PaymentIntent that has reached the `succeeded`
 * status. The prototype default skips that check so the demo flow works
 * without a webhook round-trip.
 */
const ExtendedRequest = GenerateRequest.extend({
  /** Optional: re-use an existing appeal row (e.g. user retries generation). */
  appealId: z.string().optional(),
  /** Optional: when set, verified against Stripe before running. */
  paymentIntentId: z.string().optional(),
});

export async function POST(request: Request) {
  let body: z.infer<typeof ExtendedRequest>;
  try {
    body = ExtendedRequest.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      jsonError("BAD_REQUEST", "Invalid generate request body", String(err)),
      { status: 400 },
    );
  }

  if (process.env.SNAPPEAL_SKIP_PAYMENT_CHECK !== "1") {
    if (!body.paymentIntentId) {
      return NextResponse.json(
        jsonError("PAYMENT_REQUIRED", "paymentIntentId required when payment-check is enabled"),
        { status: 402 },
      );
    }
    if (!env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        jsonError("STRIPE_NOT_CONFIGURED", "Stripe is not configured"),
        { status: 503 },
      );
    }
    const intent = await stripe().paymentIntents.retrieve(body.paymentIntentId);
    if (intent.status !== "succeeded") {
      return NextResponse.json(
        jsonError("PAYMENT_NOT_SUCCEEDED", `PaymentIntent status: ${intent.status}`),
        { status: 402 },
      );
    }
  }

  try {
    // Ensure we have an appeal row to attach the draft to.
    let appealId = body.appealId;
    if (appealId) {
      const existing = await getAppealById(appealId);
      if (!existing) {
        return NextResponse.json(
          jsonError("NOT_FOUND", `Appeal ${appealId} not found`),
          { status: 404 },
        );
      }
    } else {
      const viewer = await getViewer();
      const created = await createAppeal({
        sessionId: body.sessionId,
        userId: viewer.userId,
        notes: body.notes ?? null,
      });
      appealId = created.id;
    }

    // Re-read the appeal so the drafter sees the latest notes / grounds
    // / portal lookup, then build the rich context bundle and load the
    // knowledge pack (precedents + code briefs + council brief).
    const appealRow = await getAppealById(appealId);
    const selectedCards = (appealRow?.grounds ?? [])
      .map((id) => getCardById(id))
      .filter((c): c is NonNullable<ReturnType<typeof getCardById>> => !!c)
      .map((c) => ({
        id: c.id,
        label: c.label,
        promptHook: c.promptHook,
        weight: c.weight,
      }));
    const knowledgePack = await loadKnowledgePack({
      groundIds: appealRow?.grounds ?? [],
      contraventionCode:
        appealRow?.portalLookup?.metadata?.contraventionCode ??
        appealRow?.ticket?.contraventionCode,
      councilSlug:
        appealRow?.councilSlug ?? appealRow?.ticket?.councilSlug ?? undefined,
    });

    // Fall back to the appeal row's stored ticket when the client didn't
    // send one — keeps retries from a fresh tab working without forcing
    // a re-upload of the PCN photo.
    const confirmedTicket = body.confirmedTicket ?? appealRow?.ticket ?? undefined;

    // Cap concurrent Claude CLI subprocesses so a burst of users doesn't
    // exhaust the host. Excess requests queue here and run FIFO.
    const release = await generateSemaphore.acquire();
    let draft;
    try {
      draft = await generateDraft({
        pcnPhotoDataUrl: body.pcnPhoto,
        evidencePhotoDataUrls: body.evidencePhotos,
        notes: appealRow?.notes ?? body.notes,
        confirmedTicket,
        selectedCards,
        portalMetadata: appealRow?.portalLookup?.metadata,
        knowledgePack,
      });
    } finally {
      release();
    }

    const updated = await attachDraftToAppeal(appealId, draft, {
      usedIds: knowledgePack.usedIds,
      tokens: knowledgePack.approxTokens,
    });

    const response: GenerateResponse & { appealId: string } = {
      appealId: updated.id,
      ticket: draft.ticket,
      groundIds: draft.groundIds,
      letter: draft.letter,
      strength: draft.strength,
      modelUsed: draft.modelUsed,
      generatedAt: new Date().toISOString(),
    };
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(jsonError("DATABASE_NOT_CONFIGURED", err.message), { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Failed to generate appeal";
    return NextResponse.json(jsonError("AI_ERROR", message), { status: 500 });
  }
}
