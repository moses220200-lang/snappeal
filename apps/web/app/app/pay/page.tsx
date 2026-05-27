"use client";

/**
 * Pay-a-ticket flow.
 *
 * ParkingRabbit collects the PCN details from the customer, shows a payment
 * summary (ticket amount + service fee), and — once Stripe is wired — fires
 * a Stripe Checkout session to take the combined charge on the customer's
 * behalf. Until Stripe is configured, the pay button surfaces a clear
 * "Stripe payments are not connected yet" placeholder instead of erroring.
 *
 * Status mirrors the brief's data model:
 *   draft → awaiting_payment → payment_pending → paid_by_user
 *   → paid_to_issuer → completed | failed
 *
 * Anything Stripe-shaped is TODO and documented inline below.
 */

import { useMemo, useState } from "react";
import { ChevronRight, CreditCard, Loader2, Lock, ShieldCheck } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";

// ParkingRabbit's flat service-fee for the pay path. Surfaced both on the
// homepage action card and at the bottom of the summary.
const SERVICE_FEE_PENCE = 199;

type FormState = {
  pcnNumber: string;
  vehicleReg: string;
  issuer: string;
  amountDue: string; // user-entered, parsed to pence later
  discountDeadline: string; // YYYY-MM-DD or ""
  finalDeadline: string;
};

const EMPTY_FORM: FormState = {
  pcnNumber: "",
  vehicleReg: "",
  issuer: "",
  amountDue: "",
  discountDeadline: "",
  finalDeadline: "",
};

