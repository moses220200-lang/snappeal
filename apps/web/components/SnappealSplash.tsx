"use client";

import { useEffect, useState } from "react";

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
          {/* Shield logo */}
          <svg
            width="64"
            height="72"
            viewBox="0 0 64 72"
            aria-hidden
            className="drop-shadow-[0_4px_12px_rgba(0,122,255,0.5)]"
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
  return (
    <svg
      viewBox="0 0 220 300"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto"
    >
      <defs>
        <linearGradient id="ticketBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="60%" stopColor="#f5d142" />
          <stop offset="100%" stopColor="#e6bf30" />
        </linearGradient>
      </defs>

      {/* Ticket body */}
      <rect width="220" height="300" rx="6" fill="url(#ticketBody)" />

      {/* Red header */}
      <rect width="220" height="62" fill="#dc2626" />
      <text
        x="110"
        y="26"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="10"
        fontWeight={700}
        fill="#ffffff"
        letterSpacing={1.4}
      >
        WESTMINSTER CITY COUNCIL
      </text>
      <text
        x="110"
        y="48"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="15"
        fontWeight={800}
        fill="#ffffff"
        letterSpacing={1.5}
      >
        PENALTY CHARGE NOTICE
      </text>

      {/* Warning band */}
      <rect y="68" width="220" height="14" fill="#0a1929" />
      <text
        x="110"
        y="79"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="8"
        fontWeight={700}
        fill="#fde047"
        letterSpacing={1.2}
      >
        DO NOT REMOVE — DRIVER OR KEEPER ONLY
      </text>

      {/* Body content — flat labels + monospace data */}
      {[
        ["PCN REF", "WC12345678"],
        ["VEHICLE", "AB12 CDE"],
        ["CODE", "12"],
        ["LOCATION", "Marylebone High St, W1U"],
        ["ISSUED", "12 May 2026 · 09:14"],
        ["AMOUNT", "£160"],
      ].map(([label, value], i) => {
        const y = 100 + i * 30;
        return (
          <g key={label}>
            <text
              x="14"
              y={y}
              fontFamily="Inter, system-ui, sans-serif"
              fontSize="7"
              fontWeight={700}
              fill="#0a1929"
              letterSpacing={1.1}
            >
              {label}
            </text>
            <text
              x="14"
              y={y + 12}
              fontFamily="IBM Plex Mono, Menlo, monospace"
              fontSize="11"
              fontWeight={700}
              fill="#0a1929"
            >
              {value}
            </text>
            {i < 5 && (
              <line
                x1="14"
                y1={y + 18}
                x2="206"
                y2={y + 18}
                stroke="#0a1929"
                strokeOpacity={0.15}
                strokeWidth="1"
                strokeDasharray="2 3"
              />
            )}
          </g>
        );
      })}

      {/* Discount footnote */}
      <rect
        y="282"
        width="220"
        height="18"
        fill="#0a1929"
        fillOpacity={0.85}
      />
      <text
        x="110"
        y="294"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="7"
        fontWeight={700}
        fill="#ffffff"
        letterSpacing={0.9}
      >
        £80 IF PAID WITHIN 14 DAYS · OR APPEAL
      </text>
    </svg>
  );
}
