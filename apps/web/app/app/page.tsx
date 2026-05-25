"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight, Scale } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Confetti } from "@/components/Confetti";
import { RealisticPcnInWallet } from "@/components/SnappealSplash";
import { getOrCreateSessionId } from "@/lib/client/session";
import type { AppealRecord } from "@/lib/server/appeals";

export default function AppHome() {
  // Fetch only so a fresh win (status=cancelled) fires Confetti when the
  // user lands on /app — the visible list itself lives on /app/tickets.
  const [appeals, setAppeals] = useState<AppealRecord[] | null>(null);

  useEffect(() => {
    const sessionId = getOrCreateSessionId();
    let alive = true;
    void (async () => {
      const res = await fetch(
        `/api/appeals?sessionId=${encodeURIComponent(sessionId)}`,
        { cache: "no-store" },
      );
      if (!res.ok || !alive) return;
      const json = (await res.json()) as { appeals: AppealRecord[] };
      setAppeals(json.appeals);
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
      <div className="flex flex-col gap-4 px-5 pt-3 pb-6">
        <ActionHero
          title="Scan PCN"
          subtitle="Scan your parking ticket and review your best options."
          ctaLabel="Start now"
          href="/app/tickets?scan=1"
          illustration={<ScanIllustration />}
        />
        <ActionHero
          title="Challenge it"
          subtitle="We draft your appeal and help you submit it."
          ctaLabel="Appeal"
          href="/app/tickets"
          illustration={<ChallengeIllustration />}
        />
        <ActionHero
          title="Pay a ticket"
          subtitle="Settle your PCN quickly and securely."
          ctaLabel="Pay now"
          href="/app/tickets"
          illustration={<PayIllustration />}
        />
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Reusable navy-gradient hero card: title + subtitle + CTA on the left,
 * illustration on the right. Mirrors the marketing band the user mocked
 * up — used three times on the home screen, one per primary action.
 * ──────────────────────────────────────────────────────────────────────── */
function ActionHero({
  title,
  subtitle,
  ctaLabel,
  href,
  illustration,
}: {
  title: ReactNode;
  subtitle: string;
  ctaLabel: string;
  href: string;
  illustration: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group relative block overflow-hidden rounded-[24px] text-white shadow-lg shadow-snappeal-navy/15 transition hover:brightness-110 active:scale-[0.99]"
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,#13315c_0%,#0a1f3a_45%,#050d18_100%)]"
      />
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 w-2/3 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.18) 1px, transparent 0)",
          backgroundSize: "14px 14px",
        }}
      />
      <div className="relative flex items-stretch p-5 min-h-[170px]">
        <div className="flex flex-col justify-center max-w-[58%] gap-2.5">
          <h2 className="text-[24px] font-bold leading-[1.1] tracking-tight">{title}</h2>
          <p className="text-[13px] text-white/75 leading-snug">{subtitle}</p>
          <span className="mt-1.5 inline-flex items-center justify-between gap-2 rounded-2xl bg-snappeal-primary text-white font-semibold px-4 py-2.5 text-sm shadow-lg shadow-snappeal-primary/40 w-fit min-w-[130px]">
            {ctaLabel}
            <ChevronRight className="size-4" strokeWidth={2.5} />
          </span>
        </div>
        <div className="absolute right-3 top-3 bottom-3 w-[42%] max-w-[160px]">
          {illustration}
        </div>
      </div>
    </Link>
  );
}

/* Hero 1 — yellow PCN ticket framed by viewfinder brackets with a looping
 * blue scan line. Reuses the splash ticket SVG. */
function ScanIllustration() {
  return (
    <div className="relative w-full h-full flex items-center justify-center pointer-events-none">
      <div
        className="relative w-[60%] origin-center"
        style={{ filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.45))" }}
      >
        <RealisticPcnInWallet />
      </div>
      <div className="absolute inset-1 pointer-events-none">
        <span className="absolute top-0 left-0 size-6 border-t-[3px] border-l-[3px] border-white/85 rounded-tl-lg" />
        <span className="absolute top-0 right-0 size-6 border-t-[3px] border-r-[3px] border-white/85 rounded-tr-lg" />
        <span className="absolute bottom-0 left-0 size-6 border-b-[3px] border-l-[3px] border-white/85 rounded-bl-lg" />
        <span className="absolute bottom-0 right-0 size-6 border-b-[3px] border-r-[3px] border-white/85 rounded-br-lg" />
      </div>
      <div className="absolute inset-1 overflow-hidden pointer-events-none">
        <div className="snappeal-hero-scan absolute inset-0">
          <div
            className="absolute left-1 right-1 h-1 rounded-full"
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

/* Hero 2 — a folded paper appeal letter with scales-of-justice seal and a
 * blue signature flourish at the bottom. */
function ChallengeIllustration() {
  return (
    <div className="relative w-full h-full flex items-center justify-center pointer-events-none">
      {/* Back paper — slightly offset, suggests a folder of evidence */}
      <div className="absolute right-[12%] top-[8%] bottom-[8%] w-[58%] rounded-lg bg-white/70 rotate-[6deg] shadow-xl" />
      {/* Front paper — the appeal letter itself */}
      <div className="relative w-[68%] aspect-[3/3.6] bg-white rounded-lg p-3 shadow-2xl flex flex-col">
        <div className="mx-auto size-9 rounded-full bg-snappeal-primary text-white flex items-center justify-center mb-2 shadow-md shadow-snappeal-primary/40">
          <Scale className="size-4.5" strokeWidth={2.25} />
        </div>
        <div className="space-y-1 flex-1">
          <div className="h-0.5 rounded-full bg-slate-300 w-full" />
          <div className="h-0.5 rounded-full bg-slate-300 w-11/12" />
          <div className="h-0.5 rounded-full bg-slate-300 w-4/5" />
          <div className="h-0.5 rounded-full bg-slate-300 w-full" />
          <div className="h-0.5 rounded-full bg-slate-300 w-3/4" />
        </div>
        <svg
          className="self-end mt-1"
          width="34"
          height="14"
          viewBox="0 0 34 14"
          aria-hidden
        >
          <path
            d="M1 9 Q5 1, 9 8 T17 7 Q22 3, 26 10 Q30 12, 33 5"
            stroke="#007aff"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

/* Hero 3 — PCN receipt card with a single circular blue £ badge overlapping
 * the top-right corner. */
function PayIllustration() {
  return (
    <div className="relative w-full h-full flex items-center justify-center pointer-events-none">
      <div className="relative w-[78%] bg-white rounded-lg p-3 shadow-2xl">
        <p className="text-[8px] font-bold text-slate-700 tracking-wide">PCN</p>
        <div className="mt-1.5 space-y-1">
          <div className="h-0.5 rounded-full bg-slate-200 w-full" />
          <div className="h-0.5 rounded-full bg-slate-200 w-5/6" />
          <div className="h-0.5 rounded-full bg-slate-200 w-2/3" />
        </div>
        <p className="text-[7px] text-slate-500 mt-2">Amount due</p>
        <p className="text-[11px] font-bold text-slate-900 leading-none">£80.00</p>
      </div>
      {/* £ circle overlapping the top-right corner of the card */}
      <div
        className="absolute size-10 rounded-full bg-snappeal-primary flex items-center justify-center text-white font-bold text-lg shadow-xl shadow-snappeal-primary/40"
        style={{ right: "4%", top: "18%" }}
      >
        £
      </div>
    </div>
  );
}

