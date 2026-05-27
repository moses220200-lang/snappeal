"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Apple, Smartphone, X } from "lucide-react";

const DISMISSED_KEY = "parkingrabbit.installBanner.dismissedAt";
const DISMISS_FOR_DAYS = 7;

type Variant = "landing" | "app";

/**
 * Elegant, dismissible install banner.
 *
 * Two presentations, same component:
 *   - `variant="landing"` — sticky footer on the public site, slides up
 *     from the bottom. Shows when a user lands on the marketing page
 *     in a browser (i.e. hasn't installed yet).
 *   - `variant="app"` — inline card at the top of /app, slides down from
 *     the safe-top inset. Reminds web-PWA users that the App Store /
 *     Play Store wrapper exists for the v0.3 native experience.
 *
 * Lifecycle:
 *   - Hidden if running in standalone (display-mode: standalone, iOS or
 *     installed PWA) — they already have the app.
 *   - Hidden for 7 days after the user dismisses it.
 *   - Captures `beforeinstallprompt` so the "Install" button can prompt
 *     directly on Chromium browsers.
 */
export function InstallBanner({ variant = "landing" }: { variant?: Variant }) {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  // Landing variant only shows on landing-style pages (/, /privacy, /terms).
  // Inside /app the floating banner would overlap the bottom nav.
  const landingScope =
    !pathname || pathname === "/" || pathname === "/privacy" || pathname === "/terms";
  const outOfScope = variant === "landing" && !landingScope;

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already running as an installed app? Don't pester.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari uses a separate flag
      (window.navigator as IOSNavigator).standalone === true;
    if (standalone) return;

    // Recently dismissed? Don't pester.
    try {
      const dismissedAt = window.localStorage.getItem(DISMISSED_KEY);
      if (dismissedAt) {
        const ageMs = Date.now() - Number(dismissedAt);
        if (ageMs < DISMISS_FOR_DAYS * 24 * 60 * 60 * 1000) return;
      }
    } catch {
      // localStorage blocked — show once anyway
    }

    // Same mount-once pattern as the splash — the new react-hooks rule
    // has a false positive on conditional state-flipping inside the
    // post-mount effect. (See ParkingRabbitSplash for the matching note.)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(true);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (outOfScope || !show) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  const triggerInstall = async () => {
    if (!installPrompt) {
      // No native prompt available (Safari / iOS) — open instructions
      window.alert(
        "On iPhone: tap the Share icon, then 'Add to Home Screen'.\n" +
          "On Android: tap the menu, then 'Install app'.",
      );
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setShow(false);
  };

  /* ── Landing variant: sticky footer card ─────────────────────────── */
  if (variant === "landing") {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 safe-bottom px-4 pb-3 pointer-events-none">
        <div
          role="dialog"
          aria-label="Install ParkingRabbit"
          className="pointer-events-auto mx-auto max-w-2xl rounded-2xl bg-parkingrabbit-navy text-white shadow-2xl shadow-black/30 border border-white/10 overflow-hidden animate-[install-slide-up_400ms_cubic-bezier(0.22,1,0.36,1)_both]"
        >
          <div className="flex items-center gap-4 px-5 py-4">
            <ShieldGlyph />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-tight">
                Install ParkingRabbit
              </p>
              <p className="text-xs text-white/65 mt-0.5">
                Add to your home screen for one-tap access — or get the
                native app.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <NativeBadge href="#install-ios" provider="ios" />
              <NativeBadge href="#install-android" provider="android" />
            </div>
            <button
              type="button"
              onClick={triggerInstall}
              className="hidden sm:inline rounded-xl bg-parkingrabbit-primary text-white text-sm font-semibold px-4 py-2.5 hover:bg-parkingrabbit-primary-600 transition whitespace-nowrap"
            >
              Install
            </button>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="size-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition"
            >
              <X className="size-4" />
            </button>
          </div>
          {/* Mobile install row stacked below */}
          <div className="flex sm:hidden items-center gap-2 px-5 pb-4">
            <button
              type="button"
              onClick={triggerInstall}
              className="flex-1 rounded-xl bg-parkingrabbit-primary text-white text-sm font-semibold py-2.5 hover:bg-parkingrabbit-primary-600 transition"
            >
              Install ParkingRabbit
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── App variant: inline card at the top of /app ─────────────────── */
  return (
    <div className="rounded-2xl bg-parkingrabbit-navy text-white shadow-md border border-white/5 overflow-hidden animate-[install-fade-in_400ms_cubic-bezier(0.22,1,0.36,1)_both]">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <ShieldGlyph small />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight">Get the app</p>
          <p className="text-[11px] text-white/65 mt-0.5">
            ParkingRabbit lives best on your home screen.
          </p>
        </div>
        <button
          type="button"
          onClick={triggerInstall}
          className="rounded-lg bg-parkingrabbit-primary text-white text-xs font-semibold px-3 py-2 hover:bg-parkingrabbit-primary-600 transition whitespace-nowrap"
        >
          Install
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="size-7 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────── */

function ShieldGlyph({ small = false }: { small?: boolean }) {
  const size = small ? 32 : 40;
  return (
    <svg
      width={size}
      height={(size * 72) / 64}
      viewBox="0 0 64 72"
      aria-hidden
      className="flex-shrink-0"
    >
      <path
        d="M32 2 L60 10 V36 C60 52 49 64 32 70 C15 64 4 52 4 36 V10 Z"
        fill="#007aff"
      />
      <text
        x="32"
        y="46"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="32"
        fontWeight={700}
        textAnchor="middle"
        fill="#ffffff"
        letterSpacing={-1}
      >
        S
      </text>
    </svg>
  );
}

function NativeBadge({
  href,
  provider,
}: {
  href: string;
  provider: "ios" | "android";
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg bg-white/10 hover:bg-white/15 transition px-2.5 py-1.5 text-white"
    >
      {provider === "ios" ? (
        <Apple className="size-3.5" fill="currentColor" />
      ) : (
        <Smartphone className="size-3.5" />
      )}
      <span className="text-[10px] font-medium leading-tight">
        {provider === "ios" ? "App Store" : "Play"}
        <br />
        <span className="text-white/55">Coming soon</span>
      </span>
    </Link>
  );
}

/* ── DOM types ───────────────────────────────────────────────────── */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

interface IOSNavigator extends Navigator {
  standalone?: boolean;
}
