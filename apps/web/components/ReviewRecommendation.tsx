"use client";

/**
 * Recommendation card — the customer's decision point on the ticket
 * detail page once the council-portal validation + status check have
 * settled. Three actions, costs shown inline:
 *
 *   1. Appeal with Rabbit — PAID         (primary monetised path).
 *   2. Pay yourself — FREE deep-link     (we never touch funds).
 *   3. Pay instantly with Rabbit (+£1.99) — Coming soon (disabled).
 *
 * Conditional presentation (driven by the status-check snapshot via
 * `<TicketCardBody>`):
 *
 *   - Appeal window open    → action 1 primary, action 2 secondary, deadline shown.
 *   - Appeal window expired → action 1 hidden, "Appeal period expired"
 *                              banner, action 2 promoted to primary.
 *   - Escalated (Charge Cert / Order for Recovery / Enforcement) →
 *                              stage banner, action 2 only.
 *   - Paid / cancelled / closed → handled higher up by `<TicketCardBody>`
 *                              (this component isn't rendered).
 *
 * v0.2.12 removed the "Email this appeal FREE" action — the paid AI
 * appeal IS the product. Email submission remains internally as a
 * portal-automation fallback but is not a customer choice.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  CreditCard,
  Loader2,
  Scale,
} from "lucide-react";

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
  // Suppress the unused-prop lint warning — kept on the props
  // signature for backwards compatibility with the existing call site;
  // the body text doesn't render the council name any more.
  void councilName;

  // Apple Pay / Google Pay swap — detect the device platform once on
  // mount and show the matching wallet brand. Defaults to Apple Pay
  // for unknown / desktop UAs so the tile always renders something
  // reasonable rather than blank.
  const [wallet, setWallet] = useState<"apple" | "google">("apple");
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent || "";
    if (/Android/i.test(ua)) {
      setWallet("google");
    } else if (/iPad|iPhone|iPod/.test(ua)) {
      setWallet("apple");
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  return (
    // No outer card wrapper — when mounted inside the "Pay / appeal"
    // timeline step, the three choice tiles read better full-width
    // (flush with the timeline content column) than nested inside
    // another rounded box. The header copy lives in the lifecycle
    // step title / supporting line above, so we skip a duplicated
    // "Pick how to handle this" header here too.
    <section className="flex flex-col gap-2.5">
      {/* Appeal-expired banner replaces Action 1 when canAppeal=false. */}
      {!canAppeal && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5 flex items-start gap-3">
          <span className="size-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="size-4" strokeWidth={2} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-bold text-amber-900 leading-tight">
              Appeal period ended
            </p>
            <p className="text-[12px] text-amber-900/80 mt-1 leading-snug">
              The appeal time has expired. Pay now to avoid additional charges.
            </p>
          </div>
        </div>
      )}

      {/* Action 1 — Appeal with Rabbit (PAID, hidden when canAppeal=false). */}
      {canAppeal && (
        <button
          type="button"
          onClick={onStartAppeal}
          disabled={busy}
          className="group relative rounded-2xl bg-white border border-snappeal-border p-3.5 flex items-center gap-3 text-left transition active:scale-[0.99] hover:border-snappeal-primary hover:bg-snappeal-primary-50/40 hover:shadow-md hover:shadow-snappeal-primary/15 focus-visible:outline-none focus-visible:border-snappeal-primary focus-visible:ring-2 focus-visible:ring-snappeal-primary/30 disabled:opacity-60"
        >
          <span className="size-11 rounded-xl bg-snappeal-primary text-white flex items-center justify-center shrink-0">
            {busy ? (
              <Loader2 className="size-5 animate-spin" strokeWidth={2} />
            ) : (
              <Scale className="size-5" strokeWidth={2} />
            )}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold text-snappeal-navy flex items-center gap-1.5 flex-wrap leading-tight">
              Appeal
              <span className="inline-flex items-center rounded-full bg-snappeal-primary-50 text-snappeal-primary border border-snappeal-primary/30 text-[10px] font-bold px-2 py-0.5">
                £2.99
              </span>
            </p>
            <p className="text-[12px] text-snappeal-muted mt-1 leading-snug">
              We draft and submit the appeal for you.
              {daysLeftToAppeal != null && (
                <>
                  {" "}
                  <span className="text-snappeal-action font-semibold">
                    {daysLeftToAppeal === 0
                      ? "Last day."
                      : daysLeftToAppeal === 1
                        ? "1 day left."
                        : `${daysLeftToAppeal} days left.`}
                  </span>
                </>
              )}
            </p>
          </div>
          <ChevronRight className="size-4 text-snappeal-muted shrink-0" />
        </button>
      )}

      {/* Action 2 — Pay yourself (free deep-link to council portal). */}
      {payUrl ? (
        <a
          href={payUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`rounded-2xl bg-white border p-3.5 flex items-center gap-3 text-left transition active:scale-[0.99] hover:border-snappeal-primary/40 ${
            canAppeal
              ? "border-snappeal-border"
              : "border-snappeal-primary shadow-md shadow-snappeal-primary/15"
          }`}
        >
          <span className="size-11 rounded-xl bg-snappeal-bg/60 text-snappeal-navy flex items-center justify-center shrink-0">
            <CreditCard className="size-5" strokeWidth={2} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold text-snappeal-navy flex items-center gap-1.5 leading-tight">
              Pay yourself
              <span className="inline-flex items-center rounded-full bg-snappeal-bg/80 border border-snappeal-border text-snappeal-muted text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5">
                Free
              </span>
            </p>
            <p className="text-[12px] text-snappeal-muted mt-1 leading-snug">
              Pay directly on the council website: no extra fees.
            </p>
          </div>
          <ChevronRight className="size-4 text-snappeal-muted shrink-0" />
        </a>
      ) : (
        <div className="rounded-2xl bg-white border border-snappeal-border p-3.5 flex items-center gap-3 opacity-70">
          <span className="size-11 rounded-xl bg-snappeal-bg/60 text-snappeal-muted flex items-center justify-center shrink-0">
            <CreditCard className="size-5" strokeWidth={2} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold text-snappeal-navy leading-tight">
              Pay yourself
            </p>
            <p className="text-[12px] text-snappeal-muted mt-1 leading-snug">
              Pick your council first to open the right payment page.
            </p>
          </div>
        </div>
      )}

      {/* Action 3 — Wallet pay placeholder. Renders Apple Pay on
       *  iOS and Google Pay on Android (detected once on mount).
       *  Intentionally inert until the integration ships. */}
      <div
        aria-disabled
        className="rounded-2xl bg-white border border-dashed border-snappeal-border p-3.5 flex items-center gap-3 cursor-not-allowed opacity-80"
      >
        <span className="size-11 rounded-xl bg-snappeal-bg/60 text-snappeal-navy flex items-center justify-center shrink-0">
          {wallet === "google" ? (
            <GoogleLogo className="size-5" />
          ) : (
            <AppleLogo className="size-5" />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-snappeal-navy flex items-center gap-1.5 flex-wrap leading-tight">
            {wallet === "google" ? "Google Pay" : "Apple Pay"}
            <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5">
              Coming soon
            </span>
          </p>
          <p className="text-[12px] text-snappeal-muted mt-1 leading-snug">
            Pay instantly and securely.
            <br />
            <span className="text-snappeal-navy/70 font-medium">
              Confirm once and you&apos;re done
            </span>
          </p>
        </div>
      </div>

      {canAppeal && (
        <p className="text-[10.5px] text-snappeal-muted text-center leading-snug">
          By tapping Start appeal you agree to our{" "}
          <Link
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-snappeal-navy"
          >
            Terms &amp; Conditions
          </Link>
          .
        </p>
      )}
    </section>
  );
}

