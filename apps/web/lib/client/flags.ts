"use client";

/**
 * Public-readable runtime flags fetched from `/api/health`. The admin
 * settings page can flip these at runtime; pages that gate behaviour on
 * them read through this module so they get the live value (after a
 * cheap one-off fetch per session, cached in-memory).
 */
import { useEffect, useState } from "react";

interface HealthFlags {
  /** Customer preference — show the live MCP screenshot strip during
   *  PCN validation + council submission. Default false (calm
   *  destination + push notification when work finishes). Loaded
   *  from `users.notification_prefs.showMcpLiveView` for signed-in
   *  users; defaults to false for guests. */
  showMcpLiveView: boolean;
  /** Dev-only fake-payment buttons on the PaymentSheet. Derived
   *  server-side from `getSettings().fakePayment` (mode-aware
   *  default: true in dev, false in prod; admin override at
   *  /admin/settings). Replaces the raw
   *  `process.env.NEXT_PUBLIC_PARKINGRABBIT_FAKE_PAYMENT` read so the
   *  toggle is consistent with every other admin knob. */
  fakePayment: boolean;
}

interface HealthResponse {
  flags?: Partial<HealthFlags>;
}

let cached: HealthFlags | null = null;
let inflight: Promise<HealthFlags> | null = null;

const DEFAULTS: HealthFlags = { showMcpLiveView: false, fakePayment: false };

async function fetchFlags(): Promise<HealthFlags> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (!res.ok) return DEFAULTS;
      const json = (await res.json()) as HealthResponse;
      cached = { ...DEFAULTS, ...(json.flags ?? {}) };
      return cached;
    } catch {
      cached = DEFAULTS;
      return cached;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useFlags(): HealthFlags {
  const [flags, setFlags] = useState<HealthFlags>(cached ?? DEFAULTS);
  useEffect(() => {
    let alive = true;
    void fetchFlags().then((f) => {
      if (alive) setFlags(f);
    });
    return () => {
      alive = false;
    };
  }, []);
  return flags;
}

/** Imperative read for non-hook callsites — returns the cached value
 *  immediately if available, else `DEFAULTS`. Awaiting the promise will
 *  always return the live value. */
export function getFlagsAsync(): Promise<HealthFlags> {
  return fetchFlags();
}
