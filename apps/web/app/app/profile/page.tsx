"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Car,
  ChevronRight,
  CreditCard,
  HelpCircle,
  Loader2,
  LogIn,
  LogOut,
  Lock,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  UserPlus,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { getOrCreateSessionId } from "@/lib/client/session";
import type { AppealRecord } from "@/lib/server/appeals";

interface Me {
  id: string;
  email: string;
  displayName: string | null;
  role: "user" | "admin";
}

const SECTIONS_ACCOUNT = [
  { icon: UserIcon, label: "Personal details", href: "/app/profile/personal-details" },
  { icon: Car, label: "Vehicles", href: "/app/profile/vehicles" },
  { icon: Bell, label: "Notification preferences", href: "/app/profile/notifications" },
  { icon: CreditCard, label: "Payment methods", href: "/app/profile/payment-methods" },
];

const SECTIONS_HELP = [
  { icon: HelpCircle, label: "Help & Support", href: "/app/profile/help" },
  { icon: Lock, label: "Privacy & Security", href: "/privacy" },
  { icon: ScrollText, label: "Terms & Conditions", href: "/terms" },
];

export default function ProfilePage() {
  const router = useRouter();
  const [appeals, setAppeals] = useState<AppealRecord[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const sessionId = getOrCreateSessionId();
        const [meRes, appealsRes] = await Promise.all([
          fetch("/api/auth/me", { cache: "no-store" }),
          fetch(`/api/appeals?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" }),
        ]);
        if (!alive) return;
        if (meRes.ok) {
          const json = (await meRes.json()) as { user: Me | null };
          setMe(json.user);
        }
        if (appealsRes.ok) {
          const json = (await appealsRes.json()) as { appeals: AppealRecord[] };
          setAppeals(json.appeals);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const stats = useMemo(() => {
    const all = appeals ?? [];
    const total = all.length;
    const won = all.filter((a) => a.status === "cancelled").length;
    const inProgress = all.filter((a) =>
      ["draft", "ready", "submitting", "submitted", "under_review", "decision_pending"].includes(a.status),
    ).length;
    return { total, won, inProgress };
  }, [appeals]);

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
    } finally {
      setMe(null);
      setSigningOut(false);
      router.refresh();
    }
  };

  return (
    <>
      <AppHeader title="Profile" />
      <div className="px-5 pb-6 flex flex-col gap-4">
        {loading ? (
          <div className="rounded-2xl bg-white border border-parkingrabbit-border p-5 flex items-center gap-2 text-sm text-parkingrabbit-muted">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : me ? (
          <SignedInCard user={me} />
        ) : (
          <GuestCard />
        )}

        {/* Auth controls — pulled to the top of the page so customers see
         *  sign-in / sign-up immediately (guest) and signed-in users can
         *  log out without scrolling past everything else. */}
        {me ? (
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            className="rounded-2xl bg-white border border-red-200 text-parkingrabbit-action font-semibold px-5 py-3.5 flex items-center justify-between hover:bg-red-50 transition disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              {signingOut ? <Loader2 className="size-5 animate-spin" /> : <LogOut className="size-5" />}
              {signingOut ? "Signing out…" : "Sign out"}
            </span>
            <ChevronRight className="size-5" />
          </button>
        ) : (
          <>
            <Link
              href="/sign-in"
              className="rounded-2xl bg-white border border-parkingrabbit-border text-parkingrabbit-navy font-semibold px-5 py-3.5 flex items-center justify-between hover:border-parkingrabbit-primary transition"
            >
              <span className="flex items-center gap-2">
                <LogIn className="size-5 text-parkingrabbit-primary" />
                Sign in
              </span>
              <ChevronRight className="size-5 text-parkingrabbit-muted" />
            </Link>
            <Link
              href="/sign-up"
              className="rounded-2xl bg-parkingrabbit-action !text-white font-semibold px-5 py-3.5 flex items-center justify-between shadow-lg shadow-parkingrabbit-action/40 hover:bg-parkingrabbit-action-600 transition"
            >
              <span className="flex items-center gap-2 text-white">
                <UserPlus className="size-5 text-white" />
                <span className="text-white">Create an account</span>
              </span>
              <ChevronRight className="size-5 text-white" />
            </Link>
          </>
        )}

        {me?.role === "admin" && (
          <Link
            href="/admin"
            className="rounded-2xl bg-parkingrabbit-navy !text-white p-4 flex items-center gap-3 hover:bg-parkingrabbit-navy-soft transition shadow-lg shadow-parkingrabbit-navy/30"
          >
            <span className="size-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
              <ShieldAlert className="size-5 text-white" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">Open admin dashboard</p>
              <p className="text-xs text-white/70 mt-0.5">
                Appeals · Councils · Submissions · Auto-Submit Agent · Jobs · Users
              </p>
            </div>
            <ChevronRight className="size-5 text-white/80" />
          </Link>
        )}

        {/* Appeal stats — pulled above the Account/Help sections so the
         *  customer's three numbers are the first thing they see after
         *  their identity card. */}
        <section className="rounded-2xl bg-white border border-parkingrabbit-border p-4">
          <p className="text-sm font-bold text-parkingrabbit-navy mb-3">Appeal stats</p>
          <div className="grid grid-cols-3 gap-2">
            <StatTile icon={ScrollText} value={stats.total} label="Total appeals" />
            <StatTile icon={ShieldCheck} value={stats.won} label="Won" tone="success" />
            <StatTile icon={Loader2} value={stats.inProgress} label="In progress" tone="primary" />
          </div>
        </section>

        <Section title="Account">
          {SECTIONS_ACCOUNT.map(({ icon: Icon, label, href }) => (
            <Row key={label} icon={Icon} label={label} href={href} />
          ))}
        </Section>

        <Section title="Help">
          {SECTIONS_HELP.map(({ icon: Icon, label, href }) => (
            <Row key={label} icon={Icon} label={label} href={href} />
          ))}
        </Section>

        <Link
          href="/app/profile/care-plan"
          className="rounded-2xl bg-gradient-to-br from-parkingrabbit-primary to-parkingrabbit-primary-700 text-white p-4 flex items-start gap-3 hover:shadow-lg hover:shadow-parkingrabbit-primary/30 transition"
        >
          <span className="size-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="size-5 text-white" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-bold">ParkingRabbit Care Plan</p>
            <p className="text-xs text-white/80 mt-0.5 leading-relaxed">
              £9.99/mo · unlimited grounds-based appeals · 90% appeal-rate guarantee · roadside invoice recovery
            </p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wide rounded-full bg-white/15 px-2 py-1 self-center whitespace-nowrap">
            Coming Soon
          </span>
        </Link>

        <div className="text-center text-[11px] text-parkingrabbit-muted py-2">
          ParkingRabbit · © 2026
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <ul className="rounded-2xl bg-white border border-parkingrabbit-border overflow-hidden divide-y divide-parkingrabbit-border">
      <li className="px-4 py-2 bg-parkingrabbit-bg/60">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-parkingrabbit-muted">{title}</p>
      </li>
      {children}
    </ul>
  );
}

function Row({
  icon: Icon,
  label,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
}) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-parkingrabbit-bg/40 transition">
        <span className="size-9 rounded-xl bg-parkingrabbit-primary-100 text-parkingrabbit-primary flex items-center justify-center flex-shrink-0">
          <Icon className="size-[1.125rem]" />
        </span>
        <p className="flex-1 text-sm font-semibold text-parkingrabbit-navy">{label}</p>
        <ChevronRight className="size-4 text-parkingrabbit-muted" />
      </Link>
    </li>
  );
}

function StatTile({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  label: string;
  tone?: "primary" | "success";
}) {
  const iconBg =
    tone === "success"
      ? "bg-green-100 text-green-700"
      : "bg-parkingrabbit-primary-100 text-parkingrabbit-primary";
  return (
    <div className="rounded-2xl bg-parkingrabbit-bg/50 p-3">
      <span className={`size-9 rounded-xl ${iconBg} flex items-center justify-center mb-2`}>
        <Icon className="size-5" />
      </span>
      <p className="text-2xl font-bold text-parkingrabbit-navy leading-none">{value}</p>
      <p className="text-[11px] text-parkingrabbit-muted mt-1">{label}</p>
    </div>
  );
}

function GuestCard() {
  return (
    <section className="rounded-2xl bg-white border border-parkingrabbit-border p-5 flex items-center gap-4">
      <span className="size-14 rounded-full bg-parkingrabbit-primary-100 text-parkingrabbit-primary flex items-center justify-center">
        <UserIcon className="size-7" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-parkingrabbit-navy">Guest</p>
        <p className="text-xs text-parkingrabbit-muted mt-0.5">
          Your appeals live on this device. Create an account to sync across devices and track replies.
        </p>
      </div>
    </section>
  );
}

function SignedInCard({ user }: { user: Me }) {
  const initial = (user.displayName || user.email)[0]?.toUpperCase() ?? "U";
  return (
    <section className="rounded-2xl bg-white border border-parkingrabbit-border p-5 flex items-center gap-4">
      <span className="size-14 rounded-full bg-parkingrabbit-primary-100 text-parkingrabbit-primary flex items-center justify-center text-lg font-bold">
        {initial}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-parkingrabbit-navy">{user.displayName ?? "ParkingRabbit user"}</p>
        <p className="text-xs text-parkingrabbit-muted truncate">{user.email}</p>
        <span
          className={`mt-1.5 inline-flex items-center gap-1 rounded-full text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 ${
            user.role === "admin"
              ? "bg-parkingrabbit-navy !text-white"
              : "bg-green-100 text-green-700"
          }`}
        >
          <ShieldCheck className={`size-3 ${user.role === "admin" ? "text-white" : ""}`} />
          <span className={user.role === "admin" ? "text-white" : ""}>
            {user.role === "admin" ? "Admin" : "Verified driver"}
          </span>
        </span>
      </div>
    </section>
  );
}
