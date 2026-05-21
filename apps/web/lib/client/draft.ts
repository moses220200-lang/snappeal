/**
 * Cloud-first draft helpers.
 *
 * Replaces the per-appeal sessionStorage helpers (`setConfirmedTicket`,
 * `setNotes`, `setSelectedGrounds`, etc.) that used to cache ticket data
 * client-side until the paywall. All of those mutators now PATCH the
 * Postgres appeals row directly so the cloud is the single source of
 * truth — abandoning a draft mid-flow no longer loses it, and signing in
 * mid-session immediately claims the in-flight draft via session-id.
 *
 * Photos (PCN + evidence) are still held in sessionStorage for the
 * duration of the capture flow because they're large data URLs and we
 * haven't wired up Vercel Blob storage yet. They move to the cloud at
 * /api/generate-stream when the customer enters the paywall.
 *
 * In-memory cache: we hold the latest `AppealRecord` per appeal id so
 * navigating between /app/capture → /app/notes → /app/paywall doesn't
 * round-trip the network on every render. The cache is intentionally
 * NOT persisted — on reload we re-fetch from the cloud.
 */
import type { AppealRecord } from "@/lib/server/appeals";
import { getOrCreateSessionId, getCurrentAppealId, setCurrentAppealId } from "@/lib/client/session";

type Ticket = Exclude<AppealRecord["ticket"], null>;

type AppealPatch = {
  notes?: string | null;
  ticket?: Partial<Ticket> | null;
  serviceTier?: "buy_time" | "grounds" | "care_plan";
  evidenceCount?: number;
  grounds?: string[];
};

const cache = new Map<string, AppealRecord>();
let creating: Promise<string> | null = null;

function authHeaders(): HeadersInit {
  return {
    "content-type": "application/json",
    "x-snappeal-session": getOrCreateSessionId(),
  };
}

/**
 * Returns the current in-flight appeal id, creating a fresh draft on the
 * server (POST /api/appeals) the first time the customer commits anything.
 *
 * Idempotent across concurrent callers — multiple capture-page handlers
 * firing during the same render won't spawn duplicate draft rows.
 */
export async function ensureCurrentAppeal(): Promise<string> {
  const existing = getCurrentAppealId();
  if (existing) return existing;
  if (creating) return creating;
  creating = (async () => {
    const sessionId = getOrCreateSessionId();
    const res = await fetch("/api/appeals", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ sessionId }),
    });
    if (!res.ok) throw new Error(`Failed to create draft appeal (${res.status})`);
    const json = (await res.json()) as { appeal: AppealRecord };
    cache.set(json.appeal.id, json.appeal);
    setCurrentAppealId(json.appeal.id);
    return json.appeal.id;
  })();
  try {
    return await creating;
  } finally {
    creating = null;
  }
}

/**
 * Fetch the latest persisted state of an appeal. Hits the in-memory cache
 * first; falls through to /api/appeals/[id] on miss or when `force` is set.
 */
export async function getAppeal(
  id: string,
  opts: { force?: boolean } = {},
): Promise<AppealRecord | null> {
  if (!opts.force) {
    const hit = cache.get(id);
    if (hit) return hit;
  }
  const res = await fetch(`/api/appeals/${encodeURIComponent(id)}`, {
    headers: { "x-snappeal-session": getOrCreateSessionId() },
    cache: "no-store",
  });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Failed to load appeal (${res.status})`);
  const json = (await res.json()) as { appeal: AppealRecord };
  cache.set(json.appeal.id, json.appeal);
  return json.appeal;
}

/**
 * PATCH the current draft with a partial update (ticket fields / notes /
 * grounds / serviceTier). Creates the appeal first if one doesn't exist.
 * Updates the in-memory cache from the server's response so subsequent
 * reads see the canonical persisted shape.
 */
export async function patchCurrentAppeal(patch: AppealPatch): Promise<AppealRecord> {
  const id = await ensureCurrentAppeal();
  const res = await fetch(`/api/appeals/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update draft appeal (${res.status})`);
  const json = (await res.json()) as { appeal: AppealRecord };
  cache.set(json.appeal.id, json.appeal);
  return json.appeal;
}

/**
 * Debounced PATCH for inputs that fire on every keystroke (e.g. the notes
 * textarea). Returns a function the page can call freely; only the trailing
 * write within `waitMs` actually hits the network.
 */
export function debouncedPatch(waitMs = 600) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: AppealPatch | null = null;
  return (patch: AppealPatch) => {
    pending = { ...(pending ?? {}), ...patch };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const next = pending;
      pending = null;
      timer = null;
      if (next) {
        // Fire and forget — caller doesn't await the network.
        void patchCurrentAppeal(next).catch(() => {
          /* surfaced on the next non-debounced write */
        });
      }
    }, waitMs);
  };
}

export function clearDraftCache() {
  cache.clear();
}
