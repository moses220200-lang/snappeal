"use client";

/**
 * TicketDetailsForm — the single editable surface before the
 * council-portal lookup. Per the 2026-05-27 user directive:
 *
 *   > "show them the image, not-good badges, and then the two inputs
 *   > to edit and confirm/validate button and it shoots off"
 *
 * So the form is intentionally minimal:
 *
 *   1. Image preview (the PCN photo the user uploaded)
 *   2. (Optional) photo-coach badge when OCR flagged the photo as
 *      ok/poor quality
 *   3. PCN reference input
 *   4. Vehicle registration input
 *   5. Confirm & validate button — fires the council lookup
 *
 * Council is NOT a field on the form. It's already represented by the
 * tappable council badge in `TicketCardHeader` (which opens the
 * `CouncilPickerSheet` on tap) — duplicating it inside the form gave
 * the user the "asks twice" feeling that prompted this refactor.
 *
 * Amount + Issue date are NOT asked either — amount is OCR-detected
 * (the portal's record is authoritative once the lookup runs), issue
 * date is returned by the lookup itself.
 *
 * Mount sites:
 *   • `PendingReviewCard` (happy path — OCR succeeded enough to land
 *     the 3 required fields).
 *   • `ReadingFailureActions` (failure path — expand-on-tap from the
 *     amber failure surface).
 *   • `ReadingPCNActive` (slow-OCR helper expanded-form path).
 *
 * Once PCN ref + Reg are populated AND a council is picked via the
 * header badge, `deriveCardState`'s `hasAllRequired` early-out
 * flips the card from any failure-surface kind back to
 * pending_review — a single continuous surface without navigation.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import type { AppealRecord } from "@/lib/server/appeals";
import type { OcrHandoff } from "@/lib/client/session";

export type EditableTicketField =
  | "pcnRef"
  | "vehicleReg"
  | "councilSlug"
  | "amountPence"
  | "issuedAt"
  | "location";

interface Props {
  appeal: AppealRecord;
  /** PCN photo data URL — surfaced at the top of the form so the user
   *  sees what they uploaded while editing the fields. Sourced by the
   *  parent from sessionStorage (`getPcnPhoto`) with the appeal row's
   *  `pcnImageUrl` as the cross-device fallback. Null on cross-device
   *  load when neither source has the photo. */
  pcnImage?: string | null;
  /** OCR handoff (from sessionStorage) carrying photoCoach + per-field
   *  confidence pills. */
  ocrHandoff?: OcrHandoff | null;
  /** Fires the council-portal lookup. Parent (`TicketCard.agreeTicket`)
   *  PATCHes step=TICKET_CONFIRMED_STEP and POSTs /api/appeals/:id/lookup;
   *  deriveCardState's "step=TICKET_CONFIRMED_STEP + hasAllRequired"
   *  branch flips the card into validating on the next derive pass. */
  onAgree: () => void;
  /** Debounced per-field PATCH (`editTicketField` in TicketCard). */
  onEditField?: (field: EditableTicketField, value: string) => void;
  /** Show the amber photo-coach hint when OCR landed but flagged the
   *  photo as ok/poor. Defaults to true. The failure-card path passes
   *  `false` because that surface already carries its own "Couldn't
   *  read all details" copy and a second badge would double-message. */
  showPhotoCoach?: boolean;
  busy?: boolean;
}

