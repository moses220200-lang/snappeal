"use client";

/**
 * Public-readable runtime flags fetched from `/api/health`. The admin
 * settings page can flip these at runtime; pages that gate behaviour on
 * them read through this module so they get the live value (after a
 * cheap one-off fetch per session, cached in-memory).
 */
import { useEffect, useState } from "react";

interface HealthFlags {
  showMcpLiveView: boolean;
}

interface HealthResponse {
  flags?: Partial<HealthFlags>;
}

let cached: HealthFlags | null = null;
let inflight: Promise<HealthFlags> | null = null;

const DEFAULTS: HealthFlags = { showMcpLiveView: false };

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
