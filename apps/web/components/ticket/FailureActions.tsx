"use client";

/**
 * Failure-card action surfaces — what we show under the headline copy on
 * the five failure CardKinds:
 *
 *   - `image_issue`         → "upload a clear photo …"
 *   - `image_unclear`       → "retake the photo …"
 *   - `extraction_failed`   → "try again / upload another / enter manually"
 *   - `council_lookup_failed` → "Continue anyway" override
 *
 * The first three share `ReadingFailureActions` because they all resolve
 * via going back to the capture / manual-entry path; the council-lookup
 * failure has a different affordance (override + carry on).
 *
 * Behaviour the user spec'd:
 *   • "Retake photo" opens the device camera (no page reload / nav).
 *   • "Choose another photo" opens a FRESH file picker — the previous
 *     File is cleared before the click so picking the same image still
 *     fires the onChange handler.
 *   • Neither button reruns OCR against the stale image. The new file is
 *     handed to `retryOcrWithPhoto(appealId, dataUrl)` which PATCHes
 *     the existing appeal row + re-fires /api/extract.
 *   • "Enter details manually" expands the editable form INLINE on the
 *     same card (2026-05-27 refactor) — no more router.push to
 *     /app/manual-entry, which was a duplicate of the form already on
 *     the smart ticket. Once the three required fields (council + PCN
 *     ref + vehicle reg) land via PATCH, deriveCardState's
 *     `hasAllRequired` early-out auto-flips the card from the failure
 *     surface to pending_review, so the user gets a single continuous
 *     surface across the recovery path.
 *
 * Copy depends on whether Pass 1 (council detection) succeeded:
 *   • Issuer known → "Couldn't read all details" / "Finish this ticket"
 *   • Issuer unknown → fall back to the per-kind body the old surface
 *     used (image_issue / image_unclear / extraction_failed).
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ChevronDown, Images, Loader2, Pencil, RefreshCw } from "lucide-react";
import type { CardKind } from "@/lib/deriveCardState";
import type { AppealRecord } from "@/lib/server/appeals";
import type { OcrHandoff } from "@/lib/client/session";
import { readFileAsDataUrl, retryOcrWithPhoto } from "@/lib/client/uploadPcn";
import {
  TicketDetailsForm,
  type EditableTicketField,
} from "@/components/ticket/TicketDetailsForm";
import { Field } from "./Field";

export function ReadingFailureActions({
  kind,
  appeal,
  issuer,
  pcnImage,
  ocrHandoff,
  onAgree,
  onEditField,
  /** When true, the inline form auto-expands on mount. Used by the
   *  no-photo entry flow (/app/scan "Input manually" → /app/tickets
   *  with `?inputManual=1`) so the user lands directly on a ready
   *  editable surface without an extra tap. */
  autoExpandForm = false,
}: {
  kind: CardKind;
  /** The full appeal record — needed by the inline TicketDetailsForm
   *  to read pre-filled ticket values (issuer / pcnRef / vehicleReg
   *  from Pass 1 of OCR) so the user picks up where OCR left off. */
  appeal: AppealRecord;
  /** Issuer name that Pass 1 (`identifyCouncil`) extracted before the
   *  full OCR pass failed. When set, the surface uses the softer
   *  "Couldn't read all details" copy because we know the photo IS a
   *  PCN — we just couldn't pull the PCN ref / vehicle reg confidently. */
  issuer?: string | null;
  /** PCN photo URL — surfaced at the top of the inline form so the
   *  user sees what they uploaded while editing the fields. */
  pcnImage?: string | null;
  ocrHandoff?: OcrHandoff | null;
  /** Same callback as PendingReviewCard.onAgree — fires the council
   *  lookup once the three required fields are filled. */
  onAgree: () => void;
  /** Same debounced PATCH handler as PendingReviewCard.onEditField. */
  onEditField?: (field: EditableTicketField, value: string) => void;
  autoExpandForm?: boolean;
}) {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  // Locks the buttons while a retry upload is in flight so the user
  // can't fire a second OCR pass on top of the first.
  const [busy, setBusy] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  // 2026-05-27 — inline form replaces the /app/manual-entry navigation.
  // Local toggle so the form expands directly under the recovery
  // buttons on the same card; the previous off-card page is now gone.
  const [showInlineForm, setShowInlineForm] = useState(autoExpandForm);

  const appealId = appeal.id;
  const issuerKnown = !!issuer && issuer.trim().length > 0;

  // Per-kind body copy used when Pass 1 didn't capture the issuer
  // (= the photo may not be a PCN at all, or the logo wasn't legible).
  const fallbackBody =
    kind === "image_issue"
      ? "Please upload a clear photo of the Penalty Charge Notice, including the PCN number and vehicle registration."
      : kind === "image_unclear"
        ? "Please retake the photo in good light and make sure the whole notice is visible."
        : "Please try again, upload another photo, or enter the details manually.";

  // The issuer-known surface borrows the user-spec'd "Finish this ticket"
  // framing: we trust the data Pass 1 captured and offer manual entry
  // as the fastest path, with retake / choose another as backups.
  const heading = issuerKnown ? "Finish this ticket" : null;
  const body = issuerKnown
    ? "Enter the PCN reference and vehicle registration manually, or try a clearer photo."
    : fallbackBody;

  const handleToggleInlineForm = () => {
    if (busy) return;
    setShowInlineForm((open) => !open);
  };

  const handleRetake = () => {
    if (busy) return;
    if (!appealId) {
      router.push("/app/scan");
      return;
    }
    const el = cameraInputRef.current;
    if (!el) return;
    // CRITICAL: clear input.value BEFORE click so the same path can be
    // picked twice in a row — closes the "rerun OCR on stale image"
    // bug from the previous spec.
    el.value = "";
    el.click();
  };

  const handleChooseAnother = () => {
    if (busy) return;
    if (!appealId) {
      router.push("/app/scan?source=library");
      return;
    }
    const el = galleryInputRef.current;
    if (!el) return;
    el.value = "";
    el.click();
  };

  const handlePickedFile = async (file: File | undefined) => {
    if (!file || !appealId) return;
    if (busy) return;
    setBusy(true);
    setRetryError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await retryOcrWithPhoto(appealId, dataUrl);
    } catch (err) {
      setRetryError(
        err instanceof Error ? err.message : "Couldn't start the new scan.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {heading && (
        <p className="text-[12.5px] font-bold text-amber-900 leading-tight">
          {heading}
        </p>
      )}
      <p className="text-[12px] text-amber-900/90 leading-snug">{body}</p>

      <div className="flex flex-col gap-2 mt-1">
        {/* Primary recovery — expand the inline form on the same card.
         *  The button label flips on toggle so the affordance state is
         *  always visible (no hidden disclosure pattern). */}
        <button
          type="button"
          onClick={handleToggleInlineForm}
          disabled={busy}
          aria-expanded={showInlineForm}
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-parkingrabbit-navy text-white font-semibold text-[12.5px] px-4 py-2.5 hover:bg-parkingrabbit-navy/90 transition disabled:opacity-60 active:scale-[0.99]"
        >
          {showInlineForm ? (
            <>
              <ChevronDown className="size-3.5 rotate-180" strokeWidth={2.25} />
              Hide manual entry
            </>
          ) : (
            <>
              <Pencil className="size-3.5" strokeWidth={2.25} />
              Enter details manually
            </>
          )}
        </button>

        {/* Secondary recovery — re-try with a different image. Both
         *  buttons run via the SAME retry pipeline (PATCH new photo
         *  onto this row + re-fire /api/extract); the only difference
         *  is which hidden input they trigger (camera vs gallery). */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleRetake}
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white border border-parkingrabbit-border text-parkingrabbit-navy font-semibold text-[12.5px] px-3 py-2.5 hover:border-parkingrabbit-primary transition disabled:opacity-60 active:scale-[0.99]"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
            ) : (
              <Camera className="size-3.5" strokeWidth={2.25} />
            )}
            Retake photo
          </button>
          <button
            type="button"
            onClick={handleChooseAnother}
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white border border-parkingrabbit-border text-parkingrabbit-navy font-semibold text-[12.5px] px-3 py-2.5 hover:border-parkingrabbit-primary transition disabled:opacity-60 active:scale-[0.99]"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
            ) : (
              <Images className="size-3.5" strokeWidth={2.25} />
            )}
            Choose another photo
          </button>
        </div>

        {retryError && (
          <p className="text-[11.5px] text-red-700 leading-snug mt-1">
            {retryError}
          </p>
        )}
      </div>

      {/* Inline TicketDetailsForm — same component PendingReviewCard
       *  mounts, so the editable surface is identical across recovery
       *  paths. Once the user fills council + PCN ref + vehicle reg,
       *  deriveCardState's hasAllRequired check fires and the card
       *  flips to pending_review (this failure surface unmounts, the
       *  pending_review surface mounts with the SAME form). No
       *  navigation. */}
      {showInlineForm && (
        <div className="mt-2 rounded-2xl bg-white border border-parkingrabbit-border p-3">
          <TicketDetailsForm
            appeal={appeal}
            pcnImage={pcnImage ?? null}
            ocrHandoff={ocrHandoff}
            onAgree={onAgree}
            onEditField={onEditField}
            // The surrounding amber failure box already explains the
            // photo problem in its own copy — suppress the form's
            // own photo-coach hint to avoid double messaging.
            showPhotoCoach={false}
            busy={busy}
          />
        </div>
      )}

      {/* Hidden file inputs — owned by this component so the failure
       *  card is the single source of truth for retry. Both fire the
       *  same handler; the only difference is `capture="environment"`
       *  on the camera input which opens the device camera directly
       *  on mobile (Android/iOS). The gallery input omits `capture`
       *  so the OS picker offers library + files. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          void handlePickedFile(f);
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          void handlePickedFile(f);
        }}
      />
    </div>
  );
}

export function CouncilFailureActions({
  onOverrideLookup,
}: {
  onOverrideLookup: () => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[12px] text-amber-900/90 leading-snug">
        You can still continue, but please review the details carefully.
      </p>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onOverrideLookup}
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-parkingrabbit-navy text-white font-semibold text-[12.5px] px-4 py-2.5 hover:bg-parkingrabbit-navy/90 transition"
        >
          <RefreshCw className="size-3.5" strokeWidth={2.25} />
          Continue anyway
        </button>
      </div>
    </div>
  );
}

/** "Council confirms" extracted block — the grid of fields the council
 *  returned during the lookup. Each row uses `<Field>` for consistent
 *  label + value rendering. */
export function ExtractedStream({
  extracted,
}: {
  extracted: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-parkingrabbit-success">
        Council confirms
      </p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
        {Object.entries(extracted).map(([field, value]) => (
          <Field key={field} label={field} value={value} />
        ))}
      </dl>
    </div>
  );
}
