/**
 * OCR-derived `TicketStatusSnapshot` — used when an appeal is on an
 * automated council but the Playwright MCP `portal_lookup` hasn't run
 * yet (typical for older appeals created before the council was flipped
 * to `automated_beta`, or freshly uploaded tickets in the gap between
 * OCR completing and the lookup job firing).
 *
 * Why it exists: the alternative is to fall through to the mock
 * connector, which deterministically rotates a synthetic stage by
 * `hash(pcnRef:vehicleReg)`. That rotation has been observed to
 * fabricate "Order for Recovery" / "£210 court fee" on a perfectly
 * normal £160-outstanding PCN, hiding both the Pay and Appeal buttons.
 * Customers reasonably expect a Pay tile + an Appeal tile on every
 * unsettled PCN, and the mock blocking that was an outright UI
 * regression.
 *
 * Rules:
 *   - We only synthesise the lifecycle stage from the OCR-extracted
 *     `issuedAt` (statutory 28-day informal-rep window) and surface the
 *     OCR'd amount. The connector source string is "mock" so the UI's
 *     "preview" badge stays honest about provenance — these numbers came
 *     from a phone photo, not the council.
 *   - `canPay` is always true while the PCN is unsettled. The customer
 *     can ALWAYS pay; even an Order-for-Recovery PCN accepts payment.
 *   - `canAppeal` mirrors the statutory window for informal reps. If
 *     the window has elapsed the UI still shows the Pay tile; an
 *     out-of-time witness statement path is a separate (future) flow.
 *   - We do NOT invent due dates, court fees, or charge-certificate
 *     amounts. Those only become real once a portal_lookup confirms.
 */
import type { AppealRecord } from "../appeals";
import type { TicketStage, TicketStatusSnapshot } from "./types";

const APPEAL_WINDOW_DAYS = 28;

export function snapshotFromOcr(appeal: AppealRecord): TicketStatusSnapshot | null {
  const t = appeal.ticket;
  if (!t) return null;

  const issuedAt = t.issuedAt ? new Date(t.issuedAt) : null;
  const daysSinceIssue = issuedAt
    ? Math.floor((Date.now() - issuedAt.getTime()) / 86_400_000)
    : null;

  let stage: TicketStage;
  let canAppeal: boolean;
  if (daysSinceIssue == null) {
    // Unknown issue date — keep both options open; the inline confirm
    // form will surface the missing date so the user fills it in.
    stage = "appeal_open";
    canAppeal = true;
  } else if (daysSinceIssue <= APPEAL_WINDOW_DAYS) {
    stage = "appeal_open";
    canAppeal = true;
  } else {
    stage = "appeal_expired";
    canAppeal = false;
  }

  const daysLeftToAppeal =
    daysSinceIssue == null ? null : Math.max(0, APPEAL_WINDOW_DAYS - daysSinceIssue);

  return {
    status: "unpaid",
    stage,
    detail:
      stage === "appeal_open"
        ? "Pay now or let us draft and submit an appeal."
        : "Pay-by-deadline is the right next step — the 28-day appeal window has elapsed.",
    currentDuePence: t.amountPence ?? undefined,
    discountUntil: null,
    payByDate: null,
    daysLeftToAppeal,
    canAppeal,
    // Always payable while unsettled. We never want to hide the Pay tile
    // for a PCN that the customer has on their phone.
    canPay: true,
    paidAt: null,
    paymentUrl: null,
    rawVerdict: `ocr:${stage}`,
    fetchedAt: new Date().toISOString(),
    // Honest provenance — the data came from OCR, not the council.
    source: "mock",
  };
}
