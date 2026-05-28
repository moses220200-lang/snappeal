/**
 * Client-side cache + hook for the average AI-call durations per
 * stage. Backs the "Usually takes ~Xs" copy under the smart ticket
 * card's validating / drafting / submitting bubbles.
 *
 * Caching strategy:
 *   • Module-level cache survives across all TicketCard mounts in a
 *     single tab — the averages move slowly (14-day window on the
 *     server) so one fetch per tab is more than enough.
 *   • TTL 5 min, mirrors the server cache.
 *   • Single in-flight promise dedups parallel callers.
 *   • Errors leave the cache empty so the next caller retries; never
 *     poisons the cache with stale data.
 *
 * Usage:
 *   const { lookup, draft, submit } = useAvgDurations();
 *   const eta = lookup ? formatEta(lookup) : null;
 */
import { useEffect, useState } from "react";

export type StageMs = number | undefined;

export interface AvgDurations {
  /** pcn_lookup MCP agent (worker). Drives the validating bubble's ETA. */
  lookup?: StageMs;
  /** letter generation (generate-stream route). Drives the drafting bubble. */
  draft?: StageMs;
  /** submit_appeal MCP agent (worker). Drives the submitting bubble. */
  submit?: StageMs;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: { at: number; value: AvgDurations } | null = null;
let inFlight: Promise<AvgDurations> | null = null;

async function fetchAvgDurations(): Promise<AvgDurations> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.value;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch("/api/stats/avg-durations", {
        cache: "no-store",
      });
      if (!res.ok) return {};
      const json = (await res.json()) as Record<string, unknown>;
      const value: AvgDurations = {
        lookup: typeof json.lookup === "number" ? json.lookup : undefined,
        draft: typeof json.draft === "number" ? json.draft : undefined,
        submit: typeof json.submit === "number" ? json.submit : undefined,
      };
      cached = { at: Date.now(), value };
      return value;
    } catch {
      return {};
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Lazy fetch the avg-durations on first call per mount. Returns an
 * empty object until the network settles; callers fall back to their
 * own copy when a stage's average isn't available yet.
 */
export function useAvgDurations(): AvgDurations {
  const [value, setValue] = useState<AvgDurations>(() => cached?.value ?? {});
  useEffect(() => {
    let alive = true;
    void fetchAvgDurations().then((v) => {
      if (alive) setValue(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return value;
}

/**
 * Human-readable ETA string for the bubbles. Rounds aggressively for
 * UX legibility: seconds for fast calls, "~1 min" / "~2 min" / etc
 * for longer ones. Returns null when the input is missing or zero.
 *
 *   12_400  →  "~12s"
 *   38_900  →  "~40s"   (rounded to nearest 5s)
 *   65_000  →  "~1 min"
 *   125_000 →  "~2 min"
 */
export function formatEta(ms: number | undefined): string | null {
  if (!ms || ms <= 0) return null;
  if (ms < 60_000) {
    const seconds = Math.round(ms / 1000 / 5) * 5;
    if (seconds <= 0) return "~5s";
    return `~${seconds}s`;
  }
  const minutes = Math.round(ms / 60_000);
  return `~${minutes} min`;
}
