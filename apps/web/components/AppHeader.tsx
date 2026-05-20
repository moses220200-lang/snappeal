"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { SnappealMark } from "@/components/Logo";

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
      <div className="flex items-center justify-between gap-3">
        <Link href="/app" className="flex items-center gap-3 min-w-0">
          <SnappealMark size={38} variant="dark" className="drop-shadow-sm" />
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-lg font-bold text-snappeal-navy tracking-tight">
              Snappeal
            </span>
            <span className="text-[11px] text-snappeal-muted mt-0.5 truncate">
              Challenge your parking ticket in minutes
            </span>
          </div>
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-snappeal-border px-3 py-1.5 text-[11px] font-semibold text-snappeal-navy shadow-sm shrink-0">
          <MapPin className="size-3.5 text-snappeal-primary" strokeWidth={2.25} />
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

