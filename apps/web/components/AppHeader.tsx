"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ParkingRabbitMark } from "@/components/Logo";

/**
 * Square Union Jack badge — used inside the UK pill. Drawn into a square
 * viewBox so when the surrounding `<svg>` is rendered at e.g. 18×18 it
 * stays a true circle (a 2:1 flag clipped with `rx=50%` produces a stadium
 * shape, which is why the earlier version looked off).
 */
function UkFlag({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 30" className={className} aria-hidden>
      <defs>
        <clipPath id="parkingrabbit-uk-clip">
          <circle cx="15" cy="15" r="15" />
        </clipPath>
      </defs>
      <g clipPath="url(#parkingrabbit-uk-clip)">
        {/* Navy field */}
        <rect width="30" height="30" fill="#012169" />
        {/* White diagonal saltire (St Andrew) */}
        <path d="M0 0 L30 30 M30 0 L0 30" stroke="#ffffff" strokeWidth="6" />
        {/* Red diagonal saltire (St Patrick) — thinner */}
        <path d="M0 0 L30 30 M30 0 L0 30" stroke="#C8102E" strokeWidth="3" />
        {/* White cross (St George) */}
        <path d="M15 0 V30 M0 15 H30" stroke="#ffffff" strokeWidth="9" />
        {/* Red cross (St George) — thinner */}
        <path d="M15 0 V30 M0 15 H30" stroke="#C8102E" strokeWidth="5" />
      </g>
    </svg>
  );
}

/**
 * Standard in-app page header — sticky at the top with a frosted-glass
 * (backdrop-blur) background that intensifies once the page has scrolled
 * past its threshold. Matches the iOS 17+ "Liquid Glass" pattern so the
 * status bar never collides with content underneath.
 *
 * Brand block: a blue ParkingRabbit "S" shield (same identity as the marketing
 * site) followed by the wordmark + tagline, then a small UK pill on the
 * right. Pages with their own back-arrow header (capture, notes, paywall,
 * letter, ticket detail, sign-in, sign-up, profile sub-pages) use the
 * slim back-arrow pattern instead.
 */
export function AppHeader({
  title,
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      // Sticky in normal flow (no negative margin). Reserves its own space
      // at the top of the page so the hero card below never slides under
      // it during overscroll bounce on iOS PWA. Safe-area buffer is added
      // INSIDE the element so the iOS time/Dynamic Island can never collide
      // with the wordmark.
      className="parkingrabbit-glass sticky top-0 z-30 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3 px-5"
      data-scrolled={scrolled}
    >
      <div className="flex items-center justify-between gap-2">
        <Link href="/app" className="flex items-center gap-2.5 min-w-0 flex-1">
          <ParkingRabbitMark size={46} variant="dark" className="shrink-0" />
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-[17px] font-bold text-parkingrabbit-navy tracking-tight leading-none">
              ParkingRabbit
            </span>
            <span className="text-[10.5px] text-parkingrabbit-muted mt-1 leading-tight">
              Manage parking tickets quickly
            </span>
          </div>
        </Link>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full bg-white border border-parkingrabbit-border pl-0.5 pr-1.5 py-0.5 text-[11px] font-semibold text-parkingrabbit-navy shadow-sm shrink-0 hover:bg-parkingrabbit-bg transition"
        >
          <UkFlag className="size-[18px] rounded-full" />
          UK
          <ChevronDown className="size-3 text-parkingrabbit-muted" strokeWidth={2.5} />
        </button>
      </div>
      {(title || subtitle) && (
        <div className="mt-4">
          {title && (
            <h1 className="text-3xl font-bold text-parkingrabbit-navy tracking-tight">{title}</h1>
          )}
          {subtitle && <p className="mt-1 text-sm text-parkingrabbit-muted">{subtitle}</p>}
        </div>
      )}
    </div>
  );
}

