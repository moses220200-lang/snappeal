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

/* ────────────── Council-vs-user discrepancy detection (v0.3.6) ──────────────
 *
 * Once the lookup completes (portalLookup.status === "verified"), each
 * field the council returned is compared against what the user (OCR or
 * manual entry) had on the appeal row. Mismatches are surfaced to the
 * user inside the Build-appeal surface so they know exactly which
 * fields the council overrode — values never change silently. Used by:
 *   - <CouncilCheckChip> / GatheringEvidenceCard ("Council updated:")
 *   - the draft prompt (which already prioritises portal metadata)
 */
export type TicketField =
  | "pcnRef"
  | "vehicleReg"
  | "contraventionCode"
  | "issuedAt"
  | "amountPence"
  | "location";

export interface TicketDiscrepancy {
  field: TicketField;
  /** Human-readable field label for the UI. */
  label: string;
  /** What the user (OCR or typed) had. Stringified for display. */
  userValue: string;
  /** What the council's record says. Stringified for display. */
  councilValue: string;
}

const FIELD_LABEL: Record<TicketField, string> = {
  pcnRef: "PCN reference",
  vehicleReg: "Registration",
  contraventionCode: "Contravention code",
  issuedAt: "Issue date",
  amountPence: "Amount",
  location: "Location",
};

/** Normalise a value for comparison. Empty strings, null, undefined,
 *  and 0 (for amountPence specifically) all collapse to null so the
 *  user's blank/missing values don't count as discrepancies. */
function norm(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v === 0) return null;
    return String(v);
  }
  if (typeof v === "string") {
    const t = v.trim();
    return t.length === 0 ? null : t;
  }
  return null;
}

function formatForDisplay(field: TicketField, raw: string): string {
  if (field === "amountPence") {
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    return `£${(n / 100).toFixed(2).replace(/\.00$/, "")}`;
  }
  if (field === "issuedAt") {
    // ISO timestamp → "12 Feb 2026" if parseable.
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
    return raw;
  }
  return raw;
}

export function getTicketDiscrepancies(
  appeal: AppealRecord,
): TicketDiscrepancy[] {
  if (appeal.portalLookup?.status !== "verified") return [];
  const meta = appeal.portalLookup.metadata;
  if (!meta) return [];
  const ticket = appeal.ticket;
  const out: TicketDiscrepancy[] = [];
  const fields: TicketField[] = [
    "pcnRef",
    "vehicleReg",
    "contraventionCode",
    "issuedAt",
    "amountPence",
    "location",
  ];
  for (const f of fields) {
    const userRaw = norm((ticket as Record<string, unknown> | null)?.[f]);
    const councilRaw = norm((meta as Record<string, unknown>)[f]);
    // Only count as a discrepancy when BOTH sides have a value AND
    // they differ. If the user's value is empty we treat the council
    // value as a pure backfill — no need to flag.
    if (!councilRaw) continue;
    if (!userRaw) continue;
    if (userRaw === councilRaw) continue;
    // Special-case issue dates: ISO timestamps from OCR vs from the
    // council can disagree on time/zone but agree on date. Compare
    // the date-only portion when both are parseable.
    if (f === "issuedAt") {
      const u = new Date(userRaw);
      const c = new Date(councilRaw);
      if (!Number.isNaN(u.getTime()) && !Number.isNaN(c.getTime())) {
        if (u.toISOString().slice(0, 10) === c.toISOString().slice(0, 10)) {
          continue;
        }
      }
    }
    out.push({
      field: f,
      label: FIELD_LABEL[f],
      userValue: formatForDisplay(f, userRaw),
      councilValue: formatForDisplay(f, councilRaw),
    });
  }
  return out;
}
