import { NextResponse } from "next/server";
import { z } from "zod";
import { extractTicket, identifyCouncil } from "@/lib/server/ai";
import {
  mergeDuplicateDraftIfAny,
  patchAppealDraft,
  setProcessingStep,
} from "@/lib/server/appeals";
import { jsonError } from "@/lib/server/contracts";
import { recordAiCall, classifyAiError } from "@/lib/server/aiCalls";

export const runtime = "nodejs";
export const maxDuration = 90;

const Body = z.object({
  sessionId: z.string().min(1).max(128),
  pcnPhoto: z.string().min(1).startsWith("data:image/"),
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
 * photo via Claude CLI in a single combined call that returns BOTH
 * per-field extraction + a photo-coach verdict (legibility + retake
 * advice). v0.3.10 merged the formerly-separate `coachPhoto` call into
 * this one — same model, same image, one inference round, ~halved cost.
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
    // v0.3.6 — two-pass OCR for early council reveal.
    //
    //   Pass 1 (this block): fast council-only Claude call. Identifies
    //   the issuer + slug from the logo/header and PATCHes the appeal
    //   row mid-request. The smart card's polling loop picks this up
    //   within ~2.5s, the IssuerLogoReel sees `appeal.councilSlug` set
    //   and lands on the correct logo while the full extract is still
    //   running. ~1-3s in practice, small prompt.
    //
    //   Pass 2 (below): the full extract — pcnRef, vehicleReg, amount,
    //   date, contravention. Replaces the partial ticket from pass 1
    //   with the complete one when it returns.
    //
    // Pass 1 is best-effort; if it errors we just skip the early
    // landing — the full extract still runs and the reel lands later.
    if (body.appealId) {
      const t0 = Date.now();
      try {
        const council = await identifyCouncil({ pcnPhotoDataUrl: body.pcnPhoto });
        void recordAiCall({
          appealId: body.appealId,
          stage: "council_id",
          model: council.modelUsed,
          costUsd: council.costUsd,
          durationMs: Date.now() - t0,
          ok: true,
        });
        if (council.councilSlug && council.confidence >= 0.4) {
          await patchAppealDraft(body.appealId, {
            ticket: {
              councilSlug: council.councilSlug,
              ...(council.issuer ? { issuer: council.issuer } : {}),
            },
          }).catch(() => null);
        }
      } catch (err) {
        // Non-fatal — full extract below will still set the council.
        void recordAiCall({
          appealId: body.appealId,
          stage: "council_id",
          model: "(failed-before-response)",
          costUsd: null,
          durationMs: Date.now() - t0,
          ok: false,
          errorKind: classifyAiError(err),
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const ocrStart = Date.now();
    const extract = await extractTicket({ pcnPhotoDataUrl: body.pcnPhoto });
    // The combined call returns the coach verdict inline — we surface it
    // alongside the ticket so the photo-coach card on failure surfaces
    // still has its advice copy. The separate `coach` `ai_calls` row is
    // gone because there's no longer a separate Claude invocation to
    // attribute cost to.
    const coach = extract.coach;
    if (body.appealId) {
      void recordAiCall({
        appealId: body.appealId,
        stage: "ocr",
        model: extract.modelUsed,
        costUsd: extract.costUsd,
        durationMs: Date.now() - ocrStart,
        ok: true,
      });
    }

    // Progressive write: persist OCR result + mark step done. Done in
    // parallel so the request returns fast. The full ticket replaces
    // the partial council-only ticket persisted by pass 1.
    let mergedInto: string | null = null;
    if (body.appealId) {
      await Promise.all([
        patchAppealDraft(body.appealId, { ticket: extract.ticket }).catch(() => null),
        setProcessingStep(body.appealId, "ocr", "done"),
      ]);

      // Post-OCR dedup: this is the first moment we know (pcnRef,
      // vehicleReg). If the same viewer already owns an older draft
      // for the same ticket, collapse onto it so the user doesn't end
      // up with two cards for one ticket — the client can't dedupe at
      // upload time because the photo bytes alone don't tell it which
      // PCN they show. See `mergeDuplicateDraftIfAny` for the full
      // eligibility gates. Best-effort: failure here doesn't fail the
      // extract response (the duplicate row is still usable, just
      // duplicated).
      try {
        const merge = await mergeDuplicateDraftIfAny(body.appealId);
        if (merge) mergedInto = merge.mergedInto;
      } catch {
        /* swallow — dedup is opportunistic, not load-bearing */
      }

      // NOTE: we do NOT auto-fire the council-portal lookup here.
      // OCR can misread the PCN ref or VRM (especially blurry photos
      // or handwritten plates) — firing the MCP lookup on bad data
      // burns ~$0.30 + ~60s for a guaranteed `not_found`. Instead the
      // customer confirms PCN ref + VRM on the pending_review card,
      // then taps "Confirm & validate" which kicks the lookup via
      // /api/appeals/[id]/lookup. Two-pass cost economics:
      //
      //   council_id (~$0.04) — locks the logo on the card while
      //                          the user is still uploading
      //   ocr (~$0.05)         — extracts pcnRef + VRM + amount + date
      //   user confirms        — fixes any misreads
      //   pcn_lookup (~$0.30) — fires ONLY against verified data
      //
      // Net saving: when OCR misreads (~5% of uploads in our
      // sample), we avoid a wasted ~$0.30 MCP run.
    }

    return NextResponse.json({
      ticket: extract.ticket,
      confidence: extract.confidence,
      modelUsed: extract.modelUsed,
      costUsd: extract.costUsd,
      coach,
      // When the post-OCR dedup folded this upload into an older draft,
      // the client should swap its `currentAppealId` to the surviving
      // row before its next API call.
      mergedInto,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to extract";
    if (body.appealId) {
      void setProcessingStep(body.appealId, "ocr", "failed", message).catch(() => {});
    }
    return NextResponse.json(jsonError("AI_ERROR", message), { status: 500 });
  }
}
