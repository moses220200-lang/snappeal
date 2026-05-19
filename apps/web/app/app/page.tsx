"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Camera,
  ChevronRight,
  Clock,
  FileText,
  Image as ImageIcon,
  Keyboard,
  Lightbulb,
  Loader2,
  MapPin,
  Scale,
  Send,
  Sparkles,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { HorizontalTimeline } from "@/components/HorizontalTimeline";
import { WinRateRing } from "@/components/WinRateRing";
import { Confetti } from "@/components/Confetti";
import { getOrCreateSessionId, setServiceTier } from "@/lib/client/session";
import type { AppealRecord } from "@/lib/server/appeals";

export default function AppHome() {
  const [appeals, setAppeals] = useState<AppealRecord[] | null>(null);
  const [latest, setLatest] = useState<AppealRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sessionId = getOrCreateSessionId();
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/appeals?sessionId=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const json = (await res.json()) as { appeals: AppealRecord[] };
        if (!alive) return;
        setAppeals(json.appeals);
        const live = json.appeals.find(
          (a) => a.status !== "cancelled" && a.status !== "rejected",
        );
        setLatest(live ?? json.appeals[0] ?? null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const wins = (appeals ?? []).filter((a) => a.status === "cancelled").length;
  const losses = (appeals ?? []).filter((a) => a.status === "rejected").length;
  const justWon = (appeals ?? []).find((a) => a.status === "cancelled");

  return (
    <>
      <AppHeader />
      <Confetti trigger={justWon?.id ?? null} />
      <div className="flex flex-col gap-4 px-5 pb-6">
        <StartAppealHero wins={wins} losses={losses} />
        <PricingTiers />
        <CaptureShortcuts />
        {loading ? (
          <div className="rounded-2xl border border-snappeal-border bg-white p-6 flex items-center justify-center gap-2 text-sm text-snappeal-muted">
            <Loader2 className="size-4 animate-spin" /> Checking for tickets…
          </div>
        ) : latest ? (
          <LatestTicket appeal={latest} />
        ) : null}
        <HowItWorksCompact />
        <Link
          href="/app/tips"
          className="rounded-2xl bg-green-50 p-4 flex items-start gap-3 hover:bg-green-100 transition"
        >
          <span className="size-9 rounded-full bg-green-100 text-green-700 flex items-center justify-center flex-shrink-0">
            <Lightbulb className="size-[1.125rem]" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-bold text-snappeal-navy">Success tips</p>
            <p className="text-xs text-snappeal-muted mt-0.5 leading-snug">
              Appeals are most successful when submitted within 28 days of the
              issue date.
            </p>
          </div>
          <span className="text-xs font-semibold text-green-700 self-center whitespace-nowrap rounded-full bg-white border border-green-200 px-2.5 py-1">
            View tips
          </span>
        </Link>
      </div>
    </>
  );
}

function StartAppealHero({ wins, losses }: { wins: number; losses: number }) {
  const showRing = wins + losses > 0;
  return (
    <section className="relative overflow-hidden rounded-3xl bg-snappeal-navy text-white p-6">
      {showRing && (
        <div className="absolute right-5 top-5 z-10">
          <WinRateRing wins={wins} losses={losses} size={72} />
        </div>
      )}
      <div
        aria-hidden
        className={`absolute -right-4 -top-2 size-44 pointer-events-none ${showRing ? "opacity-25" : "opacity-90"}`}
      >
        <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="60" y="36" width="92" height="124" rx="6" fill="white" opacity="0.95" />
          <rect x="74" y="56" width="50" height="3" rx="1.5" fill="#cbd5e1" />
          <rect x="74" y="68" width="66" height="3" rx="1.5" fill="#cbd5e1" />
          <rect x="74" y="80" width="40" height="3" rx="1.5" fill="#cbd5e1" />
          <rect x="74" y="92" width="60" height="3" rx="1.5" fill="#cbd5e1" />
          <rect x="74" y="104" width="46" height="3" rx="1.5" fill="#cbd5e1" />
          <g transform="translate(122 104)">
            <path
              d="M0 0 L 32 9 V 36 C 32 50 22 60 16 64 C 10 60 0 50 0 36 Z"
              fill="#007aff"
            />
            <path
              d="M8 36 L 14 42 L 24 30"
              stroke="white"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </g>
        </svg>
      </div>
      <div className="relative max-w-[58%]">
        <h2 className="text-2xl font-bold leading-tight tracking-tight">
          Start an Appeal
        </h2>
        <p className="mt-2 text-sm text-white/80 leading-snug">
          Check your ticket and let us help you fight it.
        </p>
        <Link
          href="/app/capture"
          className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-snappeal-action text-white font-semibold px-5 py-3 text-sm shadow-lg shadow-snappeal-action/40 hover:bg-snappeal-action-600 transition"
        >
          Start an Appeal
          <ChevronRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}

function PricingTiers() {
  const router = useRouter();
  const pick = (tier: "buy_time" | "grounds" | "care_plan") => {
    setServiceTier(tier);
    if (tier === "care_plan") return; // coming soon — no action
    router.push("/app/capture");
  };
  const tiers = [
    {
      id: "buy_time" as const,
      title: "Buy time",
      price: "Free",
      caption: "Holding challenge",
      icon: Clock,
      tone: "bg-snappeal-success/10 border-snappeal-success/30 text-snappeal-navy",
      priceTone: "text-snappeal-success",
    },
    {
      id: "grounds" as const,
      title: "Full appeal",
      price: "£2.99",
      caption: "AI-drafted",
      icon: Scale,
      tone: "bg-snappeal-primary-50 border-snappeal-primary-200 text-snappeal-navy",
      priceTone: "text-snappeal-primary",
    },
    {
      id: "care_plan" as const,
      title: "Care Plan",
      price: "£9.99",
      caption: "/mo · unlimited appeals",
      icon: Sparkles,
      tone: "bg-snappeal-navy text-white border-snappeal-navy",
      priceTone: "text-white",
    },
  ];
  return (
    <section>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-snappeal-muted mb-2 px-1">
        Pick your appeal plan
      </p>
      <div className="grid grid-cols-3 gap-2">
        {tiers.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => pick(t.id)}
            disabled={t.id === "care_plan"}
            className={`rounded-2xl border p-3 text-left flex flex-col gap-1.5 transition active:scale-[0.97] disabled:opacity-90 disabled:cursor-not-allowed ${t.tone}`}
          >
            <span className={`size-8 rounded-lg flex items-center justify-center ${t.id === "care_plan" ? "bg-white/15" : "bg-white"}`}>
              <t.icon className={`size-4 ${t.id === "care_plan" ? "text-white" : "text-snappeal-primary"}`} />
            </span>
            <p className={`text-xs font-bold ${t.id === "care_plan" ? "text-white" : "text-snappeal-navy"}`}>
              {t.title}
            </p>
            <p className={`text-base font-bold leading-none ${t.priceTone}`}>{t.price}</p>
            <p className={`text-[10px] ${t.id === "care_plan" ? "text-white/70" : "text-snappeal-muted"}`}>
              {t.caption}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}

function CaptureShortcuts() {
  const methods = [
    { icon: Camera, title: "Scan Ticket", href: "/app/capture", sub: "Use camera to scan your ticket" },
    { icon: ImageIcon, title: "Upload Photos", href: "/app/capture", sub: "Upload clear photos of your ticket" },
    { icon: Keyboard, title: "Enter PCN", href: "/app/capture", sub: "Type in your PCN manually" },
  ];
  return (
    <section className="rounded-2xl bg-white border border-snappeal-border p-4">
      <p className="text-sm font-bold text-snappeal-navy mb-3">
        Add your parking ticket
      </p>
      <div className="grid grid-cols-3 gap-2">
        {methods.map(({ icon: Icon, title, href, sub }) => (
          <Link
            key={title}
            href={href}
            className="flex flex-col items-center gap-1.5 rounded-xl p-3 hover:bg-snappeal-primary-50 transition"
          >
            <span className="size-12 rounded-xl bg-snappeal-primary-100 text-snappeal-primary flex items-center justify-center">
              <Icon className="size-5" />
            </span>
            <p className="text-[12px] font-bold text-snappeal-navy text-center leading-tight">
              {title}
            </p>
            <p className="text-[10px] text-snappeal-muted leading-tight text-center px-1">
              {sub}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function LatestTicket({ appeal }: { appeal: AppealRecord }) {
  const issued = appeal.ticket?.issuedAt
    ? new Date(appeal.ticket.issuedAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : new Date(appeal.createdAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
  return (
    <Link
      href={`/app/tickets/${appeal.id}`}
      className="block rounded-2xl bg-white border border-snappeal-border p-4 hover:border-snappeal-primary transition"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-snappeal-primary uppercase tracking-wide">
            Latest ticket
          </p>
          <p className="text-lg font-bold text-snappeal-navy truncate mt-0.5">
            {appeal.ticket ? `PCN #${appeal.ticket.pcnRef}` : "Draft appeal"}
          </p>
          <p className="text-[11px] text-snappeal-muted mt-1 flex items-center gap-1.5">
            <MapPin className="size-3" />
            {appeal.ticket?.issuer ?? "Awaiting capture"} · Issued {issued}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="rounded-full bg-snappeal-primary-100 text-snappeal-primary-700 text-[10px] font-bold uppercase tracking-wide px-2 py-1">
            {appeal.status === "submitted" ? "Submitted" : "In progress"}
          </span>
        </div>
      </div>
      <HorizontalTimeline steps={appeal.timeline} />
    </Link>
  );
}

function HowItWorksCompact() {
  const steps = [
    { n: 1, icon: Upload, title: "Upload ticket", body: "Scan or upload your parking ticket" },
    { n: 2, icon: FileText, title: "We draft your appeal", body: "AI builds a strong, tailored appeal" },
    { n: 3, icon: Send, title: "Submit and track", body: "We submit it for you and keep you updated" },
  ];
  return (
    <section className="rounded-2xl bg-white border border-snappeal-border p-4">
      <p className="text-sm font-bold text-snappeal-navy mb-4">How it works</p>
      <ol className="grid grid-cols-3 gap-2 relative">
        {steps.map((step) => (
          <li key={step.n} className="relative flex flex-col items-center text-center">
            <div className="relative">
              <span className="size-14 rounded-2xl bg-snappeal-primary-100 text-snappeal-primary flex items-center justify-center mb-2">
                <step.icon className="size-6" />
              </span>
              <span className="absolute -top-1 -right-1 size-6 rounded-full bg-snappeal-primary text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
                {step.n}
              </span>
            </div>
            <p className="text-[12px] font-bold text-snappeal-navy mt-1 leading-tight">
              {step.n}. {step.title}
            </p>
            <p className="text-[10px] text-snappeal-muted mt-1 leading-tight">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
