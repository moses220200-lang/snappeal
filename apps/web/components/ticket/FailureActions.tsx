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
 * The first three share `renderReadingFailureActions` because they all
 * resolve via going back to the capture / manual-entry path; the
 * council-lookup failure has a different affordance (override + carry on).
 *
 * Extracted out of TicketCard.tsx — pure presentational; only side-effect
 * is the override callback on the council failure variant.
 */
import Link from "next/link";
import { Camera, Images, Pencil, RefreshCw } from "lucide-react";
import type { CardKind } from "@/lib/deriveCardState";
import { Field } from "./Field";

export function ReadingFailureActions({
  kind,
  appealId,
}: {
  kind: CardKind;
  /** When this failure is attached to a specific appeal row, forward
   *  the id to `/app/manual-entry` so the manual-entry form can
   *  prefill whatever OCR DID manage to read (issuer, partial pcnRef,
   *  vehicleReg, etc.) — the customer fills the gaps instead of
   *  re-typing everything. */
  appealId?: string;
}) {
  const body =
    kind === "image_issue"
      ? "Please upload a clear photo of the Penalty Charge Notice, including the PCN number, issuer, date, amount, and vehicle registration."
      : kind === "image_unclear"
        ? "Please retake the photo in good light and make sure the whole notice is visible."
        : "Please try again, upload another photo, or enter the details manually.";
  const manualHref = appealId
    ? `/app/manual-entry?appealId=${encodeURIComponent(appealId)}`
    : "/app/manual-entry";
  // Offer manual entry on every failure surface — the copy on the
  // `extraction_failed` branch explicitly promises it, and on the
  // photo-quality branches it's still the right last-resort affordance
  // when the camera path keeps producing unreadable photos.
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[12px] text-amber-900/90 leading-snug">{body}</p>
      <div className="flex flex-col gap-2">
        <Link
          href="/app/capture"
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-parkingrabbit-navy text-white font-semibold text-[12.5px] px-4 py-2.5 hover:bg-parkingrabbit-navy/90 transition"
        >
          <Camera className="size-3.5" strokeWidth={2.25} />
          Retake photo
        </Link>
        <Link
          href="/app/capture?source=library"
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white border border-parkingrabbit-border text-parkingrabbit-navy font-semibold text-[12.5px] px-4 py-2.5 hover:border-parkingrabbit-primary transition"
        >
          <Images className="size-3.5" strokeWidth={2.25} />
          Choose another photo
        </Link>
        <Link
          href={manualHref}
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white border border-parkingrabbit-border text-parkingrabbit-navy font-semibold text-[12.5px] px-4 py-2.5 hover:border-parkingrabbit-primary transition"
        >
          <Pencil className="size-3.5" strokeWidth={2.25} />
          Enter details manually
        </Link>
      </div>
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
