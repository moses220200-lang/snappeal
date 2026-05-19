"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";

/**
 * Standard in-app page header — sticky at the top with a frosted-glass
 * (backdrop-blur) background that intensifies once the page has scrolled
 * past its threshold. Matches the iOS 17+ "Liquid Glass" pattern so the
 * status bar never collides with content underneath.
 *
 * Pages with their own back-arrow header (capture, notes, paywall, letter,
 * ticket detail, /sign-in, /sign-up, profile sub-pages) skip this in
 * favour of the slim back-arrow pattern.
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
      className="snappeal-glass sticky top-0 z-30 -mt-[env(safe-area-inset-top,0px)] pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3 px-5"
      data-scrolled={scrolled}
    >
      <div className="flex items-center justify-between">
        <Link href="/app" className="flex items-center gap-2.5">
          <ShieldP />
          <div className="flex flex-col">
            <span className="text-lg font-bold text-snappeal-navy leading-none">Snappeal</span>
            <span className="text-[11px] text-snappeal-muted mt-0.5">
              Challenge your parking ticket in minutes
            </span>
          </div>
        </Link>
        <span className="inline-flex items-center gap-1 rounded-full bg-white/80 border border-snappeal-border px-2.5 py-1 text-[11px] font-semibold text-snappeal-navy backdrop-blur">
          <MapPin className="size-3 text-snappeal-primary" />
          UK
        </span>
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

function ShieldP() {
  return (
    <svg width="34" height="38" viewBox="0 0 34 38" className="flex-shrink-0" aria-hidden>
      <path
        d="M17 1.5 L31.5 6.5 V21 C31.5 29 25 35 17 36.5 C9 35 2.5 29 2.5 21 V6.5 Z"
        fill="#0a1929"
      />
      <text
        x="17"
        y="24"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="18"
        fontWeight={800}
        textAnchor="middle"
        fill="#ffffff"
        letterSpacing={-0.5}
      >
        P
      </text>
    </svg>
  );
}
