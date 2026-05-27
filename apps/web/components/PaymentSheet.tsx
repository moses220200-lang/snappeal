"use client";

import { useEffect, useState } from "react";
import { Loader2, Lock, ShieldCheck, X } from "lucide-react";
import { StripePaymentForm } from "@/components/StripePaymentForm";
import { FakePaymentButtons } from "@/components/FakePaymentButtons";
import { getOrCreateSessionId } from "@/lib/client/session";
import { useFlags } from "@/lib/client/flags";

type PaymentSheetProps = {
  open: boolean;
  onClose: () => void;
  appealId: string;
  /** Fires once a PaymentIntent succeeds. Parent calls /api/submit and routes. */
  onPaid: (paymentIntentId: string) => Promise<void> | void;
  /** Locks the sheet (disables X, backdrop, Esc) while /api/submit is in flight. */
  busy?: boolean;
  /** Optional council name shown in the order summary line. */
  councilName?: string | null;
};

/**
 * Bottom payment sheet — opens over the letter page when the user taps Submit.
 * Renders either the Stripe Payment Element (Apple Pay / Google Pay / card,
 * auto-detected by Stripe on supported browsers) or the FakePaymentButtons
 * dev panel when the server-side `fakePayment` flag is on.
 *
 * The flag is loaded via `useFlags()` (cached `/api/health` fetch) so it
 * reflects the runtime-mutable admin setting — flipping
 * `fakePayment` in /admin/settings takes effect on next page reload
 * without rebuilding the client bundle. Replaces the legacy raw
 * `process.env.NEXT_PUBLIC_PARKINGRABBIT_FAKE_PAYMENT` read.
 */
export function PaymentSheet({
  open,
  onClose,
  appealId,
  onPaid,
  busy = false,
  councilName,
}: PaymentSheetProps) {
  const FAKE_MODE = useFlags().fakePayment;
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  // Two-state mount/visible pattern so the sheet animates in/out cleanly
  // without leaving Stripe Elements mounted when the sheet is closed.
  // The setState calls inside this effect are intentional — `mounted` and
  // `visible` are derived from `open` (an external prop) with a two-frame
  // delay to enable the CSS transition.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = window.setTimeout(() => setMounted(false), 280);
    return () => window.clearTimeout(t);
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Body-scroll lock while the sheet is open.
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  // Esc to close (unless busy mid-submit).
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, busy, onClose]);

  if (!mounted) return null;

  const sessionId = getOrCreateSessionId();
  const handleBackdrop = () => {
    if (!busy) onClose();
  };

  return (
    <>
      <div
        aria-hidden
        onClick={handleBackdrop}
        className={`fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Submit appeal — payment"
        className={`fixed bottom-0 inset-x-0 z-50 mx-auto max-w-md bg-white rounded-t-3xl shadow-2xl shadow-black/30 max-h-[88vh] overflow-hidden flex flex-col transition-transform duration-300 ease-out ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Grab handle */}
        <div className="pt-2 pb-1 flex items-center justify-center">
          <span className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="px-5 pt-1 pb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-parkingrabbit-navy tracking-tight">
              Submit appeal
            </h2>
            <p className="text-[12px] text-parkingrabbit-muted mt-0.5 leading-snug">
              £2.99 · auto-submits to{" "}
              {councilName ? councilName : "your council"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close payment sheet"
            className="size-9 rounded-full bg-parkingrabbit-bg border border-parkingrabbit-border flex items-center justify-center text-parkingrabbit-navy hover:bg-parkingrabbit-border/60 transition disabled:opacity-50"
          >
            <X className="size-4" strokeWidth={2.25} />
          </button>
        </div>

        {/* Order summary */}
        <div className="mx-5 mb-3 rounded-2xl bg-parkingrabbit-primary-50/60 border border-parkingrabbit-primary/20 px-4 py-3 flex items-center gap-3">
          <span className="size-10 rounded-xl bg-parkingrabbit-primary text-white flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="size-5" strokeWidth={2} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-parkingrabbit-navy">
              ParkingRabbit — Challenge a ticket
            </p>
            <p className="text-[11px] text-parkingrabbit-muted mt-0.5 leading-snug">
              One-off charge · non-refundable
            </p>
          </div>
          <p className="text-base font-bold text-parkingrabbit-primary whitespace-nowrap">
            £2.99
          </p>
        </div>

        {/* Body — pick the right payment surface */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {busy ? (
            <div className="rounded-2xl bg-white border border-parkingrabbit-border p-6 flex flex-col items-center gap-2 text-sm text-parkingrabbit-muted">
              <Loader2 className="size-5 animate-spin text-parkingrabbit-primary" />
              Submitting to council…
            </div>
          ) : FAKE_MODE ? (
            <FakePaymentButtons onSucceeded={onPaid} />
          ) : (
            <StripePaymentForm
              sessionId={sessionId}
              returnUrl={`/app/tickets/${appealId}`}
              onSucceededInPlace={onPaid}
            />
          )}

          <p className="mt-4 text-[10.5px] text-parkingrabbit-muted text-center flex items-center justify-center gap-1.5">
            <Lock className="size-3" />
            Powered by Stripe · 256-bit TLS
          </p>
        </div>
      </div>
    </>
  );
}
