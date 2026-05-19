import Link from "next/link";
import {
  Camera,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Keyboard,
  Lightbulb,
  MapPin,
  Send,
  Upload,
} from "lucide-react";
import { appeals, user } from "@/lib/mock-data";
import { HorizontalTimeline } from "@/components/HorizontalTimeline";

export default function AppHome() {
  const live = appeals.find(
    (a) => a.status !== "cancelled" && a.status !== "rejected",
  );

  return (
    <div className="flex flex-col gap-5 pt-5 px-4">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-snappeal-navy">
            Hello, {user.displayName} 👋
          </h1>
          <p className="text-xs text-snappeal-muted mt-0.5">
            Challenge your parking ticket in minutes
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-white border border-snappeal-border px-2.5 py-1 text-[11px] font-semibold text-snappeal-navy">
          <MapPin className="size-3 text-snappeal-primary" />
          London
        </span>
      </header>

      {/* Start an Appeal hero */}
      <StartAppealHero />

      {/* Add your parking ticket — 3 capture shortcuts */}
      <CaptureShortcuts />

      {/* Latest case */}
      {live && <LatestCase appeal={live} />}

      {/* How it works (3 short steps) */}
      <HowItWorksCompact />

      {/* Success tips */}
      <Link
        href="#"
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
  );
}

function StartAppealHero() {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-snappeal-navy text-white p-6">
      {/* Decorative shield illustration top-right */}
      <div
        aria-hidden
        className="absolute -right-6 -top-2 size-44 opacity-90 pointer-events-none"
      >
        <svg
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Stylised document */}
          <rect
            x="60"
            y="40"
            width="90"
            height="120"
            rx="6"
            fill="white"
            opacity="0.95"
          />
          <rect x="72" y="58" width="50" height="3" rx="1.5" fill="#cbd5e1" />
          <rect x="72" y="70" width="66" height="3" rx="1.5" fill="#cbd5e1" />
          <rect x="72" y="82" width="40" height="3" rx="1.5" fill="#cbd5e1" />
          <rect x="72" y="94" width="60" height="3" rx="1.5" fill="#cbd5e1" />
          <rect x="72" y="106" width="46" height="3" rx="1.5" fill="#cbd5e1" />
          {/* Shield with check overlapping */}
          <g transform="translate(120 100)">
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

      <div className="relative max-w-[60%]">
        <h2 className="text-2xl font-bold leading-tight tracking-tight">
          Start an Appeal
        </h2>
        <p className="mt-2 text-sm text-white/80 leading-snug">
          Check your ticket and let us help you fight it.
        </p>
        <Link
          href="/app/capture"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-snappeal-primary text-white font-semibold px-5 py-3 text-sm shadow-lg shadow-snappeal-primary/40 hover:bg-snappeal-primary-600 transition"
        >
          Start an Appeal
          <ChevronRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}

function CaptureShortcuts() {
  const methods = [
    {
      icon: Camera,
      title: "Scan Ticket",
      href: "/app/capture",
      sub: "Use camera",
    },
    {
      icon: ImageIcon,
      title: "Upload Photos",
      href: "/app/capture",
      sub: "From library",
    },
    {
      icon: Keyboard,
      title: "Enter PCN",
      href: "/app/capture",
      sub: "Manually",
    },
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
            <p className="text-[10px] text-snappeal-muted leading-tight">
              {sub}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function LatestCase({ appeal }: { appeal: (typeof appeals)[number] }) {
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
            PCN #{appeal.ticket.pcnRef}
          </p>
          <p className="text-[11px] text-snappeal-muted mt-1 flex items-center gap-1.5">
            <MapPin className="size-3" />
            {appeal.ticket.issuer} · Issued{" "}
            {new Date(appeal.ticket.issuedAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="rounded-full bg-snappeal-primary-100 text-snappeal-primary-700 text-[10px] font-bold uppercase tracking-wide px-2 py-1">
            Appeal in progress
          </span>
        </div>
      </div>

      <HorizontalTimeline steps={appeal.timeline} />
    </Link>
  );
}

function HowItWorksCompact() {
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
    <section className="rounded-2xl bg-white border border-snappeal-border p-4">
      <p className="text-sm font-bold text-snappeal-navy mb-4">How it works</p>
      <ol className="grid grid-cols-3 gap-2 relative">
        {steps.map((step, i) => (
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
            {i < steps.length - 1 && (
              <ChevronRight
                aria-hidden
                className="hidden absolute size-4 text-snappeal-border top-5 -right-1.5"
              />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
