"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";

/**
 * Slim sticky back-arrow header used by every page that isn't a top-level
 * tab (capture, notes, paywall, letter, ticket detail, profile sub-pages,
 * sign-in, sign-up).
 *
 * Same liquid-glass treatment as AppHeader so the status bar never collides
 * with content underneath. `back` defaults to `router.back()`; pass an
 * explicit href to override (e.g. profile sub-pages link to /app/profile).
 */
export function BackHeader({
  title,
  subtitle,
  back,
}: {
  title: string;
  subtitle?: string;
  back?: string;
}) {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const BackButton = back ? (
    <Link
      href={back}
      aria-label="Back"
      className="size-9 rounded-full border border-parkingrabbit-border bg-white/70 flex items-center justify-center text-parkingrabbit-muted hover:text-parkingrabbit-navy transition"
    >
      <ChevronLeft className="size-5" />
    </Link>
  ) : (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="Back"
      className="size-9 rounded-full border border-parkingrabbit-border bg-white/70 flex items-center justify-center text-parkingrabbit-muted hover:text-parkingrabbit-navy transition"
    >
      <ChevronLeft className="size-5" />
    </button>
  );

  return (
    <div
      // Sticky in normal flow (no negative top-margin). Reserves its own
      // height — including the iOS safe-area inset — so the first content
      // card below can never slide under it during overscroll bounce.
      className="parkingrabbit-glass sticky top-0 z-30 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3 px-5"
      data-scrolled={scrolled}
    >
      <div className="flex items-center gap-3">
        {BackButton}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-parkingrabbit-navy truncate">{title}</h1>
          {subtitle && <p className="text-xs text-parkingrabbit-muted mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