export function TicketDetailsForm({
  appeal,
  pcnImage = null,
  ocrHandoff,
  onAgree,
  onEditField,
  showPhotoCoach = true,
  busy,
}: Props) {
  const ticket = appeal.ticket;
  const coach = ocrHandoff?.photoCoach ?? null;

  const [pcnRefLocal, setPcnRefLocal] = useState<string>(ticket?.pcnRef ?? "");
  const [vehicleRegLocal, setVehicleRegLocal] = useState<string>(
    ticket?.vehicleReg ?? "",
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPcnRefLocal(ticket?.pcnRef ?? "");
    setVehicleRegLocal(ticket?.vehicleReg ?? "");
  }, [ticket?.pcnRef, ticket?.vehicleReg]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const councilSlug = appeal.councilSlug ?? ticket?.councilSlug ?? null;

  // Confirm enabled when PCN ref + Reg are filled AND a council is set
  // (council is picked via the header badge tile, not the form itself).
  const fieldsFilled =
    pcnRefLocal.trim().length > 0 &&
    vehicleRegLocal.trim().length > 0 &&
    !!councilSlug;

  return (
    <section className="flex flex-col gap-2.5">
      {pcnImage && (
        <div className="rounded-2xl overflow-hidden border border-parkingrabbit-border bg-parkingrabbit-bg">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
          <img
            src={pcnImage}
            alt="Your PCN"
            className="w-full h-auto object-contain max-h-56"
          />
        </div>
      )}

      {/* Photo-coach hint — only when OCR flagged the photo as ok/poor.
       *  Suppressed in the failure-card path (showPhotoCoach=false)
       *  because that surface already communicates the photo problem
       *  in its own header copy. */}
      {showPhotoCoach && coach && coach.quality !== "good" && coach.advice && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2.5">
          <AlertTriangle
            className="size-3.5 text-amber-700 mt-0.5 shrink-0"
            strokeWidth={2.25}
          />
          <div className="flex-1 min-w-0">
            <p className="text-[11.5px] font-bold text-amber-900">
              {coach.quality === "ok" ? "Photo could be sharper" : "Photo looks rough"}
            </p>
            <p className="text-[11px] text-amber-900/80 mt-0.5 leading-snug">
              {coach.advice}
            </p>
          </div>
        </div>
      )}

      <EditableFieldRow
        label="PCN reference"
        value={pcnRefLocal}
        onChange={(v) => {
          const upper = v.toUpperCase();
          setPcnRefLocal(upper);
          onEditField?.("pcnRef", upper);
        }}
        placeholder="WC12345678"
        autoCapitalize="characters"
      />
      <EditableFieldRow
        label="Registration"
        value={vehicleRegLocal}
        onChange={(v) => {
          const upper = v.toUpperCase();
          setVehicleRegLocal(upper);
          onEditField?.("vehicleReg", upper);
        }}
        placeholder="AB12 CDE"
        autoCapitalize="characters"
      />

      <button
        type="button"
        onClick={() => {
          if (busy || !fieldsFilled) return;
          onAgree();
        }}
        disabled={busy || !fieldsFilled}
        className="rounded-2xl bg-parkingrabbit-primary text-white font-bold py-3.5 hover:bg-parkingrabbit-primary-600 transition disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-parkingrabbit-primary/30 active:scale-[0.99]"
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Saving…
          </>
        ) : (
          <>
            <ShieldCheck className="size-4" strokeWidth={2.25} />
            Confirm
          </>
        )}
      </button>

      {/* Legal footer — same copy + link styling as the "Start appeal"
       *  footer in <ReviewRecommendation>, kept in sync so the user
       *  sees the same agreement language at every irreversible step
       *  (confirming the ticket triggers the council-portal lookup,
       *  which is when our processing of their data really starts). */}
      <p className="text-[10.5px] text-parkingrabbit-muted text-center leading-snug">
        By tapping Confirm you agree to our
        <br />
        <Link
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-parkingrabbit-navy"
        >
          Terms &amp; Conditions
        </Link>{" "}
        and{" "}
        <Link
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-parkingrabbit-navy"
        >
          Privacy Policy
        </Link>
        .
      </p>

      {!councilSlug && (
        <p className="text-[10.5px] text-amber-800 text-center leading-snug">
          Tap the council badge at the top of the ticket to pick a council
          before confirming.
        </p>
      )}
    </section>
  );
}

/** Inline-editable field row. Visually identical to the row originally
 *  embedded inside PendingReviewCard — moved here so the failure-card
 *  surface can render the same input chrome without depending on a
 *  helper exported from a sibling file. */
function EditableFieldRow({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  prefix,
  inputMode,
  autoCapitalize,
  tight = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: "text" | "date";
  prefix?: string;
  inputMode?: "decimal" | "numeric" | "text";
  autoCapitalize?: "characters" | "off";
  tight?: boolean;
}) {
  const valueShrink = tight && value.length > 10;
  const valueStyle: React.CSSProperties | undefined = tight
    ? {
        fontSize: valueShrink ? "clamp(14px, 3.6vw, 18px)" : "clamp(15px, 4vw, 20px)",
        letterSpacing: valueShrink ? "-0.02em" : undefined,
      }
    : undefined;
  return (
    <label
      className={`rounded-xl border border-parkingrabbit-border flex flex-col gap-0.5 focus-within:border-parkingrabbit-primary focus-within:ring-2 focus-within:ring-parkingrabbit-primary/15 transition min-w-0 ${
        tight ? "p-3 max-[380px]:p-2.5" : "p-3"
      }`}
    >
      <span
        className="text-[11px] uppercase text-parkingrabbit-muted whitespace-nowrap overflow-hidden text-ellipsis"
        style={{ letterSpacing: "0.04em" }}
      >
        {label}
      </span>
      <div className="flex items-center gap-1.5 min-w-0">
        {prefix && (
          <span
            className={`font-bold text-parkingrabbit-navy shrink-0 ${
              tight ? "text-[16px]" : "text-[14px]"
            }`}
          >
            {prefix}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          autoCapitalize={autoCapitalize ?? "off"}
          spellCheck={false}
          style={valueStyle}
          className={`flex-1 min-w-0 bg-transparent font-bold text-parkingrabbit-navy focus:outline-none placeholder:text-parkingrabbit-muted/60 overflow-hidden text-ellipsis whitespace-nowrap ${
            tight ? "" : "text-[14px]"
          }`}
        />
      </div>
    </label>
  );
}
