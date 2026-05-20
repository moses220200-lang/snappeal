"use client";

import { useEffect, useState } from "react";
import { SnappealMark } from "@/components/Logo";

const SESSION_KEY = "snappeal.splashShown";

/**
 * Branded splash overlay that plays for ~3 seconds on the first page load
 * of a session, then fades away. Idempotent across navigations — uses
 * `sessionStorage` so it doesn't replay on every route change.
 *
 * Animation timeline (see `app/globals.css` for the keyframes):
 *   0.00–0.30s : Westminster PCN ticket flies in, settles at -8°.
 *   0.85–1.20s : Camera-shutter white flash.
 *   0.65–2.10s : Viewfinder brackets bracket the ticket then collapse.
 *   1.00–2.10s : Blue "AI scan" line sweeps top→bottom across the ticket.
 *   1.75–2.80s : Snappeal shield logo + wordmark fade up.
 *   2.40–2.85s : "Drafting your appeal" dots pulse.
 *   2.50–2.80s : Success tick pops in over the shield.
 *   2.85–3.05s : Whole overlay fades + becomes pointer-events:none.
 *
 * Respects `prefers-reduced-motion: reduce` — collapses to a quick fade.
 */
export function SnappealSplash() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem(SESSION_KEY) === "1") return;
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // sessionStorage blocked (privacy mode) — still play once.
    }
    // Triggering mount-once: the effect runs after first paint and flips
    // state to play the splash. This is the canonical pattern; the new
    // react-hooks/set-state-in-effect rule has a false positive here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const t = window.setTimeout(() => setMounted(false), 3100);
    return () => window.clearTimeout(t);
  }, []);

  if (!mounted) return null;

  return (
    <div
      aria-hidden
      className="snappeal-splash fixed inset-0 z-[100] flex items-center justify-center bg-snappeal-navy overflow-hidden"
    >
      {/* Subtle dotted grid behind the action */}
      <div
        className="absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Soft radial glow */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 50%, rgba(0,122,255,0.25) 0%, transparent 70%)",
        }}
      />

      {/* The ticket */}
      <div className="relative w-72 h-96 flex items-center justify-center">
        {/* PCN ticket — flat vector, Westminster-branded */}
        <div
          className="snappeal-splash-ticket absolute w-56 origin-center"
          style={{ filter: "drop-shadow(0 16px 32px rgba(0,0,0,0.5))" }}
        >
          <WestminsterPCN />
        </div>

        {/* Viewfinder brackets */}
        <div className="snappeal-splash-brackets absolute inset-4 pointer-events-none">
          <span className="absolute -top-1 -left-1 size-12 border-t-[3px] border-l-[3px] border-white rounded-tl-xl" />
          <span className="absolute -top-1 -right-1 size-12 border-t-[3px] border-r-[3px] border-white rounded-tr-xl" />
          <span className="absolute -bottom-1 -left-1 size-12 border-b-[3px] border-l-[3px] border-white rounded-bl-xl" />
          <span className="absolute -bottom-1 -right-1 size-12 border-b-[3px] border-r-[3px] border-white rounded-br-xl" />
        </div>

        {/* AI scan line */}
        <div className="snappeal-splash-scan absolute inset-0 pointer-events-none">
          <div
            className="absolute left-0 right-0 h-1.5 rounded-full"
            style={{
              background:
                "linear-gradient(180deg, transparent 0%, rgba(0,122,255,0.85) 50%, transparent 100%)",
              boxShadow:
                "0 0 18px 6px rgba(0,122,255,0.6), 0 0 32px 8px rgba(0,122,255,0.35)",
            }}
          />
        </div>

        {/* Camera-shutter white flash */}
        <div className="snappeal-splash-flash absolute inset-0 bg-white pointer-events-none" />
      </div>

      {/* Wordmark + loading dots — bottom of the screen */}
      <div className="snappeal-splash-wordmark absolute bottom-[18%] inset-x-0 flex flex-col items-center gap-4 px-6 text-center">
        <div className="relative">
          {/* Canonical Snappeal shield — same mark used everywhere else. */}
          <SnappealMark
            size={72}
            variant="light"
            className="drop-shadow-[0_4px_12px_rgba(255,255,255,0.35)]"
          />
          {/* Success tick that pops in over the shield in the final beat */}
          <span className="snappeal-splash-tick absolute -bottom-2 -right-2 size-7 rounded-full bg-snappeal-success flex items-center justify-center ring-4 ring-snappeal-navy">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12.5l4.5 4.5L19 7" />
            </svg>
          </span>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Snappeal
          </h1>
          <div className="flex items-center gap-2 text-sm text-white/80">
            <span>Drafting your appeal</span>
            <span className="flex gap-1">
              <span className="snappeal-splash-dot size-1.5 rounded-full bg-snappeal-primary" />
              <span className="snappeal-splash-dot size-1.5 rounded-full bg-snappeal-primary" />
              <span className="snappeal-splash-dot size-1.5 rounded-full bg-snappeal-primary" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Flat-vector Westminster City Council PCN ticket.
 * Faithful to the council's PCN template (yellow body, red header, mono
 * reference codes) without copying the official typography.
 */
