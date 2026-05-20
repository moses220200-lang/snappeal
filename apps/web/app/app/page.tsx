"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Camera,
  ChevronRight,
  FileText,
  Gauge,
  Image as ImageIcon,
  Keyboard,
  Loader2,
  MapPin,
  Scale,
  Send,
  Shield,
  ShieldCheck,
  Star,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { HorizontalTimeline } from "@/components/HorizontalTimeline";
import { Confetti } from "@/components/Confetti";
import { RealisticPcnInWallet } from "@/components/SnappealSplash";
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

  const justWon = (appeals ?? []).find((a) => a.status === "cancelled");

  return (
    <>
      <AppHeader />
      <Confetti trigger={justWon?.id ?? null} />
      <div className="flex flex-col gap-6 px-5 pt-3 pb-6">
        <ChallengeHero />
        <PricingTiers />
        <CaptureShortcuts />
        {loading ? (
          <div className="rounded-3xl border border-snappeal-border bg-white p-6 flex items-center justify-center gap-2 text-sm text-snappeal-muted">
            <Loader2 className="size-4 animate-spin" /> Checking for tickets…
          </div>
        ) : latest ? (
          <ActiveAppeal appeal={latest} />
        ) : null}
        <HowItWorks />
        <SuccessTip />
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Hero — dark-navy gradient card with the headline + CTA on the left and
 * a stylised phone-with-PCN illustration on the right.
 * ──────────────────────────────────────────────────────────────────────── */
function ChallengeHero() {
  return (
    <section className="relative overflow-hidden rounded-[28px] text-white shadow-lg shadow-snappeal-navy/15">
      {/* Layered gradient — top-left lighter navy fading to near-black at the
       *  bottom-right keeps the card feeling premium without being flat. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,#13315c_0%,#0a1f3a_45%,#050d18_100%)]"
      />
      {/* Subtle dotted pattern on the right half. */}
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 w-2/3 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.18) 1px, transparent 0)",
          backgroundSize: "14px 14px",
        }}
      />
      <div className="relative flex items-stretch p-5 sm:p-6 min-h-[210px]">
        <div className="flex flex-col justify-center max-w-[58%] gap-3">
          <h2 className="text-[28px] font-bold leading-[1.08] tracking-tight">
            Challenge
            <br />
            a ticket
          </h2>
          <p className="text-[13px] text-white/75 leading-snug">
            Scan your PCN and we&apos;ll help you build your appeal.
          </p>
          <Link
            href="/app/capture"
            className="mt-2 inline-flex items-center justify-between gap-2 rounded-2xl bg-snappeal-primary text-white font-semibold px-5 py-3 text-sm shadow-lg shadow-snappeal-primary/40 hover:bg-snappeal-primary-600 transition w-fit min-w-[150px]"
          >
            Start Appeal
            <ChevronRight className="size-4" strokeWidth={2.5} />
          </Link>
        </div>
        <HeroScanAnimation className="absolute right-3 sm:right-4 top-3 bottom-3 w-[44%] max-w-[170px]" />
      </div>
    </section>
  );
}

/**
 * Looping scan animation reused on the hero — same visual language as the
 * one-shot splash. Yellow Westminster PCN ticket framed by white viewfinder
 * brackets while a blue AI scan-line sweeps top → bottom forever.
 */
