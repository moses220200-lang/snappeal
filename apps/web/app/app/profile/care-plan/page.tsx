"use client";

import { useEffect, useState } from "react";
import { getOrCreateSessionId } from "@/lib/client/session";
import { Check, Loader2, ShieldCheck, Sparkles, Wrench, Zap } from "lucide-react";
import { ProfileSubPage } from "@/components/ProfileSubPage";

interface CarePlanSub {
  id: string;
  status: string;
  product: string;
  pricePence: number;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: string;
}

/**
 * Care Plan upsell + waitlist signup. The Subscription product itself is
 * scaffolded — UI only — until the Stripe Subscription + webhook wiring
 * lands (see #19 in the project task list).
 */
const BENEFITS = [
  {
    icon: Zap,
    title: "Unlimited grounds-based appeals",
    body: "Every full appeal is included — £0 marginal cost per ticket once you're on the plan.",
  },
  {
    icon: ShieldCheck,
    title: "90% appeal-rate guarantee",
    body: "If we don't win at least 9 of your last 10 valid grounds-based appeals, the next month is free.",
  },
  {
    icon: Wrench,
    title: "Roadside invoice recovery",
    body: "Disputed clamp / removal / pound charges — we'll draft and submit the recovery claim too.",
  },
  {
    icon: Sparkles,
    title: "Priority queue + concierge",
    body: "Your submissions skip the queue and have a real human on call within working hours.",
  },
];

export default function CarePlanPage() {
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sub, setSub] = useState<CarePlanSub | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [meRes, subRes] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch("/api/subscriptions/care-plan", { cache: "no-store" }),
      ]);
      if (!alive) return;
      if (meRes.ok) {
        const j = (await meRes.json()) as { user: unknown };
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSignedIn(Boolean(j.user));
      }
      if (subRes.ok) {
        const j = (await subRes.json()) as { subscription: CarePlanSub | null };
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSub(j.subscription);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const subscribe = async () => {
    setSubscribing(true);
    try {
      const res = await fetch("/api/subscriptions/care-plan", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Subscribe failed (${res.status})`);
      }
      const json = await res.json();
      if (json.checkoutUrl) {
        window.location.href = json.checkoutUrl;
        return;
      }
      setSub(json.subscription as CarePlanSub);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Subscribe failed");
    } finally {
      setSubscribing(false);
    }
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/care-plan/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          sessionId: getOrCreateSessionId(),
          source: "profile_page",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Waitlist join failed (${res.status})`);
      }
      setJoined(true);
    } finally {
      setSaving(false);
    }
  };


  return (
    <ProfileSubPage title="Care Plan" subtitle="Unlimited appeals · £9.99/mo · coming soon.">
      <section className="rounded-3xl bg-gradient-to-br from-snappeal-primary to-snappeal-primary-700 text-white p-6">
        <p className="text-[11px] uppercase tracking-wide text-white/70">Subscription</p>
        <p className="mt-1 text-5xl font-bold tracking-tight">£9.99</p>
        <p className="text-sm text-white/80 mt-1">per month · cancel any time</p>
      </section>

      <ul className="flex flex-col gap-2.5">
        {BENEFITS.map((b) => (
          <li key={b.title} className="rounded-2xl bg-white border border-snappeal-border p-4 flex items-start gap-3">
            <span className="size-10 rounded-xl bg-snappeal-primary-100 text-snappeal-primary flex items-center justify-center flex-shrink-0">
              <b.icon className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-snappeal-navy">{b.title}</p>
              <p className="text-xs text-snappeal-muted mt-0.5 leading-relaxed">{b.body}</p>
            </div>
          </li>
        ))}
      </ul>

      {sub && (sub.status === "active" || sub.status === "trialing") ? (
        <div className="rounded-2xl bg-green-50 border border-green-200 p-5 flex items-start gap-3">
          <Check className="size-5 text-green-700 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-green-900">Care Plan active</p>
            <p className="text-xs text-green-800/80 mt-0.5">
              Unlimited grounds-based appeals included.{" "}
              {sub.currentPeriodEnd && (
                <>Renews {new Date(sub.currentPeriodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.</>
              )}
              {sub.cancelAtPeriodEnd === "true" && " Will cancel at period end."}
            </p>
          </div>
        </div>
      ) : signedIn ? (
        <button
          type="button"
          onClick={subscribe}
          disabled={subscribing}
          className="rounded-2xl bg-snappeal-action text-white font-semibold py-4 flex items-center justify-center gap-2 shadow-lg shadow-snappeal-action/40 hover:bg-snappeal-action-600 transition disabled:opacity-60"
        >
          {subscribing ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Starting checkout…
            </>
          ) : (
            <>
              <Sparkles className="size-5" />
              Start Care Plan · £9.99/mo
            </>
          )}
        </button>
      ) : joined ? (
        <div className="rounded-2xl bg-green-50 border border-green-200 p-5 flex items-start gap-3">
          <Check className="size-5 text-green-700 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-green-900">You&apos;re on the waitlist</p>
            <p className="text-xs text-green-800/80 mt-0.5">
              We&apos;ll email <span className="font-semibold">{email}</span> the moment Care Plan goes live.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={join} className="rounded-2xl bg-white border border-snappeal-border p-5 flex flex-col gap-3">
          <p className="text-sm font-bold text-snappeal-navy">Join the waitlist</p>
          <p className="text-xs text-snappeal-muted leading-relaxed">
            We&apos;re finishing the billing wiring. Drop your email and we&apos;ll let you know first.
          </p>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded-xl bg-white border border-snappeal-border focus:border-snappeal-primary px-3 py-2.5 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-2xl bg-snappeal-action text-white font-semibold py-3.5 flex items-center justify-center gap-2 shadow-lg shadow-snappeal-action/40 hover:bg-snappeal-action-600 transition disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Join the waitlist
          </button>
        </form>
      )}
    </ProfileSubPage>
  );
}
