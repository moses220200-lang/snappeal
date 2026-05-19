import Link from "next/link";
import { Apple, CheckCircle2, ChevronLeft, CreditCard, Lock } from "lucide-react";

export default function PaywallPage() {
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
          What &apos;s included
        </p>
        <ul className="space-y-2.5">
          {[
            "AI-drafted appeal citing the right ground and contravention code",
            "Submitted directly to your council's portal (or by email)",
            "Status timeline you can track in the Cases tab",
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

      {/* Payment methods */}
      <section className="flex flex-col gap-2.5">
        <button className="rounded-2xl bg-black text-white font-semibold py-4 flex items-center justify-center gap-2 hover:opacity-90 transition">
          <Apple className="size-5" fill="currentColor" />
          Pay
        </button>
        <button className="rounded-2xl bg-white border-2 border-snappeal-navy text-snappeal-navy font-semibold py-4 flex items-center justify-center gap-2 hover:bg-slate-50 transition">
          <span className="font-bold">G</span> Pay
        </button>
        <button className="rounded-2xl bg-white border border-snappeal-border text-snappeal-navy font-semibold py-3.5 flex items-center justify-center gap-2 hover:border-snappeal-primary transition">
          <CreditCard className="size-4" />
          Pay with card
        </button>
      </section>

      <div className="flex items-center justify-center gap-2 text-[11px] text-snappeal-muted">
        <Lock className="size-3.5" />
        Payments are processed securely by Stripe.
      </div>

      <div className="mt-auto pt-2 text-[11px] text-snappeal-muted text-center leading-relaxed">
        <strong className="text-snappeal-navy">Mock data prototype.</strong> No
        payment is taken. In production this triggers a Stripe PaymentIntent.{" "}
        <Link href="/app/letter/appeal-001" className="text-snappeal-primary font-semibold">
          Continue to letter (demo)
        </Link>
      </div>
    </div>
  );
}