export default function PayTicketPage() {
  const [step, setStep] = useState<"form" | "review">("form");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [authorised, setAuthorised] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amountDuePence = useMemo(() => {
    const trimmed = form.amountDue.trim().replace(/^£/, "");
    const n = parseFloat(trimmed);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100);
  }, [form.amountDue]);

  const totalPence = amountDuePence + SERVICE_FEE_PENCE;

  const canContinue =
    form.pcnNumber.trim().length > 0 &&
    form.vehicleReg.trim().length > 0 &&
    form.issuer.trim().length > 0 &&
    amountDuePence > 0;

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handlePay = async () => {
    if (!authorised) return;
    setBusy(true);
    setStripeError(null);
    try {
      // TODO(stripe): once STRIPE_SECRET_KEY + price IDs are wired —
      //   const session = await createStripeCheckoutSession({
      //     ticketId, amountDue: amountDuePence, serviceFee: SERVICE_FEE_PENCE,
      //     totalAmount: totalPence,
      //   });
      //   redirectToStripeCheckout(session.url);
      // Until then, surface a friendly placeholder so the screen doesn't 500.
      await new Promise((r) => setTimeout(r, 600));
      setStripeError(
        "Stripe payments are not connected yet. This screen is ready for checkout once payments are enabled.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <BackHeader
        title="Pay a ticket"
        subtitle={
          step === "form"
            ? "Step 1 of 2 · Ticket details"
            : "Step 2 of 2 · Review & pay"
        }
        back="/app"
      />
      <div className="flex flex-col gap-5 px-5 pt-4 pb-6">

        {step === "form" ? (
          <>
            <section className="rounded-2xl bg-white border border-parkingrabbit-border p-4">
              <p className="text-sm font-bold text-parkingrabbit-navy">
                Your PCN details
              </p>
              <p className="text-[11px] text-parkingrabbit-muted mt-1 leading-snug">
                Upload your PCN and we&apos;ll prepare the payment. You stay in
                control — we only pay once you authorise it.
              </p>
              <div className="mt-4 grid gap-3">
                <Field
                  label="PCN reference"
                  placeholder="WC12345678"
                  value={form.pcnNumber}
                  onChange={(v) => update("pcnNumber", v.toUpperCase())}
                />
                <Field
                  label="Vehicle registration"
                  placeholder="AB12 CDE"
                  value={form.vehicleReg}
                  onChange={(v) => update("vehicleReg", v.toUpperCase())}
                />
                <Field
                  label="Issuer (council or operator)"
                  placeholder="Westminster City Council"
                  value={form.issuer}
                  onChange={(v) => update("issuer", v)}
                />
                <Field
                  label="Amount due"
                  placeholder="65.00"
                  value={form.amountDue}
                  onChange={(v) => update("amountDue", v)}
                  prefix="£"
                  inputMode="decimal"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Discount deadline"
                    placeholder=""
                    value={form.discountDeadline}
                    onChange={(v) => update("discountDeadline", v)}
                    type="date"
                  />
                  <Field
                    label="Final deadline"
                    placeholder=""
                    value={form.finalDeadline}
                    onChange={(v) => update("finalDeadline", v)}
                    type="date"
                  />
                </div>
              </div>
            </section>

            <button
              type="button"
              disabled={!canContinue}
              onClick={() => setStep("review")}
              className="rounded-2xl bg-parkingrabbit-primary text-white font-semibold py-4 hover:bg-parkingrabbit-primary-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              Review payment
              <ChevronRight className="size-4" strokeWidth={2.5} />
            </button>
          </>
        ) : (
          <>
            <section className="rounded-3xl bg-white border border-parkingrabbit-border p-5">
              <div className="flex items-start gap-3">
                <span className="size-11 rounded-2xl bg-parkingrabbit-primary text-white flex items-center justify-center shrink-0">
                  <CreditCard className="size-5" strokeWidth={2} />
                </span>
                <div>
                  <p className="text-[15px] font-bold text-parkingrabbit-navy leading-tight">
                    Pay your PCN
                  </p>
                  <p className="text-[11.5px] text-parkingrabbit-muted mt-1 leading-snug">
                    Review the details — nothing is paid until you tap
                    Authorise &amp; Pay.
                  </p>
                </div>
              </div>

              <dl className="mt-5 pt-4 border-t border-parkingrabbit-border grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                <Row dt="Issuer" dd={form.issuer} />
                <Row dt="PCN reference" dd={form.pcnNumber} />
                <Row dt="Vehicle" dd={form.vehicleReg} />
                {form.discountDeadline && (
                  <Row dt="Discount deadline" dd={form.discountDeadline} />
                )}
                {form.finalDeadline && (
                  <Row dt="Final deadline" dd={form.finalDeadline} />
                )}
              </dl>

              <dl className="mt-5 pt-4 border-t border-parkingrabbit-border grid gap-2 text-[13px]">
                <SummaryLine label="Ticket amount" value={formatPence(amountDuePence)} />
                <SummaryLine
                  label="ParkingRabbit service fee"
                  value={formatPence(SERVICE_FEE_PENCE)}
                />
                <div className="border-t border-parkingrabbit-border pt-2 mt-1 flex items-center justify-between">
                  <span className="font-bold text-parkingrabbit-navy">Total to pay</span>
                  <span className="text-lg font-extrabold text-parkingrabbit-primary">
                    {formatPence(totalPence)}
                  </span>
                </div>
              </dl>
            </section>

            <label className="flex items-start gap-3 rounded-2xl bg-parkingrabbit-primary-50/60 border border-parkingrabbit-primary/20 px-4 py-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={authorised}
                onChange={(e) => setAuthorised(e.target.checked)}
                className="mt-0.5 size-4 accent-parkingrabbit-primary shrink-0"
              />
              <span className="text-[12px] text-parkingrabbit-navy leading-snug">
                I authorise ParkingRabbit to pay this ticket on my behalf using
                the details provided.
              </span>
            </label>

            {stripeError && (
              <p className="text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 leading-snug">
                {stripeError}
              </p>
            )}

            <button
              type="button"
              onClick={handlePay}
              disabled={!authorised || busy}
              className="rounded-2xl bg-parkingrabbit-primary text-white font-bold py-4 hover:bg-parkingrabbit-primary-600 transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-parkingrabbit-primary/40"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Preparing checkout…
                </>
              ) : (
                <>
                  <Lock className="size-4" strokeWidth={2.5} />
                  Authorise &amp; pay {formatPence(totalPence)}
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setStep("form")}
              className="text-xs text-parkingrabbit-muted hover:text-parkingrabbit-navy py-1.5"
            >
              ← Back to edit details
            </button>

            <p className="text-center text-[10.5px] text-parkingrabbit-muted flex items-center justify-center gap-1.5">
              <ShieldCheck className="size-3 text-parkingrabbit-success" strokeWidth={2.5} />
              Secure payment via Stripe · Apple Pay · Google Pay · Card
            </p>
          </>
        )}
      </div>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  prefix,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  prefix?: string;
  type?: string;
  inputMode?: "decimal" | "numeric" | "text";
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-parkingrabbit-muted">
        {label}
      </span>
      <span className="relative inline-flex items-center">
        {prefix && (
          <span className="absolute left-3 text-parkingrabbit-muted text-sm font-semibold pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          type={type}
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-xl bg-parkingrabbit-bg/60 border border-transparent focus:border-parkingrabbit-primary focus:bg-white px-3 py-2.5 text-sm font-medium text-parkingrabbit-navy outline-none transition ${
            prefix ? "pl-7" : ""
          }`}
        />
      </span>
    </label>
  );
}

function Row({ dt, dd }: { dt: string; dd: string }) {
  return (
    <div>
      <dt className="text-parkingrabbit-muted">{dt}</dt>
      <dd className="font-semibold text-parkingrabbit-navy truncate">{dd || "—"}</dd>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-parkingrabbit-navy">
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function formatPence(p: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    p / 100,
  );
}
