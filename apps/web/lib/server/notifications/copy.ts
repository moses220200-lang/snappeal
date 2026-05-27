/**
 * Push notification copy registry.
 *
 * Every event the dispatcher fires has ONE entry here. Adding a new
 * event (e.g. "council escalated to charge certificate") = adding
 * one entry. The worker's hooks call `dispatchAppealEvent({ event,
 * appealId })`; the dispatcher looks up the entry, formats it with
 * runtime context (council name, amount, ref), and ships it.
 *
 * Copy guidelines:
 *   - Title ≤ ~55 chars (iOS truncates around 60)
 *   - Body ≤ ~110 chars (iOS truncates around 120)
 *   - Always end with a concrete deadline or next step — "32 days
 *     left" beats "soon"
 *   - URL deep-links to the expanded ticket card via ?expand=<id>
 */
import type { PushPayload } from "../push";
import type { AppealRecord } from "../appeals";

export type AppealEvent =
  /** pcn_lookup verdict landed (verified OR invalid). */
  | "validation_done"
  /** Lookup couldn't read the portal (CAPTCHA, down, login wall). */
  | "validation_failed"
  /** submit_appeal job completed successfully — council confirmation
   *  reference captured. */
  | "submission_done"
  /** submit_appeal job failed and exhausted retries. Customer needs
   *  to retry or use email fallback. */
  | "submission_failed"
  /** Inbound council reply parsed + classified. */
  | "council_replied";

export interface CopyContext {
  appeal: AppealRecord;
  /** Optional event-specific extras. The copy entry decides whether
   *  to use them — missing fields fall back to a neutral phrasing. */
  councilReference?: string | null;
  amountPence?: number | null;
  daysLeftToAppeal?: number | null;
  classification?: string | null;
}

type CopyFn = (ctx: CopyContext) => PushPayload;

function formatPence(p: number | null | undefined): string {
  if (p == null) return "";
  return `£${(p / 100).toFixed(p % 100 === 0 ? 0 : 2)}`;
}

function pcnRef(ctx: CopyContext): string {
  return ctx.appeal.ticket?.pcnRef ?? "your PCN";
}

function council(ctx: CopyContext): string {
  return ctx.appeal.ticket?.issuer ?? "the council";
}

function tag(appealId: string): string {
  // OS-level tag — same appeal pushes REPLACE rather than stack.
  return `appeal:${appealId}`;
}

function url(appealId: string): string {
  return `/app/tickets?expand=${encodeURIComponent(appealId)}`;
}

/** Single source of truth for push copy. */
export const COPY: Record<AppealEvent, CopyFn> = {
  validation_done: (ctx) => {
    const amount = formatPence(ctx.amountPence);
    const days =
      ctx.daysLeftToAppeal != null && ctx.daysLeftToAppeal > 0
        ? `${ctx.daysLeftToAppeal} days left to appeal`
        : "review your options";
    return {
      title: "PCN verified",
      body: `${pcnRef(ctx)} confirmed by ${council(ctx)}${amount ? ` — ${amount} due` : ""}. ${days}.`,
      url: url(ctx.appeal.id),
      tag: tag(ctx.appeal.id),
    };
  },

  validation_failed: (ctx) => ({
    title: "Couldn't reach the council",
    body: `We couldn't verify ${pcnRef(ctx)} on ${council(ctx)}'s portal. Tap to retry or proceed.`,
    url: url(ctx.appeal.id),
    tag: tag(ctx.appeal.id),
  }),

  submission_done: (ctx) => ({
    title: "Appeal submitted",
    body: `Your appeal for ${pcnRef(ctx)} is filed with ${council(ctx)}${ctx.councilReference ? ` (ref ${ctx.councilReference})` : ""}. Usually replied within 56 days.`,
    url: url(ctx.appeal.id),
    tag: tag(ctx.appeal.id),
  }),

  submission_failed: (ctx) => ({
    title: "Appeal needs your attention",
    body: `We couldn't submit your ${council(ctx)} appeal automatically. Tap to retry.`,
    url: url(ctx.appeal.id),
    tag: tag(ctx.appeal.id),
  }),

  council_replied: (ctx) => {
    const classification = ctx.classification ?? "replied";
    const headline =
      classification === "cancelled"
        ? "PCN cancelled — you won"
        : classification === "rejected"
          ? "Council rejected your appeal"
          : classification === "acknowledged"
            ? `${council(ctx)} received your appeal`
            : `${council(ctx)} replied`;
    return {
      title: headline,
      body: `${pcnRef(ctx)} — tap to read the council's response.`,
      url: url(ctx.appeal.id),
      tag: tag(ctx.appeal.id),
    };
  },
};