/** Apple logo glyph — inline SVG since lucide doesn't ship one
 *  (trademarked). Used as the icon for the Apple Pay placeholder
 *  tile on iOS. Fill is `currentColor` so the surrounding `text-`
 *  utility colours it. */
function AppleLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M16.365 1.43c0 1.14-.475 2.27-1.235 3.08-.81.872-2.14 1.555-3.24 1.46-.13-1.1.45-2.243 1.18-3.06.83-.93 2.22-1.624 3.295-1.48zM20.5 17.06c-.49 1.13-.72 1.64-1.36 2.64-.88 1.38-2.12 3.1-3.66 3.12-1.36.02-1.71-.88-3.56-.87-1.85.01-2.23.89-3.6.87-1.54-.02-2.72-1.57-3.6-2.95C2.4 15.7 2.16 11.16 3.6 8.61 4.62 6.8 6.27 5.69 7.82 5.69c1.58 0 2.57.87 3.87.87 1.26 0 2.03-.87 3.86-.87 1.38 0 2.84.75 3.88 2.05-3.41 1.87-2.86 6.74.07 8.32z" />
    </svg>
  );
}

/** Google "G" logo glyph — inline SVG (4-colour standard). Used as
 *  the icon for the Google Pay placeholder tile on Android. */
function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden
      className={className}
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
