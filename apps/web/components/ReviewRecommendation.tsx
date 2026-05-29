"use client";

/**
 * Recommendation card — the customer's decision surface on the
 * `needs_decision` state, after the council-portal validation has
 * settled. Wraps <PayAppealTiles> with two pieces of context-specific
 * chrome that ONLY make sense once the verdict is in:
 *
 *   - Appeal-expired amber banner above the tiles (canAppeal=false).
 *   - "By tapping Start appeal you agree to our Terms" footer.
 *
 * The tiles themselves live in <PayAppealTiles> so the same surface
 * can also mount on <PendingReviewCard> (v0.3.5 — Pay/Appeal offered
 * the moment OCR completes, before the lookup runs, so we don't burn
 * Playwright MCP + Claude vision on customers who were going to pay).
 *
 * v0.2.12 removed the "Email this appeal FREE" action — the paid AI
 * appeal IS the product. Email submission remains internally as a
 * portal-automation fallback but is not a customer choice.
 */
import { AppealExpiredBanner, PayAppealTiles } from "./PayAppealTiles";

interface Props {
  /** Paid AI appeal workflow — kicks off drafting + £2.99 PaymentSheet. */
  onStartAppeal: () => void;
  /** Direct council payment URL — opened in a new tab. NULL disables the
   *  Pay yourself action and shows a "Pick your council first" hint. */
  payUrl: string | null;
  /** Council display name used in the Pay-yourself subtitle. */
  councilName: string | null;
  /** Connector-derived: can the customer still file an appeal? When
   *  false, the Appeal action is replaced with an "Appeal period
   *  expired" banner and Pay yourself becomes the primary CTA. */
  canAppeal: boolean;
  /** Days remaining in the statutory appeal window. NULL when not
   *  applicable. Used for the deadline countdown copy. */
  daysLeftToAppeal: number | null;
  /** Set while the Appeal flow is being kicked off (PATCH preferredMethod,
   *  starting drafting). Disables both Appeal-related buttons so a
   *  double-tap can't double-stamp. */
  busy?: boolean;
}

export function ReviewRecommendation({
  onStartAppeal,
  payUrl,
  councilName,
  canAppeal,
  daysLeftToAppeal,
  busy,
}: Props) {
  return (
    // No outer card wrapper — when mounted inside the "Pay / appeal"
    // timeline step, the three choice tiles read better full-width
    // (flush with the timeline content column) than nested inside
    // another rounded box. The header copy lives in the lifecycle
    // step title / supporting line above.
    <section className="flex flex-col gap-2.5">
      {!canAppeal && <AppealExpiredBanner />}

      <PayAppealTiles
        onStartAppeal={onStartAppeal}
        payUrl={payUrl}
        councilName={councilName}
        canAppeal={canAppeal}
        daysLeftToAppeal={daysLeftToAppeal}
        busy={busy}
      />

      {/* 2026-05-28 — "Edit details" link + T&C/Privacy footer both
       *  removed from this surface. The user already agreed to those
       *  terms one step earlier when they tapped Confirm on
       *  TicketDetailsForm (see the same footer rendered there); a
       *  second agreement pitch immediately afterwards just adds
       *  noise. Likewise the "Edit details" affordance — by the time
       *  the customer reaches the pay/appeal tiles, the PCN ref + reg
       *  have already been verified by the council lookup, so the
       *  rewind-and-edit path isn't meaningful anymore. */}
    </section>
  );
}
