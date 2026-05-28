/**
 * GET /api/stats/avg-durations
 *
 * Returns the average AI-call duration (ms) per stage over the last
 * 14 days of successful calls. Used by the smart ticket card to
 * populate the "Usually takes ~Xs. We'll notify you when it's done."
 * copy under the validating / drafting / submitting bubbles so the
 * user has a realistic expectation of how long each step takes.
 *
 * Response shape:
 *   { lookup?: number, draft?: number, submit?: number, ... }
 *
 * Missing keys mean we have zero recent successful calls for that
 * stage — the client falls back to a sensible default in copy.
 *
 * Caching: 5-minute in-memory cache. The averages move slowly (a
 * 14-day rolling window), and every active TicketCard hits this on
 * mount — without the cache a list of 20 tickets would fan out 20
 * identical SQL queries on page load. The cache is per-process so a
 * Vercel-style serverless deployment will still warm up on first
 * request per cold start, which is fine.
 */
import { NextResponse } from "next/server";
import {
  getAvgStageDurationsMs,
  type AvgStageDurations,
} from "@/lib/server/aiCalls";

export const runtime = "nodejs";

const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: { at: number; value: AvgStageDurations } | null = null;
let inFlight: Promise<AvgStageDurations> | null = null;

async function getCachedAverages(): Promise<AvgStageDurations> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.value;
  // Coalesce parallel callers onto a single SQL round-trip — if 20
  // tickets mount at the same time and the cache is cold, only one
  // query fires.
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const value = await getAvgStageDurationsMs();
      cached = { at: Date.now(), value };
      return value;
    } catch {
      // Don't poison the cache on error; let the next caller retry.
      return {};
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export async function GET() {
  const value = await getCachedAverages();
  return NextResponse.json(value, {
    headers: {
      // Match the server-side TTL on the public cache; the client
      // also keeps its own short cache so this header is mostly for
      // CDN-friendly behaviour if we ever front this with one.
      "cache-control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
}
