"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { SnappealMark } from "@/components/Logo";

/**
 * Global error boundary for the App Router. Catches any uncaught render
 * exception under any route segment and renders a calm, branded "something
 * went wrong" card with a Reset button (re-renders the offending tree) plus
 * an escape hatch back to the home screen.
 *
 * Stack traces are NEVER shown to the customer. We log `error.digest`
 * (Next.js's hashed correlation id) + the message to the dev console so a
 * developer with the network tab open can correlate it server-side.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error in dev consoles without leaking it to the UI.
    console.error("[ParkingRabbit] render boundary caught:", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-snappeal-bg flex flex-col items-center justify-center px-6 py-20 text-snappeal-navy">
      <div className="w-full max-w-md flex flex-col items-center text-center gap-5">
        <div className="flex items-center gap-2.5">
          <SnappealMark size={32} variant="dark" />
          <span className="text-lg font-bold tracking-tight">ParkingRabbit</span>
        </div>
        <div className="size-14 rounded-full bg-red-100 text-red-700 flex items-center justify-center">
          <AlertTriangle className="size-7" strokeWidth={1.75} />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
          <p className="text-sm text-snappeal-muted leading-relaxed max-w-sm">
            We hit an unexpected error rendering this page. Your tickets and
            draft appeals are still safe on our servers.
          </p>
          {error.digest && (
            <p className="text-[11px] text-snappeal-muted font-mono mt-1">
              Reference: {error.digest}
            </p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full max-w-xs">
          <button
            type="button"
            onClick={reset}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-2xl bg-snappeal-navy text-white font-semibold text-sm px-5 py-3"
          >
            <RotateCcw className="size-4" strokeWidth={2.25} />
            Try again
          </button>
          <Link
            href="/app"
            className="flex-1 inline-flex items-center justify-center rounded-2xl bg-white border border-snappeal-border text-snappeal-navy font-semibold text-sm px-5 py-3 hover:border-snappeal-primary transition"
          >
            Back to the app
          </Link>
        </div>
      </div>
    </main>
  );
}
