"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Apple, CreditCard, Loader2 } from "lucide-react";
import { ProfileSubPage } from "@/components/ProfileSubPage";
import { getOrCreateSessionId } from "@/lib/client/session";
import type { AppealRecord } from "@/lib/server/appeals";

/**
 * v0.1 payment-methods view. ParkingRabbit doesn't store cards — payments go
 * through Stripe and authorise per appeal. This page surfaces the
 * payment history (Apple Pay / Google Pay / card per appeal) and the
 * upcoming Care Plan subscription.
 */
export default function PaymentMethodsPage() {
  const [appeals, setAppeals] = useState<AppealRecord[] | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await fetch(`/api/appeals?sessionId=${encodeURIComponent(getOrCreateSessionId())}`, {
        cache: "no-store",
      });
      if (!alive || !res.ok) return;
      const json = (await res.json()) as { appeals: AppealRecord[] };
      if (alive) setAppeals(json.appeals);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const paidAppeals = useMemo(
    () => (appeals ?? []).filter((a) => a.status !== "draft"),
    [appeals],
  );

  return (
    <ProfileSubPage
      title="Payment methods"
      subtitle="ParkingRabbit authorises payment per appeal — we never store your card."
    >
      <section className="rounded-2xl bg-white border border-snappeal-border p-4 flex items-start gap-3">
        <span className="size-10 rounded-xl bg-snappeal-primary-100 text-snappeal-primary flex items-center justify-center flex-shrink-0">
          <Apple className="size-5" fill="currentColor" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-snappeal-navy">Apple Pay & Google Pay</p>
          <p className="text-xs text-snappeal-muted mt-0.5 leading-relaxed">
            Native one-tap pay is the default at the paywall. Card entry is offered as a fallback.
          </p>
        </div>
      </section>

      <section className="rounded-2xl bg-white border border-snappeal-border p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-snappeal-navy">Payment history</p>
          <Link href="/app/tickets" className="text-xs font-semibold text-snappeal-primary">
            View tickets
          </Link>
        </div>
        {appeals == null ? (
          <div className="flex items-center gap-2 text-sm text-snappeal-muted">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : paidAppeals.length === 0 ? (
          <p className="text-xs text-snappeal-muted leading-relaxed">
            No payments yet. Charges only happen for grounds-based appeals (£2.99 each); Buy Time appeals are free.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {paidAppeals.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-xl bg-snappeal-bg/50 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-snappeal-navy truncate">
                    {a.ticket?.pcnRef ?? "Draft appeal"}
                  </p>
                  <p className="text-[11px] text-snappeal-muted">
                    {a.ticket?.issuer ?? "—"} · {new Date(a.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </p>
                </div>
                <p className="text-sm font-bold text-snappeal-navy">£2.99</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link
        href="/app/profile/care-plan"
        className="rounded-2xl bg-gradient-to-br from-snappeal-primary to-snappeal-primary-700 text-white p-4 flex items-start gap-3 hover:shadow-lg hover:shadow-snappeal-primary/30 transition"
      >
        <span className="size-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
          <CreditCard className="size-5" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-bold">Care Plan — £9.99/mo</p>
          <p className="text-xs text-white/80 mt-0.5">
            Unlimited grounds-based appeals included. Worth it from your 4th PCN.
          </p>
        </div>
      </Link>
    </ProfileSubPage>
  );
}
