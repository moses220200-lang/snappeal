"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { SnappealMark } from "@/components/Logo";

function UkFlag({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 30" className={className} aria-hidden>
      <clipPath id="snappeal-uk-clip">
        <rect width="60" height="30" rx="15" />
      </clipPath>
      <g clipPath="url(#snappeal-uk-clip)">
        <rect width="60" height="30" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#ffffff" strokeWidth="6" />
        <path
          d="M0,0 L60,30 M60,0 L0,30"
          stroke="#C8102E"
          strokeWidth="4"
          clipPath="polygon(0 0, 50% 50%, 100% 0, 0 0)"
        />
        <path d="M30,0 v30 M0,15 h60" stroke="#ffffff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
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
 * Brand block: a blue Snappeal "S" shield (same identity as the marketing
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
      className="snappeal-glass sticky top-0 z-30 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3 px-5"
      data-scrolled={scrolled}
    >
      <div className="flex items-center justify-between gap-2">
        <Link href="/app" className="flex items-center gap-2.5 min-w-0 flex-1">
          <SnappealMark size={34} variant="dark" className="drop-shadow-sm shrink-0" />
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-[17px] font-bold text-snappeal-navy tracking-tight leading-none">
              Snappeal
            </span>
            <span className="text-[10.5px] text-snappeal-muted mt-1 leading-tight">
              Challenge your parking ticket in minutes
            </span>
          </div>
        </Link>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full bg-white border border-snappeal-border pl-0.5 pr-1.5 py-0.5 text-[11px] font-semibold text-snappeal-navy shadow-sm shrink-0 hover:bg-snappeal-bg transition"
        >
          <UkFlag className="size-[18px] rounded-full" />
          UK
          <ChevronDown className="size-3 text-snappeal-muted" strokeWidth={2.5} />
        </button>
      </div>
      {(title || subtitle) && (
        <div className="mt-4">
          {title && (
            <h1 className="text-3xl font-bold text-snappeal-navy tracking-tight">{title}</h1>
          )}
          {subtitle && <p className="mt-1 text-sm text-snappeal-muted">{subtitle}</p>}
        </div>
      )}
    </div>
  );
}