function WestminsterPCN() {
  return <RealisticPcnInWallet />;
}

/**
 * The iconic UK Penalty Charge Notice warning — a yellow square card sealed
 * inside a clear adhesive plastic wallet, slapped onto a vehicle windshield.
 * Diamond-hatched black/white border around bold "PENALTY CHARGE NOTICE"
 * text and the WARNING legend. Drawn as SVG so it scales without an image
 * asset and animates cleanly inside the scan brackets.
 */
function RealisticPcnInWallet() {
  return (
    <svg
      viewBox="0 0 220 300"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto"
    >
      <defs>
        {/* Diamond-hatch pattern that forms the iconic frame around the
         * yellow notice. Two black tiles rotated 45° meet at the corners
         * to create the alternating diamond look. */}
        <pattern
          id="pcnDiamondHatch"
          patternUnits="userSpaceOnUse"
          width="7"
          height="7"
          patternTransform="rotate(45)"
        >
          <rect width="7" height="7" fill="#0a0a0a" />
          <rect x="0.9" y="0.9" width="5.2" height="5.2" fill="#ffffff" />
        </pattern>
        {/* Clear plastic wallet body — barely tinted, slight sheen. */}
        <linearGradient id="pcnWallet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f4f4f5" />
          <stop offset="40%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e7e7ea" />
        </linearGradient>
        {/* Subtle diagonal sheen across the plastic. */}
        <linearGradient id="pcnSheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.0" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Plastic wallet outer body + thin border */}
      <rect
        width="220"
        height="300"
        rx="8"
        fill="url(#pcnWallet)"
        stroke="#cfcfd4"
        strokeWidth="0.6"
      />

      {/* Adhesive zip-seal strip at the top (the part that sticks to glass) */}
      <rect width="220" height="22" fill="#e6e6ea" />
      <line
        x1="6"
        y1="11"
        x2="214"
        y2="11"
        stroke="#bcbcc2"
        strokeWidth="0.7"
        strokeDasharray="3 2"
      />
      <line
        x1="6"
        y1="18"
        x2="214"
        y2="18"
        stroke="#cfcfd4"
        strokeWidth="0.5"
        strokeDasharray="1 3"
      />

      {/* Diagonal plastic sheen highlight (top-left → middle) */}
      <rect width="220" height="300" rx="8" fill="url(#pcnSheen)" />

      {/* Diamond-hatched border frame */}
      <rect x="22" y="42" width="176" height="240" fill="url(#pcnDiamondHatch)" />

      {/* Yellow inner notice */}
      <rect x="36" y="56" width="148" height="212" fill="#fdd420" />

      {/* PENALTY CHARGE NOTICE — three stacked lines, bold black */}
      <text
        x="110"
        y="98"
        textAnchor="middle"
        fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif"
        fontSize="20"
        fontWeight={900}
        fill="#0a0a0a"
        letterSpacing={-0.4}
      >
        PENALTY
      </text>
      <text
        x="110"
        y="120"
        textAnchor="middle"
        fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif"
        fontSize="20"
        fontWeight={900}
        fill="#0a0a0a"
        letterSpacing={-0.4}
      >
        CHARGE
      </text>
      <text
        x="110"
        y="142"
        textAnchor="middle"
        fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif"
        fontSize="20"
        fontWeight={900}
        fill="#0a0a0a"
        letterSpacing={-0.4}
      >
        NOTICE
      </text>

      {/* WARNING heading */}
      <text
        x="110"
        y="178"
        textAnchor="middle"
        fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif"
        fontSize="13"
        fontWeight={800}
        fill="#0a0a0a"
        letterSpacing={0.6}
      >
        WARNING
      </text>

      {/* Legend — three flow lines of the offence text */}
      <text
        x="110"
        y="206"
        textAnchor="middle"
        fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif"
        fontSize="6.4"
        fontWeight={700}
        fill="#0a0a0a"
      >
        IT IS AN OFFENCE FOR ANY
      </text>
      <text
        x="110"
        y="220"
        textAnchor="middle"
        fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif"
        fontSize="6.4"
        fontWeight={700}
        fill="#0a0a0a"
      >
        PERSON OTHER THAN THE
      </text>
      <text
        x="110"
        y="234"
        textAnchor="middle"
        fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif"
        fontSize="6.4"
        fontWeight={700}
        fill="#0a0a0a"
      >
        DRIVER TO REMOVE THIS NOTICE
      </text>
    </svg>
  );
}

