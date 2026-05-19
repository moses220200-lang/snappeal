"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { StripePaymentForm } from "@/components/StripePaymentForm";

/**
 * v0.1 paywall — £2.99 one-off, non-refundable.
 * Stripe Payment Element handles Apple Pay / Google Pay / card automatically
 * (controlled by `automatic_payment_methods` on the PaymentIntent).
 */
export default function PaywallPage() {
  // Anonymous session id — persists in localStorage so we can correlate
  // the PaymentIntent metadata back to the local appeal record.
  const sessionId = useMemo(() => {
    if (typeof window === "undefined") return "ssr";
    const KEY = "snappeal.sessionId";
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id = `snap_${crypto.randomUUID()}`;
      window.localStorage.setItem(KEY, id);
    }
    return id;
  }, []);

  return (
    <div className="flex flex-col gap-5 pt-6 px-5 pb-6">
      <header className="flex items-center gap-3">
        <Link
          href="/app/notes"
          aria-label="Back"
          className="size-9 rounded-full border border-snappeal-border flex items-center justify-center text-snappeal-muted"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-snappeal-navy">
            Appeal this PCN
          </h1>
          <p className="text-xs text-snappeal-muted">Step 3 of 4 · Pay</p>
        </div>
      </header>

      {/* Pricing card */}
      <section className="rounded-3xl bg-white border border-snappeal-border p-6 text-center">
        <p className="text-xs uppercase tracking-wide text-snappeal-muted">
          One-off, non-refundable
        </p>
        <p className="mt-2 text-5xl font-bold text-snappeal-navy tracking-tight">
          £2.99
        </p>
        <p className="mt-2 text-xs text-snappeal-muted leading-relaxed max-w-[260px] mx-auto">
          You&apos;re paying for the appeal we draft and submit, not for the
          outcome.
        </p>
      </section>

      {/* What you get */}
      <section className="rounded-2xl bg-white border border-snappeal-border p-5">
        <p className="text-sm font-bold text-snappeal-navy mb-3">
          What&apos;s included
        </p>
        <ul className="space-y-2.5">
          {[
            "AI-drafted appeal citing the right ground and contravention code",
            "Submitted directly to your council's portal (or by email)",
            "Status timeline you can track in the Tickets tab",
            "Service-failure refund if our system doesn't deliver",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <CheckCircle2 className="size-4 text-snappeal-success flex-shrink-0 mt-0.5" />
              <span className="text-xs text-snappeal-navy leading-relaxed">
                {item}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Stripe Payment Element */}
      <StripePaymentForm
        sessionId={sessionId}
        returnUrl="/app/letter/appeal-001"
      />
    </div>
  );
}
