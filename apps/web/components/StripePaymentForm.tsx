"use client";

import { useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { Loader2, Lock } from "lucide-react";
import { getStripe } from "@/lib/stripe-client";

type StripePaymentFormProps = {
  sessionId: string;
  /** Where the user lands after successful confirmation. */
  returnUrl: string;
  /** Called when payment succeeds in-place (no redirect). Use to chain to
   * the next step (e.g. /api/generate) without a page reload. */
  onSucceededInPlace?: (paymentIntentId: string) => void;
};

/**
 * Mounts the Stripe Payment Element after fetching a PaymentIntent.
 * Falls back to a "configure Stripe" placeholder when the publishable key
 * isn't set (so /app/paywall still renders without env wired up).
 */
export function StripePaymentForm({
  sessionId,
  returnUrl,
  onSucceededInPlace,
}: StripePaymentFormProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stripePromise = useMemo(() => getStripe(), []);
  const [stripeAvailable, setStripeAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    stripePromise.then((s) => {
      if (!cancelled) setStripeAvailable(Boolean(s));
    });
    return () => {
      cancelled = true;
    };
  }, [stripePromise]);

  useEffect(() => {
    if (stripeAvailable !== true) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            body?.error?.message ?? `Checkout failed (${res.status})`,
          );
        }
        const json = (await res.json()) as { clientSecret: string };
        if (!cancelled) setClientSecret(json.clientSecret);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Couldn't start payment",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stripeAvailable, sessionId]);

  if (stripeAvailable === false) {
    return (
      <div className="rounded-2xl bg-white border border-parkingrabbit-border p-5 text-sm text-parkingrabbit-muted leading-relaxed">
        <p className="font-semibold text-parkingrabbit-navy mb-1">
          Stripe isn&apos;t configured yet
        </p>
        <p>
          Set <code className="text-parkingrabbit-primary">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code>{" "}
          and{" "}
          <code className="text-parkingrabbit-primary">STRIPE_SECRET_KEY</code> in{" "}
          <code className="text-parkingrabbit-primary">apps/web/.env.local</code>{" "}
          to enable the real payment flow. See{" "}
          <code className="text-parkingrabbit-primary">.env.example</code>.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-800">
        <p className="font-semibold">Couldn&apos;t start payment</p>
        <p className="mt-1 text-red-700">{error}</p>
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="rounded-2xl bg-white border border-parkingrabbit-border p-6 flex items-center justify-center gap-2 text-sm text-parkingrabbit-muted">
        <Loader2 className="size-4 animate-spin" />
        Preparing secure payment…
      </div>
    );
  }

  const options: StripeElementsOptions = {
    clientSecret,
    appearance: {
      theme: "stripe",
      variables: {
        colorPrimary: "#007aff",
        colorBackground: "#ffffff",
        colorText: "#0b1f44",
        colorDanger: "#dc2626",
        fontFamily: "Inter, system-ui, sans-serif",
        borderRadius: "12px",
      },
    },
  };

  return (
    <Elements stripe={stripePromise} options={options}>
      <CheckoutForm returnUrl={returnUrl} onSucceededInPlace={onSucceededInPlace} />
    </Elements>
  );
}

function CheckoutForm({
  returnUrl,
  onSucceededInPlace,
}: {
  returnUrl: string;
  onSucceededInPlace?: (paymentIntentId: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: new URL(returnUrl, window.location.origin).toString(),
      },
      // Stay on this page for card / Apple Pay / Google Pay; only redirect
      // for bank methods that genuinely need it.
      redirect: "if_required",
    });
    if (stripeError) {
      setError(stripeError.message ?? "Payment failed");
      setSubmitting(false);
      return;
    }
    if (paymentIntent && paymentIntent.status === "succeeded") {
      onSucceededInPlace?.(paymentIntent.id);
      // Submit button stays disabled; the parent ticket card transitions
      // into its "submitting" state via SSE.
    } else {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <PaymentElement options={{ layout: "tabs" }} />

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full rounded-2xl bg-parkingrabbit-primary text-white font-semibold py-4 flex items-center justify-center gap-2 hover:bg-parkingrabbit-primary-600 transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Processing…
          </>
        ) : (
          <>
            <Lock className="size-4" />
            Pay £2.99
          </>
        )}
      </button>
      <p className="text-[11px] text-parkingrabbit-muted text-center flex items-center justify-center gap-1.5">
        <Lock className="size-3" />
        Payments are processed securely by Stripe.
      </p>
    </form>
  );
}
