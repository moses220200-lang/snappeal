/**
 * ticketDisplay — the single source of truth for what a ticket card
 * *displays*.
 *
 * ───────────────────────────── Trust rule ─────────────────────────────
 * Before the council has VERIFIED the PCN, every displayed value comes
 * ONLY from the OCR-extracted ticket. Never a status-checker balance,
 * never portal-lookup metadata, never an inferred / discounted / cached /
 * normalised figure. A header amount that disagrees with the confirm-form
 * amount (e.g. header "£130" while the form shows the scanned "£160")
 * destroys user trust, so OCR is authoritative until verification.
 *
 * "Verified" means exactly `appeal.portalLookup.status === "verified"` —
 * the council's own portal confirmed the record. Every other state
 * (pending / skipped / overridden / invalid / none) is pre-verification
 * as far as the displayed figures are concerned and falls back to OCR.
 *
 * After verification the council's figure takes over: the live status
 * balance if we have one, otherwise the verified portal metadata. When
 * that figure differs from what was scanned, the UI must say so out loud
 * (see `amountChangedByCouncil`) — values never change silently.
 *
 * This module is pure and has no React/runtime dependencies so it can be
 * unit-tested directly (see scripts/test-display-amount.ts).
 */
import type { AppealRecord } from "@/lib/server/appeals";
import type { TicketStatusSnapshot } from "@/lib/server/connectors/types";

export type AmountSource = "ocr" | "council_verified" | "none";

export interface DisplayTicket {
  pcnRef: string | null;
  vehicleReg: string | null;
  location: string | null;
  issuedAt: string | null;
  /** The amount to render everywhere (header, summary, etc). */
  amountPence: number | null;
  /** The OCR-extracted amount — authoritative pre-verification. */
  ocrAmountPence: number | null;
  /** The council figure once verified, else null. */
  verifiedAmountPence: number | null;
  /** True iff `portalLookup.status === "verified"`. */
  councilVerified: boolean;
  /** Where `amountPence` came from. */
  amountSource: AmountSource;
  /** True when the council's verified amount differs from what was
   *  scanned — the UI must surface an explanation rather than silently
   *  swapping the number. */
  amountChangedByCouncil: boolean;
}

export function resolveDisplayTicket(
  appeal: AppealRecord,
  statusSnapshot: TicketStatusSnapshot | null,
): DisplayTicket {
  const ticket = appeal.ticket ?? null;
  const councilVerified = appeal.portalLookup?.status === "verified";
  // Council-sourced metadata is only allowed to override OCR once the
  // lookup has actually verified the PCN.
  const meta = councilVerified ? appeal.portalLookup?.metadata : undefined;

  const ocrAmountPence = ticket?.amountPence ?? null;
  const verifiedAmountPence = councilVerified
    ? statusSnapshot?.currentDuePence ?? meta?.amountPence ?? null
    : null;
  const amountPence = verifiedAmountPence ?? ocrAmountPence;

  return {
    pcnRef: meta?.pcnRef ?? ticket?.pcnRef ?? null,
    vehicleReg: meta?.vehicleReg ?? ticket?.vehicleReg ?? null,
    location: meta?.location ?? ticket?.location ?? null,
    issuedAt: meta?.issuedAt ?? ticket?.issuedAt ?? null,
    amountPence,
    ocrAmountPence,
    verifiedAmountPence,
    councilVerified,
    amountSource:
      amountPence == null
        ? "none"
        : verifiedAmountPence != null
          ? "council_verified"
          : "ocr",
    amountChangedByCouncil:
      verifiedAmountPence != null &&
      ocrAmountPence != null &&
      verifiedAmountPence !== ocrAmountPence,
  };
}

/**
 * Dev-only invariant. The displayed amount MUST equal the OCR amount
 * whenever the council hasn't verified yet. If a future change ever
 * reintroduces a pre-verification hallucinated figure, this logs loudly
 * so it's caught immediately. No-op in production.
 */
export function assertAmountConsistency(d: DisplayTicket): void {
  if (process.env.NODE_ENV === "production") return;
  if (!d.councilVerified && d.amountPence !== d.ocrAmountPence) {
    console.error(
      "[PCN amount mismatch] Pre-verification displayed amount " +
        `(${d.amountPence}) does not match the OCR-extracted amount ` +
        `(${d.ocrAmountPence}). Before council verification the amount ` +
        "must come only from OCR.",
    );
  }
}