function HeroScanAnimation({ className = "" }: { className?: string }) {
  return (
    <div className={`${className} pointer-events-none`}>
      <div className="relative w-full h-full flex items-center justify-center">
        {/* Yellow PCN ticket — same SVG used by the splash */}
        <div
          className="relative w-[82%] origin-center"
          style={{ filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.45))" }}
        >
          <RealisticPcnInWallet />
        </div>

        {/* Viewfinder brackets — track the ticket bounds */}
        <div className="absolute inset-1 pointer-events-none">
          <span className="absolute top-0 left-0 size-7 border-t-[3px] border-l-[3px] border-white/85 rounded-tl-lg" />
          <span className="absolute top-0 right-0 size-7 border-t-[3px] border-r-[3px] border-white/85 rounded-tr-lg" />
          <span className="absolute bottom-0 left-0 size-7 border-b-[3px] border-l-[3px] border-white/85 rounded-bl-lg" />
          <span className="absolute bottom-0 right-0 size-7 border-b-[3px] border-r-[3px] border-white/85 rounded-br-lg" />
        </div>

        {/* Looping blue scan line */}
        <div className="snappeal-hero-scan absolute inset-0 pointer-events-none">
          <div
            className="absolute left-2 right-2 h-1 rounded-full"
            style={{
              background:
                "linear-gradient(180deg, transparent 0%, rgba(0,122,255,0.95) 50%, transparent 100%)",
              boxShadow:
                "0 0 14px 4px rgba(0,122,255,0.55), 0 0 26px 8px rgba(0,122,255,0.3)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Plan picker — three equal-height cards. Full Appeal is highlighted.
 * ──────────────────────────────────────────────────────────────────────── */
function PricingTiers() {
  const router = useRouter();
  const pick = (tier: "buy_time" | "grounds" | "care_plan") => {
    setServiceTier(tier);
    if (tier === "care_plan") return;
    router.push("/app/capture");
  };
  return (
    <section>
      <h3 className="text-[15px] font-bold text-snappeal-navy mb-3">
        Choose your plan
      </h3>
      <div className="grid grid-cols-3 gap-2.5 items-stretch">
        <PlanCard
          onClick={() => pick("buy_time")}
          icon={<Gauge className="size-5" strokeWidth={2} />}
          title="Quick Check"
          price="Free"
          caption="Basic ticket review"
        />
        <PlanCard
          onClick={() => pick("grounds")}
          icon={<Scale className="size-5" strokeWidth={2} />}
          title="Full Appeal"
          price="£2.99"
          caption="AI-drafted appeal"
          highlighted
        />
        <PlanCard
          onClick={() => pick("care_plan")}
          icon={<Shield className="size-5" strokeWidth={2} />}
          title="Care Plan"
          price="£9.99"
          caption="Unlimited appeals"
        />
      </div>
    </section>
  );
}

function PlanCard({
  onClick,
  icon,
  title,
  price,
  caption,
  highlighted = false,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  price: string;
  caption: string;
  highlighted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-2xl p-3 text-left flex flex-col gap-2 transition active:scale-[0.97] h-full ${
        highlighted
          ? "bg-snappeal-primary-50/60 border-2 border-snappeal-primary shadow-md shadow-snappeal-primary/15"
          : "bg-white border border-snappeal-border"
      }`}
    >
      {highlighted && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-snappeal-primary text-white text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 shadow-md shadow-snappeal-primary/30 whitespace-nowrap">
          <Star className="size-2.5" strokeWidth={2.5} fill="white" />
          Most Popular
        </span>
      )}
      <span className="size-9 rounded-xl bg-snappeal-primary-50 text-snappeal-primary flex items-center justify-center">
        {icon}
      </span>
      <p className="text-[12px] font-bold text-snappeal-navy leading-tight">
        {title}
      </p>
      <p className="text-[18px] font-bold leading-none text-snappeal-primary">
        {price}
      </p>
      <p className="text-[10px] text-snappeal-muted leading-tight">{caption}</p>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Add ticket — three actions in one card, separated by faint dividers.
 * ──────────────────────────────────────────────────────────────────────── */
function CaptureShortcuts() {
  const methods = [
    {
      icon: Camera,
      title: "Scan Ticket",
      href: "/app/capture",
      sub: "Use camera to scan your ticket",
    },
    {
      icon: ImageIcon,
      title: "Upload Photos",
      href: "/app/capture",
      sub: "Upload clear photos of your ticket",
    },
    {
      icon: Keyboard,
      title: "Enter PCN",
      href: "/app/manual-entry",
      sub: "Type in your PCN manually",
    },
  ];
  return (
    <section>
      <h3 className="text-[15px] font-bold text-snappeal-navy mb-3">
        Add your parking ticket
      </h3>
      <div className="rounded-3xl bg-white border border-snappeal-border p-2">
        <div className="grid grid-cols-3 divide-x divide-snappeal-border">
          {methods.map(({ icon: Icon, title, href, sub }) => (
            <Link
              key={title}
              href={href}
              className="flex flex-col items-center gap-2 px-2 py-3 hover:bg-snappeal-primary-50/40 rounded-xl transition"
            >
              <span className="size-11 rounded-xl bg-snappeal-primary-50 text-snappeal-primary flex items-center justify-center">
                <Icon className="size-5" strokeWidth={1.75} />
              </span>
              <p className="text-[12px] font-bold text-snappeal-navy text-center leading-tight">
                {title}
              </p>
              <p className="text-[10px] text-snappeal-muted leading-tight text-center">
                {sub}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Active appeal — top section with status pill, then 4-step timeline.
 * ──────────────────────────────────────────────────────────────────────── */
function ActiveAppeal({ appeal }: { appeal: AppealRecord }) {
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
  const statusLabel =
    appeal.status === "submitted"
      ? "Submitted"
      : appeal.status === "under_review" || appeal.status === "decision_pending"
        ? "Under review"
        : appeal.status === "cancelled"
          ? "Cancelled"
          : appeal.status === "rejected"
            ? "Rejected"
            : "In progress";
  return (
    <Link
      href={`/app/tickets/${appeal.id}`}
      className="block rounded-3xl bg-white border border-snappeal-border p-5 hover:border-snappeal-primary/60 transition"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-bold text-snappeal-navy">
          Active appeal
        </h3>
        <span className="rounded-full bg-snappeal-primary-50 text-snappeal-primary text-[10px] font-bold uppercase tracking-wide px-2.5 py-1">
          {statusLabel}
        </span>
      </div>
      <p className="text-[20px] font-bold text-snappeal-navy mt-2 truncate">
        {appeal.ticket ? `PCN #${appeal.ticket.pcnRef}` : "Draft appeal"}
      </p>
      <p className="text-[12px] text-snappeal-muted mt-1 flex items-center gap-1.5">
        <MapPin className="size-3.5" strokeWidth={2} />
        {appeal.ticket?.issuer ?? "Awaiting capture"}
        <span className="text-snappeal-border">·</span>
        Issued {issued}
      </p>
      <div className="mt-5">
        <HorizontalTimeline steps={appeal.timeline} showDates />
      </div>
    </Link>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * How it works — three mini steps with numbered badges in blue circles.
 * ──────────────────────────────────────────────────────────────────────── */
function HowItWorks() {
  const steps = [
    {
      n: 1,
      icon: Upload,
      title: "Upload ticket",
      body: "Scan or upload your parking ticket",
    },
    {
      n: 2,
      icon: FileText,
      title: "We draft your appeal",
      body: "AI builds a strong, tailored appeal",
    },
    {
      n: 3,
      icon: Send,
      title: "Submit and track",
      body: "We submit it for you and keep you updated",
    },
  ];
  return (
    <section className="rounded-3xl bg-white border border-snappeal-border p-5">
      <h3 className="text-[15px] font-bold text-snappeal-navy mb-4">
        How it works
      </h3>
      <ol className="grid grid-cols-3 gap-2">
        {steps.map((step) => (
          <li
            key={step.n}
            className="relative flex flex-col items-center text-center"
          >
            <div className="relative">
              <span className="size-14 rounded-full bg-snappeal-primary-50 text-snappeal-primary flex items-center justify-center">
                <step.icon className="size-6" strokeWidth={1.75} />
              </span>
              <span className="absolute -top-1 -right-1 size-6 rounded-full bg-snappeal-primary text-white text-[11px] font-bold flex items-center justify-center shadow-sm border-2 border-white">
                {step.n}
              </span>
            </div>
            <p className="text-[12px] font-bold text-snappeal-navy mt-3 leading-tight">
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

/* ─────────────────────────────────────────────────────────────────────────
 * Success tip — light green card pinned at the bottom of the page.
 * ──────────────────────────────────────────────────────────────────────── */
function SuccessTip() {
  return (
    <Link
      href="/app/tips"
      className="rounded-3xl bg-snappeal-success-soft border border-snappeal-success/25 p-4 flex items-center gap-3 hover:bg-green-100/70 transition"
    >
      <span className="size-10 rounded-full bg-white border border-snappeal-success/30 text-snappeal-success flex items-center justify-center flex-shrink-0">
        <ShieldCheck className="size-5" strokeWidth={2} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-snappeal-success">
          Success tip
        </p>
        <p className="text-[11px] text-snappeal-navy/80 mt-0.5 leading-snug">
          Appeals are most successful when submitted within 28 days of issue
          date.
        </p>
      </div>
      <span className="inline-flex items-center gap-1 rounded-full bg-white border border-snappeal-success/40 text-snappeal-success text-[11px] font-semibold px-3 py-1.5 whitespace-nowrap">
        View tips
        <ArrowRight className="size-3.5" strokeWidth={2} />
      </span>
    </Link>
  );
}
