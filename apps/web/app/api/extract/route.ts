import { NextResponse } from "next/server";
import { z } from "zod";
import { coachPhoto, extractTicket, identifyCouncil } from "@/lib/server/ai";
import {
  applyOcrFinalIfFresh,
  applyOcrPartialIfFresh,
  dedupAsCrossUserViewer,
  mergeDuplicateDraftIfAny,
  startOcrRun,
} from "@/lib/server/appeals";
import { findCanonicalTicket, logAudit } from "@/lib/server/tickets";
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
  //
  // v0.3.x — `startOcrRun()` stamps a unique runId onto the row at the
  // same time. Every subsequent partial / final write goes through the
  // `*IfFresh` helpers which re-read the row's current runId and bail
  // when it no longer matches (a newer upload has superseded this one).
  // This is the load-bearing race guard for the spec's
  //   "A late successful OCR result cannot be overwritten by an older
  //    failure/timeout. A late failure result cannot overwrite an
  //    already successful extraction."
  // acceptance criteria.
  let runId: string | null = null;
  if (body.appealId) {
    try {
      runId = await startOcrRun(body.appealId);
    } catch {
      // Fall back to a no-runId path. Without a runId we lose the race
      // guard for THIS run, but the route still works — older runs'
      // checks compare against undefined and bail.
    }
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
    //   date, contravention. Fills only the fields Pass 1 didn't
    //   already set — see `applyOcrFinalIfFresh`'s "fill empty only"
    //   merge rule, which also protects manual-entry data from being
    //   clobbered by a delayed OCR success.
    //
    // Pass 1 is best-effort; if it errors we just skip the early
    // landing — the full extract still runs and the reel lands later.
    // 2026-05-27 — Pass 1 also returns pcnRef + vehicleReg now, so we
    // can short-circuit the expensive Pass 2 + photo-coach calls when
    // a fresh canonical row already exists for this PCN. Saves the
    // full extract cost (~$0.05–0.10) + ~20–25 s wall-clock per
    // duplicate upload.
    let pass1: Awaited<ReturnType<typeof identifyCouncil>> | null = null;
    if (body.appealId && runId) {
      const t0 = Date.now();
      try {
        pass1 = await identifyCouncil({ pcnPhotoDataUrl: body.pcnPhoto });
        void recordAiCall({
          appealId: body.appealId,
          stage: "pcn_identify",
          model: pass1.modelUsed,
          costUsd: pass1.costUsd,
          durationMs: Date.now() - t0,
          ok: true,
        });
        if (pass1.councilSlug && pass1.confidence >= 0.4) {
          await applyOcrPartialIfFresh(body.appealId, runId, {
            councilSlug: pass1.councilSlug,
            issuer: pass1.issuer ?? null,
          });
        }
      } catch (err) {
        // Non-fatal — full extract below will still set the council.
        void recordAiCall({
          appealId: body.appealId,
          stage: "pcn_identify",
          model: "(failed-before-response)",
          costUsd: null,
          durationMs: Date.now() - t0,
          ok: false,
          errorKind: classifyAiError(err),
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 2026-05-27 — Pass 2 short-circuit on fresh canonical hit.
    //
    // If Pass 1 read enough to identify a SPECIFIC PCN (council +
    // pcnRef) AND the canonical row exists AND its portal snapshot
    // is still fresh, we have everything we need: the canonical row
    // already carries the OCR-derived fields (issuer / vehicle reg /
    // contravention / issued date / location / amount) AND the
    // portal snapshot. Skip the full Pass 2 extract + photo-coach
    // entirely — the user gets pending_review in ~3 s instead of
    // ~25 s, and we save ~$0.10 per duplicate upload.
    //
    // Falls through to Pass 2 + coach when:
    //   • Pass 1 failed (pass1 === null), OR
    //   • Pass 1 couldn't read the PCN ref (pcnRef === ""), OR
    //   • No canonical row exists for (council, pcnRef), OR
    //   • The canonical snapshot is stale (lookup needs to re-run).
    if (
      body.appealId &&
      runId &&
      pass1 &&
      pass1.councilSlug &&
      pass1.pcnRef &&
      pass1.pcnRef.trim().length > 0
    ) {
      try {
        const canonical = await findCanonicalTicket(
          pass1.councilSlug,
          pass1.pcnRef,
        );
        if (canonical) {
          // 2026-05-27 — "one appeals row per canonical PCN".
          // Before any Pass 2 work, check whether an OTHER user
          // already owns an appeals row for this canonical ticket.
          // If yes, link the current user as a viewer and DELETE
          // their just-created appeals row — no duplicate rows in
          // the appeals table, the new user shows up in the
          // shared-viewer list for the owner's appeal instead.
          const dedup = await dedupAsCrossUserViewer(
            body.appealId,
            canonical.ticketId,
          ).catch(() => null);
          if (dedup) {
            logAudit(
              "cache_hit",
              {
                ticketId: canonical.ticketId,
                appealId: body.appealId,
              },
              {
                event: "extract_cross_user_dedup",
                mergedInto: dedup.mergedInto,
              },
            );
            return NextResponse.json({
              // No ticket payload — the new row is GONE; the client
              // re-points at the owner appeal via `mergedInto`.
              ticket: null,
              modelUsed: pass1.modelUsed,
              costUsd: pass1.costUsd,
              coach: {
                legible: true,
                quality: "good" as const,
                issues: [],
                advice: "",
              },
              mergedInto: dedup.mergedInto,
              wroteOcr: false,
              canonicalReuse: true,
              canonicalTicketId: canonical.ticketId,
              shortCircuit: true,
              crossUserDedup: true,
            });
          }

          // Same-user (or no owner yet) — fall through to the
          // canonical short-circuit if the snapshot is fresh.
          // Only short-circuit when both the canonical metadata
          // AND its portal snapshot are fresh. A stale snapshot
          // means the lookup will need to re-run anyway, so we may
          // as well let Pass 2 give the user any extra fields it
          // might catch.
          if (canonical.snapshotFresh) {
            await applyOcrFinalIfFresh(body.appealId, runId, {
              ok: true,
              ticket: {
                issuer: canonical.issuer ?? "",
                councilSlug: pass1.councilSlug,
                pcnRef: pass1.pcnRef,
                vehicleReg: canonical.vehicleReg,
                contraventionCode: canonical.contraventionCode ?? "",
                contraventionDescription:
                  canonical.contraventionDescription ?? "",
                issuedAt: canonical.issuedAt ?? "",
                location: canonical.location ?? "",
                amountPence: canonical.amountPence ?? 0,
              },
            });
            logAudit(
              "cache_hit",
              {
                ticketId: canonical.ticketId,
                appealId: body.appealId,
              },
              {
                event: "extract_canonical_short_circuit",
                skipped: ["pass2", "coach"],
              },
            );
            return NextResponse.json({
              ticket: {
                issuer: canonical.issuer ?? "",
                councilSlug: pass1.councilSlug,
                pcnRef: pass1.pcnRef,
                vehicleReg: canonical.vehicleReg,
                contraventionCode: canonical.contraventionCode ?? "",
                contraventionDescription:
                  canonical.contraventionDescription ?? "",
                issuedAt: canonical.issuedAt ?? "",
                location: canonical.location ?? "",
                amountPence: canonical.amountPence ?? 0,
              },
              modelUsed: pass1.modelUsed,
              costUsd: pass1.costUsd,
              coach: {
                legible: true,
                quality: "good" as const,
                issues: [],
                advice: "",
              },
              mergedInto: null,
              wroteOcr: true,
              canonicalReuse: true,
              canonicalTicketId: canonical.ticketId,
              shortCircuit: true,
            });
          }
        }
      } catch {
        /* canonical lookup is opportunistic — fall through to Pass 2 */
      }
    }

    // 2026-05-27 — extract + photo-coach run in PARALLEL. They were
    // merged into a single Sonnet vision call to halve cost, but the
    // combined output schema bloated to ~500 tokens making generation
    // a serial 50 s+ slog. Splitting + running in parallel cuts
    // wall-clock latency to max(extract, coach) ≈ 25 s for the same
    // total work. Extract is on Haiku (faster); coach stays on Sonnet
    // (the legibility judgement benefits from depth).
    const ocrStart = Date.now();
    const coachStart = Date.now();
    const [extract, coachResult] = await Promise.all([
      extractTicket({ pcnPhotoDataUrl: body.pcnPhoto }),
      coachPhoto({ pcnPhotoDataUrl: body.pcnPhoto }).catch((err) => {
        // Coach is non-load-bearing — if it errors we surface a
        // neutral "good, no advice" verdict so the user still sees
        // the ticket flow through.
        if (body.appealId) {
          void recordAiCall({
            appealId: body.appealId,
            stage: "photo_check",
            model: "(failed-before-response)",
            costUsd: null,
            durationMs: Date.now() - coachStart,
            ok: false,
            errorKind: classifyAiError(err),
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        }
        return {
          coach: {
            legible: true,
            quality: "good" as const,
            issues: [],
            advice: "",
          },
          modelUsed: "(coach-failed)",
          costUsd: null as number | null,
        };
      }),
    ]);
    const coach = coachResult.coach;
    if (body.appealId) {
      void recordAiCall({
        appealId: body.appealId,
        stage: "pcn_extract",
        model: extract.modelUsed,
        costUsd: extract.costUsd,
        durationMs: Date.now() - ocrStart,
        ok: true,
      });
      if (coachResult.modelUsed !== "(coach-failed)") {
        void recordAiCall({
          appealId: body.appealId,
          stage: "photo_check",
          model: coachResult.modelUsed,
          costUsd: coachResult.costUsd,
          durationMs: Date.now() - coachStart,
          ok: true,
        });
      }
    }

    // 2026-05-27 — Phase 2 of the ticket-normalisation rollout:
    // cross-user canonical reuse.
    //
    // Before committing Pass 2's own extract, look up the canonical
    // `tickets` row for the (councilSlug, pcnRef) pair we just
    // identified. If another user has already canonicalised this
    // physical PCN, the canonical row carries known-good OCR data
    // (issuer / vehicle reg / contravention / issued date / location
    // / amount) — typically more reliable than Pass 2's read of THIS
    // user's possibly-worse photo. We pre-merge the canonical
    // metadata onto the extracted ticket so the applyOcrFinalIfFresh
    // fill-empty write lays down canonical-where-possible, Pass-2-
    // where-canonical-is-missing.
    //
    // This is best-effort: any failure here falls through to a
    // plain Pass 2 commit. The cross-user portal-snapshot reuse
    // (the actual cost-saving leg) is independent — it's already
    // wired via getCachedSnapshot in enqueueLookupIfAutomated.
    let canonicalHit = false;
    let canonicalTicketId: string | null = null;
    const finalTicket = { ...extract.ticket } as typeof extract.ticket;
    if (
      body.appealId &&
      runId &&
      extract.ticket.councilSlug &&
      extract.ticket.pcnRef
    ) {
      try {
        const canonical = await findCanonicalTicket(
          extract.ticket.councilSlug,
          extract.ticket.pcnRef,
        );
        if (canonical) {
          canonicalHit = true;
          canonicalTicketId = canonical.ticketId;
          // Overlay canonical fields onto Pass 2's output. The merge
          // semantics: canonical wins WHERE canonical has a real
          // value, Pass 2 wins WHERE canonical is null. This way
          // the row inherits whatever the previous user's authoritative
          // run captured, with no regression for fields the canonical
          // row never knew (e.g. amount may be null on canonical if
          // OCR missed it the first time but Pass 2 caught it now).
          if (canonical.issuer) finalTicket.issuer = canonical.issuer;
          if (canonical.contraventionCode)
            finalTicket.contraventionCode = canonical.contraventionCode;
          if (canonical.contraventionDescription)
            finalTicket.contraventionDescription =
              canonical.contraventionDescription;
          if (canonical.issuedAt) finalTicket.issuedAt = canonical.issuedAt;
          if (canonical.location) finalTicket.location = canonical.location;
          if (typeof canonical.amountPence === "number")
            finalTicket.amountPence = canonical.amountPence;
          // Audit so we can track how often canonical reuse fires
          // (cache savings tracking). Fire-and-forget.
          logAudit(
            "cache_hit",
            { ticketId: canonical.ticketId, appealId: body.appealId },
            {
              event: "extract_canonical_reuse",
              snapshotFresh: canonical.snapshotFresh,
            },
          );
        }
      } catch {
        /* canonical lookup is opportunistic — fall through to Pass 2 only */
      }
    }

    // Progressive write: persist OCR result + mark step done in one
    // atomic-ish helper. `applyOcrFinalIfFresh` re-checks the row's
    // runId before writing; if a newer upload has taken over since we
    // started, both the ticket write AND the status flip silently
    // skip — protecting the newer run's in-flight or already-landed
    // state.
    let mergedInto: string | null = null;
    let wroteOcr = false;
    if (body.appealId && runId) {
      wroteOcr = await applyOcrFinalIfFresh(body.appealId, runId, {
        ok: true,
        ticket: finalTicket,
      });

      // Post-OCR dedup: this is the first moment we know (pcnRef,
      // vehicleReg). If the same viewer already owns an older draft
      // for the same ticket, collapse onto it so the user doesn't end
      // up with two cards for one ticket — the client can't dedupe at
      // upload time because the photo bytes alone don't tell it which
      // PCN they show. We only run dedup when WE were the run that
      // committed (wroteOcr === true) — a stale run shouldn't be
      // making dedup decisions on top of newer data.
      if (wroteOcr) {
        try {
          const merge = await mergeDuplicateDraftIfAny(body.appealId);
          if (merge) mergedInto = merge.mergedInto;
        } catch {
          /* swallow — dedup is opportunistic, not load-bearing */
        }
      }

      // NOTE: we do NOT auto-fire the council-portal lookup here.
      // OCR can misread the PCN ref or VRM (especially blurry photos
      // or handwritten plates) — firing the MCP lookup on bad data
      // burns ~$0.30 + ~60s for a guaranteed `not_found`. Instead the
      // customer confirms PCN ref + VRM on the pending_review card,
      // then taps "Confirm & validate" which kicks the lookup via
      // /api/appeals/[id]/lookup.
    }

    return NextResponse.json({
      // The MERGED ticket (canonical-overlay-on-Pass-2) — same shape
      // the client reads back from the PATCHed appeal row. The
      // per-field confidence block was removed from the extract
      // schema in 2026-05-27 (no UI consumer remained); the
      // photo-coach verdict is now produced by a parallel Sonnet
      // call (see coachPhoto in lib/server/ai.ts).
      ticket: finalTicket,
      modelUsed: extract.modelUsed,
      costUsd: extract.costUsd,
      coach,
      // When the post-OCR dedup folded this upload into an older draft,
      // the client should swap its `currentAppealId` to the surviving
      // row before its next API call.
      mergedInto,
      // Optional debug signal — when false, a newer run won the race
      // and our writes were silently skipped. Useful for log tracing.
      wroteOcr,
      // 2026-05-27 — Phase 2 visibility: true when this Pass 2 was
      // overlaid by canonical data from a previous user's same-PCN
      // upload. Surfaces in admin telemetry; UI doesn't render it.
      canonicalReuse: canonicalHit,
      canonicalTicketId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to extract";
    if (body.appealId && runId) {
      // Run-gated failure write — won't clobber a newer run that has
      // landed in the meantime (the runId check inside
      // applyOcrFinalIfFresh prevents that).
      void applyOcrFinalIfFresh(body.appealId, runId, {
        ok: false,
        error: message,
      }).catch(() => {});
    }
    return NextResponse.json(jsonError("AI_ERROR", message), { status: 500 });
  }
}
