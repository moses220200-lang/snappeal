/**
 * Pure helper: given an appeal, compute when its statutory windows
 * close. Used by:
 *   - the tickets list to sort unsettled tickets by "soonest deadline"
 *   - the card header to render a red ribbon when ≤ 7 days remain
 *   - the backlog banner ("⚠ 1 ticket needs action within 4 days")
 *
 * Truth precedence (highest first):
 *   1. `portalLookup.metadata.dueDateAt` — council-confirmed final
 *      deadline before they escalate to a Charge Certificate. Most
 *      authoritative when present.
 *   2. `portalLookup.metadata.discountUntil` — last day at the 50%
 *      discount band. We use this as the "soft" deadline (urgency
 *      cue) when no `dueDateAt` is set.
 *   3. OCR-derived fallback: `ticket.issuedAt + 28 days` for the rep
 *      window; `+ 14 days` for the discount. Approximation only —
 *      council varies and DST means "exactly 14 days later at the
 *      same wall-clock time" can be off by an hour.
 *
 * Returns null when no signal exists (e.g. an appeal with no ticket
 * yet, or a fully settled one).
 *
 * Timezone note: parking deadlines in the UK are statutorily set in
 * Europe/London local time. The functions below treat the ISO strings
 * as instants (Date.parse), which is correct for *ordering* and *days
 * remaining* calculations (off-by-≤1-hour at most around DST swaps).
 * If we ever surface an exact wall-clock countdown we should reach for
 * a proper timezone library — captured as a known limitation. */
import type { AppealRecord } from "./server/appeals";

export interface DeadlineProximity {
  /** Final deadline ms — the moment the council can register the debt
   *  with the Traffic Enforcement Centre. Highest-confidence date. */
  dueMs: number | null;
  /** Discount band closes ms — half-price up to this point. Soft
   *  deadline (urgency, not penalty). */
  discountMs: number | null;
  /** The soonest meaningful deadline. Used for list-sort + banner.
   *  Equal to `discountMs` while we're in the discount band; flips
   *  to `dueMs` once discount is past. */
  criticalMs: number | null;
  /** Days remaining until `criticalMs` (floor, never negative). */
  daysToCritical: number | null;
  /** ISO source of `criticalMs` so the UI can format it. */
  criticalAt: string | null;
  /** True when both deadlines have elapsed. The ticket is past the
   *  statutory rep window; only Pay or witness-statement-route
   *  remain. */
  expired: boolean;
}

const APPEAL_WINDOW_DAYS = 28;
const DISCOUNT_WINDOW_DAYS = 14;

export function getDeadlineProximity(
  appeal: Pick<AppealRecord, "ticket" | "portalLookup" | "status">,
): DeadlineProximity | null {
  // Fully settled appeals have no urgency.
  if (
    appeal.status === "submitted" ||
    appeal.status === "under_review" ||
    appeal.status === "decision_pending" ||
    appeal.status === "cancelled" ||
    appeal.status === "rejected"
  ) {
    return null;
  }

  const meta = appeal.portalLookup?.metadata;
  const ocrIssuedAt = appeal.ticket?.issuedAt
    ? Date.parse(appeal.ticket.issuedAt)
    : null;

  // Council-confirmed dates (highest confidence).
  const dueMs = meta?.dueDateAt ? safeParseMs(meta.dueDateAt) : null;
  const discountConfirmedMs = meta?.discountUntil
    ? safeParseMs(meta.discountUntil)
    : null;

  // OCR-derived fallback when council hasn't confirmed.
  const dueFallbackMs =
    !dueMs && ocrIssuedAt != null
      ? ocrIssuedAt + APPEAL_WINDOW_DAYS * 86_400_000
      : null;
  const discountFallbackMs =
    !discountConfirmedMs && ocrIssuedAt != null
      ? ocrIssuedAt + DISCOUNT_WINDOW_DAYS * 86_400_000
      : null;

  const finalDueMs = dueMs ?? dueFallbackMs;
  const finalDiscountMs = discountConfirmedMs ?? discountFallbackMs;

  if (finalDueMs == null && finalDiscountMs == null) return null;

  // Critical deadline: discount band while it's still ahead, else due.
  const now = Date.now();
  let criticalMs: number | null;
  let criticalAt: string | null;
  if (finalDiscountMs != null && finalDiscountMs > now) {
    criticalMs = finalDiscountMs;
    criticalAt =
      meta?.discountUntil ??
      (finalDiscountMs ? new Date(finalDiscountMs).toISOString() : null);
  } else if (finalDueMs != null) {
    criticalMs = finalDueMs;
    criticalAt =
      meta?.dueDateAt ??
      (finalDueMs ? new Date(finalDueMs).toISOString() : null);
  } else {
    // Discount past but no due date inferable → use discount as a
    // signal anyway; the UI shows "past discount" copy.
    criticalMs = finalDiscountMs;
    criticalAt =
      meta?.discountUntil ??
      (finalDiscountMs ? new Date(finalDiscountMs).toISOString() : null);
  }

  const daysToCritical =
    criticalMs != null
      ? Math.max(0, Math.floor((criticalMs - now) / 86_400_000))
      : null;

  const expired =
    (finalDueMs == null || finalDueMs < now) &&
    (finalDiscountMs == null || finalDiscountMs < now);

  return {
    dueMs: finalDueMs,
    discountMs: finalDiscountMs,
    criticalMs,
    daysToCritical,
    criticalAt,
    expired,
  };
}

function safeParseMs(iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Sort key for the tickets-list backlog ordering. Smaller = more
 *  urgent. Settled / no-deadline tickets sort to the end. */
export function deadlineSortKey(
  appeal: Pick<AppealRecord, "ticket" | "portalLookup" | "status">,
): number {
  const p = getDeadlineProximity(appeal);
  if (!p || p.criticalMs == null) return Number.POSITIVE_INFINITY;
  return p.criticalMs;
}

/** Convenience: returns true when the criticalMs is within `withinDays`
 *  of now AND not yet elapsed. Used by the card ribbon + the
 *  backlog banner. */
export function isDeadlineApproaching(
  proximity: DeadlineProximity | null,
  withinDays: number,
): boolean {
  if (!proximity || proximity.daysToCritical == null) return false;
  return proximity.daysToCritical <= withinDays && proximity.daysToCritical >= 0;
}
