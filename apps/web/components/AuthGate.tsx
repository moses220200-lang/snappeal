"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Lock, LogIn, ShieldCheck, UserPlus } from "lucide-react";

interface Me {
  id: string;
  email: string;
  displayName: string | null;
  role: "user" | "admin";
}

interface AuthGateProps {
  /** Headline shown to guests. */
  title?: string;
  /** Sub-headline. */
  subtitle?: string;
  /** Bullet list of "what you get". */
  benefits?: string[];
  /** Slot shown when the user IS authenticated. */
  children: React.ReactNode;
}

/**
 * Wraps a sensitive action (pay, submit) behind a signed-in check.
 *
 * Guests see a friendly "Create your free ParkingRabbit account" card with
 * `?next=` honouring redirect to wherever they came from. Signed-in users
 * see the slotted children unmodified.
 */
export function AuthGate(props: AuthGateProps) {
  // `useSearchParams` requires a Suspense boundary during static prerender.
  return (
    <Suspense fallback={<GateLoading />}>
      <AuthGateInner {...props} />
    </Suspense>
  );
}

function AuthGateInner({
  title = "Create your free ParkingRabbit account",
  subtitle = "You'll need an account to file an appeal — even the free Buy Time tier. Your tickets sync across devices, council replies land in your inbox, and you can pick up where you left off on any phone.",
  benefits = [
    "Free Buy Time appeals — protect your 14-day discount window",
    "Sync your tickets across every device",
    "Inbox alerts when the council replies",
  ],
  children,
}: AuthGateProps) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const params = useSearchParams();
  const next = encodeURIComponent(`${pathname}${params?.toString() ? `?${params.toString()}` : ""}`);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!alive) return;
        if (res.ok) {
          const json = (await res.json()) as { user: Me | null };
          setMe(json.user);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <GateLoading />;

  if (me) return <>{children}</>;

  return (
    <section className="rounded-3xl bg-white border border-snappeal-border p-6 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="size-11 rounded-2xl bg-snappeal-primary-100 text-snappeal-primary flex items-center justify-center flex-shrink-0">
          <Lock className="size-5" />
        </span>
        <div>
          <p className="text-base font-bold text-snappeal-navy">{title}</p>
          <p className="text-xs text-snappeal-muted mt-1 leading-relaxed">{subtitle}</p>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {benefits.map((b) => (
          <li key={b} className="flex items-start gap-2.5 text-xs text-snappeal-navy">
            <CheckCircle2 className="size-4 text-snappeal-success flex-shrink-0 mt-0.5" />
            <span className="leading-relaxed">{b}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 mt-2">
        <Link
          href={`/sign-up?next=${next}`}
          className="rounded-2xl bg-snappeal-action text-white font-semibold py-3.5 flex items-center justify-center gap-2 shadow-lg shadow-snappeal-action/40 hover:bg-snappeal-action-600 transition"
        >
          <UserPlus className="size-5" />
          Create free account
        </Link>
        <Link
          href={`/sign-in?next=${next}`}
          className="rounded-2xl bg-white border border-snappeal-border text-snappeal-navy font-semibold py-3.5 flex items-center justify-center gap-2 hover:border-snappeal-primary transition"
        >
          <LogIn className="size-5 text-snappeal-primary" />
          I already have an account
        </Link>
        <p className="text-[11px] text-snappeal-muted text-center flex items-center justify-center gap-1.5 mt-1">
          <ShieldCheck className="size-3" />
          We never share your email. No marketing.
        </p>
      </div>
    </section>
  );
}

function GateLoading() {
  return (
    <div className="rounded-2xl bg-white border border-snappeal-border p-6 flex items-center justify-center gap-2 text-sm text-snappeal-muted">
      <Loader2 className="size-4 animate-spin" />
      Checking your session…
    </div>
  );
}
