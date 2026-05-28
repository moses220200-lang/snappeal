"use client";

/**
 * ReadingPCNActive — the inline content mounted under the "Reading PCN"
 * lifecycle step while OCR is in flight (kind === "processing" or
 * "scanning"). Four layered surfaces, all owned by this component so
 * the timer + early-issuer pill + inline-form expand don't have to
 * thread through buildLifecycleSteps' args:
 *
 *   1. The uploaded PCN image preview (with a sweeping scanning overlay
 *      while the OCR pass is running).
 *
 *   2. An "Issuer detected" chip — fires the moment Pass 1
 *      (`identifyCouncil` in /api/extract) PATCHes `appeal.ticket.issuer`
 *      onto the row, typically ~1–3 s after upload. This is the
 *      user-visible signal that something has actually been read even
 *      though the full extract is still grinding through.
 *
 *   3. A "Taking longer than usual?" helper card that appears after
 *      `SLOW_OCR_DELAY_MS` of the user sitting on this surface. The
 *      copy frames manual entry as a forward path while leaving OCR
 *      running in the background — the customer is never stuck.
 *
 *   4. (2026-05-27) The inline TicketDetailsForm — same component
 *      PendingReviewCard and ReadingFailureActions mount, expanded
 *      either via the slow-OCR helper's "Enter details manually"
 *      button OR via the `?inputManual=1` URL flag from
 *      /app/scan's "Input manually" tile. Replaces the previous
 *      router.push to /app/manual-entry so all data entry happens
 *      on the smart card. Once the user fills council + PCN ref +
 *      vehicle reg, deriveCardState's `hasAllRequired` early-out
 *      flips the card to pending_review automatically.
 *
 * The 8 s threshold (chosen by the spec) is meaningfully shorter than
 * the typical Pass-2 tail (10–15 s) on purpose: showing the escape
 * hatch slightly BEFORE OCR usually completes gives the customer a
 * pre-emptive option without training them to abandon every run.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Pencil, RefreshCw } from "lucide-react";
import { ScanningOverlay } from "@/components/ScanningOverlay";
import {
  TicketDetailsForm,
  type EditableTicketField,
} from "@/components/ticket/TicketDetailsForm";
import type { AppealRecord } from "@/lib/server/appeals";
import type { OcrHandoff } from "@/lib/client/session";

const SLOW_OCR_DELAY_MS = 8_000;

export function ReadingPCNActive({
  appeal,
  pcnImage,
  showScanOverlay,
  ocrHandoff,
  onAgree,
  onEditField,
  autoExpandForm = false,
}: {
  appeal: AppealRecord;
  /** The PCN data URL / blob URL handed in from the smart card. May be
   *  null on cross-device load (sessionStorage didn't survive) — in
   *  that case we still render the issuer pill + slow-OCR helper so
   *  the user has the same affordances. */
  pcnImage: string | null;
  /** When true, render the diagonal scanning sweep over the image. */
  showScanOverlay: boolean;
  ocrHandoff?: OcrHandoff | null;
  /** Same callback PendingReviewCard.onAgree uses — fires the council
   *  lookup once the three required fields are filled inline. */
  onAgree: () => void;
  /** Debounced PATCH of a single ticket field. */
  onEditField?: (field: EditableTicketField, value: string) => void;
  /** When true, the inline form starts expanded on mount. Driven by
   *  the `?inputManual=1` URL from /app/scan's "Input manually" tile. */
  autoExpandForm?: boolean;
}) {
  const router = useRouter();
  const issuer = appeal.ticket?.issuer;
  const issuerKnown = !!issuer && issuer.trim().length > 0;

  // 8-second slow-OCR timer. We arm it on mount and clear it on
  // unmount. Re-arming when the appeal id changes covers the (rare)
  // case where one mounted instance is reused across two different
  // tickets in the list — without this dep the helper would carry over.
  const [slow, setSlow] = useState(false);
  const armedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (armedForRef.current === appeal.id) return;
    armedForRef.current = appeal.id;
    setSlow(false);
    const t = window.setTimeout(() => setSlow(true), SLOW_OCR_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [appeal.id]);

  // Inline-form expand state. Either auto-true (URL-flagged) or set
  // by tapping the slow-OCR helper's "Enter details manually" button.
  // Once true, the inline form replaces the helper card so the user
  // is editing data, not staring at a helper.
  const [showInlineForm, setShowInlineForm] = useState(autoExpandForm);

  const goManualEntry = () => {
    // 2026-05-27 — no more router.push to /app/manual-entry. The
    // inline form below renders on the SAME card, OCR keeps running
    // in the background, and the user's manual data is protected
    // from being clobbered by a late OCR success via the fill-empty
    // merge in applyOcrFinalIfFresh.
    setShowInlineForm(true);
  };

  const goTryAnotherPhoto = () => {
    // The slow-OCR helper's "Try another photo" routes back to the
    // global scan entry rather than triggering an in-place retry. By
    // the time the user taps it, they've seen the photo on screen for
    // ≥8 s — they want a fresh capture, not a re-pick of the same file.
    // (The in-place retry flow is reserved for the explicit failure
    // surface, where the OCR pipeline has definitively given up.)
    router.push("/app/scan");
  };

  return (
    <div className="flex flex-col gap-3">
      {pcnImage && (
        <div className="relative rounded-2xl overflow-hidden border border-parkingrabbit-border bg-parkingrabbit-bg">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
          <img
            src={pcnImage}
            alt="Your PCN"
            className="w-full h-auto object-contain max-h-64"
          />
          {showScanOverlay && <ScanningOverlay />}
        </div>
      )}

      {issuerKnown && (
        <div className="flex items-start gap-2 rounded-xl bg-parkingrabbit-success/10 border border-parkingrabbit-success/30 px-3 py-2">
          <CheckCircle2
            className="size-4 text-parkingrabbit-success shrink-0 mt-0.5"
            strokeWidth={2.25}
          />
          <div className="flex-1 min-w-0 leading-tight">
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-parkingrabbit-success">
              Issuer detected
            </p>
            <p className="text-[12.5px] font-bold text-parkingrabbit-navy mt-0.5">
              {issuer}
            </p>
          </div>
        </div>
      )}

      {/* Slow-OCR helper — fires at 8 s. Suppressed once the inline
       *  form is expanded (the user has made their choice; the helper
       *  would just clutter the surface). */}
      {slow && !showInlineForm && (
        <div className="rounded-2xl border border-parkingrabbit-border bg-white p-3 flex flex-col gap-2">
          <div>
            <p className="text-[12.5px] font-bold text-parkingrabbit-navy leading-tight">
              Taking longer than usual?
            </p>
            <p className="text-[11.5px] text-parkingrabbit-muted mt-0.5 leading-snug">
              You can enter the details manually — Rabbit will keep
              scanning in the background.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={goManualEntry}
              className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-parkingrabbit-navy text-white font-semibold text-[12px] px-3 py-2 hover:bg-parkingrabbit-navy/90 transition active:scale-[0.99]"
            >
              <Pencil className="size-3.5" strokeWidth={2.25} />
              Enter details manually
            </button>
            <button
              type="button"
              onClick={goTryAnotherPhoto}
              className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white border border-parkingrabbit-border text-parkingrabbit-navy font-semibold text-[12px] px-3 py-2 hover:border-parkingrabbit-primary transition active:scale-[0.99]"
            >
              <RefreshCw className="size-3.5" strokeWidth={2.25} />
              Try another photo
            </button>
          </div>
        </div>
      )}

      {/* Inline editable form. Mounted ON the same card so the user
       *  never leaves the smart ticket. Filling all three required
       *  fields auto-flips the card to pending_review via
       *  deriveCardState's hasAllRequired check; OCR finishing in the
       *  background can only fill empty fields (fill-empty merge in
       *  applyOcrFinalIfFresh), so the user's input is never wiped. */}
      {showInlineForm && (
        <div className="rounded-2xl bg-white border border-parkingrabbit-border p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11.5px] font-bold uppercase tracking-wide text-parkingrabbit-muted">
              Enter details manually
            </p>
            <button
              type="button"
              onClick={() => setShowInlineForm(false)}
              className="text-[11px] text-parkingrabbit-muted hover:text-parkingrabbit-navy transition inline-flex items-center gap-1"
            >
              Hide
              <ChevronDown className="size-3.5 rotate-180" strokeWidth={2.25} />
            </button>
          </div>
          <TicketDetailsForm
            appeal={appeal}
            pcnImage={pcnImage}
            ocrHandoff={ocrHandoff}
            onAgree={onAgree}
            onEditField={onEditField}
            showPhotoCoach={false}
          />
        </div>
      )}
    </div>
  );
}
