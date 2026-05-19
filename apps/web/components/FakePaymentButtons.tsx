"use client";

import { useState } from "react";
import { CreditCard, Loader2, Lock, ShieldCheck } from "lucide-react";

/**
 * Test-mode payment buttons used at /app/paywall while real Stripe keys
 * aren't wired yet. Renders three branded options (Apple Pay / Google Pay /
 * Card) and, on click, simulates a Stripe PaymentIntent success after a
 * short delay, then hands a fake `pi_test_*` id back to the parent so the
 * downstream /api/generate flow can run unmodified.
 *
 * `SNAPPEAL_SKIP_PAYMENT_CHECK=1` lets /api/generate accept the placeholder
 * id without verifying it against the Stripe API.
 */
type Method = "apple" | "google" | "card";

export function FakePaymentButtons({
  onSucceeded,
}: {
  onSucceeded: (paymentIntentId: string) => void;
}) {
  const [processing, setProcessing] = useState<Method | null>(null);

  const fire = (method: Method) => {
    if (processing) return;
    setProcessing(method);
    // Short, deliberate delay so the user can read "Processing test payment".
    window.setTimeout(() => {
      const fakeId = `pi_test_${method}_${Date.now().toString(36)}`;
      onSucceeded(fakeId);
    }, 800);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <p className="inline-flex self-start items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1">
        <ShieldCheck className="size-3" />
        Test mode · no card charged
      </p>

      <PayButton
        kind="apple"
        loading={processing === "apple"}
        disabled={processing !== null && processing !== "apple"}
        onClick={() => fire("apple")}
      />
      <PayButton
        kind="google"
        loading={processing === "google"}
        disabled={processing !== null && processing !== "google"}
        onClick={() => fire("google")}
      />
      <PayButton
        kind="card"
        loading={processing === "card"}
        disabled={processing !== null && processing !== "card"}
        onClick={() => fire("card")}
      />

      <p className="text-[11px] text-snappeal-muted text-center flex items-center justify-center gap-1.5 mt-1">
        <Lock className="size-3" />
        Real Stripe will replace this once test keys are wired.
      </p>
    </div>
  );
}

function PayButton({
  kind,
  loading,
  disabled,
  onClick,
}: {
  kind: Method;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const palette =
    kind === "apple"
      ? "bg-black text-white hover:bg-black/90"
      : kind === "google"
        ? "bg-white text-snappeal-navy border border-snappeal-border hover:border-snappeal-primary"
        : "bg-snappeal-primary text-white hover:bg-snappeal-primary-600";

  const label =
    kind === "apple" ? "Pay" : kind === "google" ? "Pay" : "Pay with card";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`rounded-2xl font-semibold py-4 flex items-center justify-center gap-2 transition shadow-md disabled:opacity-60 disabled:cursor-not-allowed ${palette}`}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Processing test payment…
        </>
      ) : (
        <>
          <Glyph kind={kind} />
          <span className="font-semibold">{label}</span>
          <span className={`text-sm font-bold ${kind === "google" ? "text-snappeal-navy" : "text-white"}`}>
            £2.99
          </span>
        </>
      )}
    </button>
  );
}

function Glyph({ kind }: { kind: Method }) {
  if (kind === "apple") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.234-.01-.317-.03-.013-.1-.027-.21-.027-.32 0-1.13.524-2.27 1.158-2.97.804-.95 2.13-1.65 3.222-1.7.014.13.028.26.028.37zM21 17.42c-.49 1.09-1.04 2.18-1.7 3.27-.88 1.45-2.05 3.26-3.5 3.28-1.3.02-1.62-.84-3.36-.83-1.75 0-2.1.85-3.39.85-1.45-.05-2.56-1.7-3.44-3.15-2.46-4.06-2.71-8.83-1.2-11.37C5.36 7.62 6.94 6.7 8.42 6.7c1.32 0 2.16.71 3.27.71 1.07 0 1.72-.71 3.25-.71 1.16 0 2.4.63 3.27 1.72-2.88 1.58-2.41 5.7.79 9z" />
      </svg>
    );
  }
  if (kind === "google") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.07 5.07 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.11A6.62 6.62 0 0 1 5.5 12c0-.73.12-1.44.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.95l3.66-2.84z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
      </svg>
    );
  }
  return <CreditCard className="size-5" />;
}
