"use client";

/**
 * Tickets dashboard — `/app/tickets`.
 *
 * v0.2.13: post-refactor list page. The per-row visual is now
 * `<TicketCard mode="list" />` — a smart card that owns its own
 * status-snapshot fetch, live SSE subscription, action surface, and
 * expand/collapse body. The list page itself owns only:
 *
 *   - Auth gate (signed-in only; v0.2.7 product rule)
 *   - Filter bar (All / To Pay / Challenging / Resolved) with counts
 *   - Archive (locally-hidden) tickets via localStorage
 *   - Empty + error states
 *   - 15s reconciliation poll (visibility-gated) to catch jobs that
 *     settle while the tab is in the background and the SSE has died
 *   - Help / Deadline-tip footer cards
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileText, Loader2, Plus, ShieldCheck } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { TicketCard } from "@/components/TicketCard";
import { getOrCreateSessionId } from "@/lib/client/session";
import { readFileAsDataUrl, uploadPcn } from "@/lib/client/uploadPcn";
import type { AppealRecord } from "@/lib/server/appeals";
import {
  deadlineSortKey,
  getDeadlineProximity,
} from "@/lib/deriveDeadlineProximity";

type DisplayState = "at_risk" | "due" | "appealed" | "rejected" | "resolved";
type Filter = "all" | "due" | "appealed" | "resolved";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "due", label: "To Pay" },
  { id: "appealed", label: "Appeals" },
  { id: "resolved", label: "Resolved" },
];

// UK PCN 50% discount window is 14 days from issue. Inside the last 4 days
// the ticket is promoted from "at risk" to "due".
const DISCOUNT_WINDOW_DAYS = 14;
const TO_PAY_THRESHOLD_DAYS = DISCOUNT_WINDOW_DAYS - 4;
const MS_PER_DAY = 86_400_000;

function deriveDisplayState(a: AppealRecord, now: number): DisplayState {
  if (a.status === "cancelled") return "resolved";
  if (a.status === "rejected") return "rejected";
  if (
    a.status === "submitting" ||
    a.status === "submitted" ||
    a.status === "under_review" ||
    a.status === "decision_pending"
  ) {
    return "appealed";
  }
  const issuedAt = a.ticket?.issuedAt ? new Date(a.ticket.issuedAt).getTime() : null;
  if (issuedAt == null) return "at_risk";
  return Math.floor((now - issuedAt) / MS_PER_DAY) >= TO_PAY_THRESHOLD_DAYS
    ? "due"
    : "at_risk";
}

const HIDDEN_KEY = "parkingrabbit.hidden";

function readHidden(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(
      Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [],
    );
  } catch {
    return new Set();
  }
}

function writeHidden(set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* private mode */
  }
}

interface ViewerState {
  isSignedIn: boolean;
  email: string | null;
}

const RECONCILE_INTERVAL_MS = 15_000;

export default function TicketsPage() {
  const [appeals, setAppeals] = useState<AppealRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // 2026-05-27 — read `?inputManual=1` from /app/scan's "Input manually"
  // tile. When set, the auto-expanded card opens its inline manual-entry
  // form on first render so the user doesn't need an extra tap. Stripped
  // from the URL after read so a refresh doesn't re-trigger the expand.
  const [autoExpandManualEntryFor, setAutoExpandManualEntryFor] = useState<
    string | null
  >(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => readHidden());
  // Tracks the latest server-known updatedAt across all visible rows. Used
  // as the `?since=` cursor for delta polling.
  const lastSyncedAtRef = useRef<string | null>(null);
  // v0.2.16 — track whether we've auto-expanded once per page load. Avoids
  // re-expanding when the user collapses an in-flight card on purpose.
  const autoExpandedRef = useRef<boolean>(false);
  // Hidden file input wired to the single "+" button inside the
  // "Got a new ticket?" card. The previous design exposed two icon
  // buttons (camera vs gallery) but the camera shortcut was redundant —
  // the OS picker the gallery input opens already includes "Take Photo"
  // on iOS/Android, and the dedicated camera button cluttered the entry
  // point. `accept="image/*"` (no `capture` attribute) lets the OS
  // decide which source(s) to offer.
  const scanGalleryRef = useRef<HTMLInputElement | null>(null);
  const [scanUploading, setScanUploading] = useState(false);

  // v0.2.16 — when the list first loads, auto-expand the newest ticket
  // that's mid-lifecycle (anything that's not a terminal state). The user
  // arrived here from /app/capture or from a notification; they want to
  // see the live state immediately, not tap a chevron first.
  //
  // v0.3.10 — if `expandedId` was set from the URL ?expand= param but
  // no card in the loaded list matches that id (because the post-OCR
  // merge fold collapsed it onto an older draft), fall back to the
  // newest in-flight card so the user doesn't land on an empty
  // expand slot.
  useEffect(() => {
    if (!appeals || appeals.length === 0) return;
    if (expandedId && appeals.some((a) => a.id === expandedId)) {
      // URL-targeted id is still around; nothing to do.
      return;
    }
    if (autoExpandedRef.current && !expandedId) return;
    const target = appeals.find((a) => isInFlight(a));
    if (target) {
      autoExpandedRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpandedId(target.id);
    }
  }, [appeals, expandedId]);

  // ─── initial load ───
  // v0.2.15+ — the v0.2.7 "guests don't see a list" rule is dropped.
  // Progressive ticket creation persists guest-owned tickets now, so the
  // dashboard MUST surface them or the user is stranded. We still fetch
  // /api/auth/me to know whether to render the small "Sign in to sync"
  // nudge above the list, but the appeals fetch fires unconditionally.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const sessionId = getOrCreateSessionId();
        const [meRes, appealsRes] = await Promise.all([
          fetch("/api/auth/me", { cache: "no-store" }).catch(() => null),
          fetch(`/api/appeals?sessionId=${encodeURIComponent(sessionId)}`, {
            cache: "no-store",
          }),
        ]);
        const me =
          meRes && meRes.ok
            ? ((await meRes.json()) as { user: { email?: string | null } | null })
            : { user: null };
        if (!alive) return;
        setViewer({ isSignedIn: !!me.user, email: me.user?.email ?? null });
        if (!appealsRes.ok) throw new Error(`HTTP ${appealsRes.status}`);
        const json = (await appealsRes.json()) as { appeals: AppealRecord[] };
        if (!alive) return;
        setAppeals(json.appeals);
        lastSyncedAtRef.current = newestUpdatedAt(json.appeals);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ─── countdown tick ───
  useEffect(() => {
    if (!appeals || appeals.length === 0) return;
    const nearDeadline = appeals.some((a) => {
      if (!a.ticket?.issuedAt) return false;
      const deadline =
        new Date(a.ticket.issuedAt).getTime() + DISCOUNT_WINDOW_DAYS * MS_PER_DAY;
      const ms = deadline - Date.now();
      return ms > 0 && ms < 5 * 60 * 1000;
    });
    const interval = window.setInterval(
      () => setNow(Date.now()),
      nearDeadline ? 1000 : 30_000,
    );
    return () => window.clearInterval(interval);
  }, [appeals]);

  // ─── 15s reconciliation poll ─── v0.2.13
  // Runs only while the tab is visible and the user is signed in. Hits
  // `/api/appeals?since=<lastUpdatedAt>` so we only pull deltas; merges
  // any changed rows back into local state. Catches jobs that settle
  // while the tab is in the background or the per-card SSE died.
  useEffect(() => {
    if (!viewer?.isSignedIn) return;
    if (appeals == null) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState !== "visible") {
        timer = setTimeout(tick, RECONCILE_INTERVAL_MS);
        return;
      }
      try {
        const sessionId = getOrCreateSessionId();
        const qs = new URLSearchParams({ sessionId });
        const since = lastSyncedAtRef.current;
        if (since) qs.set("since", since);
        const res = await fetch(`/api/appeals?${qs.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { appeals: AppealRecord[] };
        if (!alive) return;
        if (json.appeals.length > 0) {
          setAppeals((prev) => mergeAppeals(prev, json.appeals));
          const newest = newestUpdatedAt(json.appeals);
          if (newest && (!lastSyncedAtRef.current || newest > lastSyncedAtRef.current)) {
            lastSyncedAtRef.current = newest;
          }
        }
      } catch {
        /* transient — try again next tick */
      } finally {
        if (alive) timer = setTimeout(tick, RECONCILE_INTERVAL_MS);
      }
    };

    timer = setTimeout(tick, RECONCILE_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible" && alive) {
        // Wake immediately on tab focus.
        if (timer) clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [viewer?.isSignedIn, appeals]);

  // Progressive ticket creation, all on a single surface. The appeal row
  // is created server-side BEFORE OCR / portal lookup / AI analysis run.
  // OCR continues in the background via fire-and-forget POST inside
  // `uploadPcn`. We refresh the list so the new card appears at the top
  // and auto-expand it so the user immediately sees the smart card's
  // progressive status rows — no separate detail page, no full-screen
  // blocker. If the user backgrounds the tab or refreshes, the ticket
  // stays consistent because every step's status is persisted on the
  // appeal row.
  // ?expand=<id> deep-link support — fires when the user arrives from a
  // notification or from the back-compat /app/tickets/[id] redirect.
  // We honour it once per mount and strip the param so a refresh doesn't
  // re-expand a card the user has since collapsed.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const target = params.get("expand");
    const inputManual = params.get("inputManual") === "1";
    if (!target) return;
    autoExpandedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedId(target);
    if (inputManual) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAutoExpandManualEntryFor(target);
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("expand");
    url.searchParams.delete("inputManual");
    window.history.replaceState({}, "", url.toString());
  }, []);

  const handleScanFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      setScanUploading(true);
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const { appealId } = await uploadPcn(dataUrl);
        // Refresh the list immediately so the new card lands on screen
        // with its image + scanning animation already visible. OCR
        // runs in the background; the smart card's polling loop picks
        // up the extracted fields the moment they're written. There is
        // no full-screen overlay any more — the tickets page itself
        // is the loading state.
        const sessionId = getOrCreateSessionId();
        const res = await fetch(
          `/api/appeals?sessionId=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const json = (await res.json()) as { appeals: AppealRecord[] };
          setAppeals(json.appeals);
          lastSyncedAtRef.current = newestUpdatedAt(json.appeals);
          autoExpandedRef.current = false;
          setExpandedId(appealId);
        }
      } finally {
        setScanUploading(false);
      }
    },
    [],
  );

  const hideAppeal = useCallback((id: string) => {
    setHidden((curr) => {
      const next = new Set(curr);
      next.add(id);
      writeHidden(next);
      return next;
    });
    setExpandedId((curr) => (curr === id ? null : curr));
  }, []);

  const updateAppealLocal = useCallback((next: AppealRecord) => {
    setAppeals((prev) =>
      prev ? prev.map((a) => (a.id === next.id ? next : a)) : prev,
    );
  }, []);

  const visible = useMemo(() => {
    if (!appeals) return [];
    // Backlog-safe sort:
    //   1. Unsettled tickets with a critical deadline ≤7 days away —
    //      sorted by soonest deadline first. The user MUST see these
    //      before anything else; a stack of older tickets can hide a
    //      ticket about to escalate past its statutory window.
    //   2. Other unsettled tickets — newest first by createdAt.
    //   3. Settled tickets (submitted / cancelled / closed) — newest
    //      first.
    // Each ticket goes into exactly one bucket; sort within bucket
    // then concatenate.
    const all = appeals.filter((a) => !hidden.has(a.id));
    const urgent: typeof all = [];
    const open: typeof all = [];
    const done: typeof all = [];
    for (const a of all) {
      const settled =
        a.status === "submitted" ||
        a.status === "under_review" ||
        a.status === "decision_pending" ||
        a.status === "cancelled" ||
        a.status === "rejected";
      if (settled) {
        done.push(a);
        continue;
      }
      const proximity = getDeadlineProximity(a);
      if (
        proximity &&
        proximity.daysToCritical != null &&
        proximity.daysToCritical <= 7 &&
        !proximity.expired
      ) {
        urgent.push(a);
      } else {
        open.push(a);
      }
    }
    urgent.sort((a, b) => {
      const ka = deadlineSortKey(a);
      const kb = deadlineSortKey(b);
      return ka - kb;
    });
    const newestFirst = (
      a: (typeof all)[number],
      b: (typeof all)[number],
    ) => {
      const ta = new Date(a.createdAt ?? a.updatedAt ?? 0).getTime();
      const tb = new Date(b.createdAt ?? b.updatedAt ?? 0).getTime();
      return tb - ta;
    };
    open.sort(newestFirst);
    done.sort(newestFirst);
    return [...urgent, ...open, ...done];
  }, [appeals, hidden]);

  // Backlog warning data — surfaced as a banner above the list when
  // any unsettled ticket has < 7 days remaining. Computed off the
  // urgent bucket so we don't re-walk the list.
  const backlogUrgent = useMemo<AppealRecord[]>(() => {
    if (!appeals) return [];
    return appeals
      .filter((a) => !hidden.has(a.id))
      .filter((a) => {
        const settled =
          a.status === "submitted" ||
          a.status === "under_review" ||
          a.status === "decision_pending" ||
          a.status === "cancelled" ||
          a.status === "rejected";
        if (settled) return false;
        const p = getDeadlineProximity(a);
        return (
          p?.daysToCritical != null &&
          p.daysToCritical <= 7 &&
          !p.expired
        );
      });
  }, [appeals, hidden]);

  const backlogMinDays = useMemo(() => {
    let min: number | null = null;
    for (const a of backlogUrgent) {
      const p = getDeadlineProximity(a);
      const d = p?.daysToCritical;
      if (d == null) continue;
      if (min == null || d < min) min = d;
    }
    return min;
  }, [backlogUrgent]);

  const filtered = useMemo(() => {
    if (filter === "all") return visible;
    return visible.filter((a) => {
      const state = deriveDisplayState(a, now);
      if (filter === "appealed") return state === "at_risk" || state === "appealed";
      if (filter === "resolved") return state === "resolved" || state === "rejected";
      return state === filter;
    });
  }, [visible, filter, now]);

  const counts = useMemo(() => {
    const base = { all: visible.length, due: 0, appealed: 0, resolved: 0, atRisk: 0, rejected: 0 };
    for (const a of visible) {
      const s = deriveDisplayState(a, now);
      if (s === "due") base.due++;
      else if (s === "appealed") base.appealed++;
      else if (s === "resolved") base.resolved++;
      else if (s === "rejected") base.rejected++;
      else if (s === "at_risk") base.atRisk++;
    }
    return base;
  }, [visible, now]);

  // v0.2.15+ — no more "sign in to see your tickets" gate. Guests with
  // session-owned tickets see them in the list. Truly anonymous users
  // (no session, no tickets) land on the empty state with the existing
  // "Add your first ticket" CTA. The sign-in nudge below the filter bar
  // surfaces for guests who DO have tickets, so they understand why
  // their list might disappear on a fresh device.

  return (
    <>
      <AppHeader />
      {/* Hidden file input — clicked synchronously from the "+" button
       *  inside the "Got a new ticket?" card. `accept="image/*"` with
       *  no `capture` attribute lets the OS picker offer whichever
       *  sources are available on the device (camera + library on
       *  iOS/Android, file browser on desktop). */}
      <input
        ref={scanGalleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleScanFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="px-5 pb-6 flex flex-col gap-4 pt-1">
        {/* "Got a new ticket?" entry point at the top of the list.
         *  Single "+" button opens the OS image picker (camera /
         *  library / files — whichever the platform offers). The
         *  legacy two-button camera+gallery layout was collapsed to one
         *  to keep the entry point uncluttered. */}
        <section className="rounded-2xl bg-parkingrabbit-bg/50 border border-dashed border-parkingrabbit-border p-5 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-parkingrabbit-navy">Got a new ticket?</p>
            <p className="text-[12px] text-parkingrabbit-muted mt-0.5">
              Add it now — we&apos;ll handle it for you.
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              aria-label="Add a new ticket"
              onClick={() => {
                if (scanUploading) return;
                scanGalleryRef.current?.click();
              }}
              disabled={scanUploading}
              className="size-11 rounded-2xl bg-parkingrabbit-navy text-white flex items-center justify-center hover:bg-parkingrabbit-navy/90 transition disabled:opacity-60 shadow-sm active:scale-95"
            >
              {scanUploading ? (
                <Loader2 className="size-5 animate-spin" strokeWidth={2.25} />
              ) : (
                <Plus className="size-5" strokeWidth={2.5} />
              )}
            </button>
          </div>
        </section>
        {viewer && !viewer.isSignedIn && appeals && appeals.length > 0 && (
          <section className="rounded-2xl bg-parkingrabbit-primary-50 border border-parkingrabbit-primary-100 p-4 flex items-start gap-3">
            <span className="size-9 rounded-xl bg-white text-parkingrabbit-primary flex items-center justify-center shrink-0">
              <ShieldCheck className="size-4" strokeWidth={2.25} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-parkingrabbit-navy">
                Sign in to keep your tickets
              </p>
              <p className="text-[11.5px] text-parkingrabbit-muted mt-0.5 leading-snug">
                You&apos;re viewing as a guest. Your tickets are saved for this
                browser; signing in syncs them across your devices.
              </p>
              <div className="flex gap-2 mt-2.5">
                <Link
                  href="/sign-in"
                  className="rounded-full bg-parkingrabbit-primary !text-white text-[11.5px] font-semibold px-3.5 py-1.5 hover:bg-parkingrabbit-primary-600 transition"
                >
                  <span className="text-white">Sign in</span>
                </Link>
                <Link
                  href="/sign-up"
                  className="rounded-full bg-white border border-parkingrabbit-border text-parkingrabbit-navy text-[11.5px] font-semibold px-3.5 py-1.5 hover:border-parkingrabbit-primary transition"
                >
                  Create an account
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Filter row — horizontally scrollable; tighter pill padding +
         *  a right-edge mask so users can read the affordance that
         *  "Resolved" continues off the right edge without a visible
         *  scrollbar. */}
        <div className="parkingrabbit-filter-row flex gap-1.5 overflow-x-auto -mx-1 px-1 no-scrollbar">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            const count =
              f.id === "all"
                ? counts.all
                : f.id === "appealed"
                  ? counts.appealed + counts.atRisk
                  : f.id === "resolved"
                    ? counts.resolved + counts.rejected
                    : counts[f.id];
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap transition inline-flex items-center gap-1.5 shrink-0 ${
                  active
                    ? "bg-parkingrabbit-primary text-white"
                    : "bg-white border border-parkingrabbit-border text-parkingrabbit-muted hover:text-parkingrabbit-navy"
                }`}
              >
                {f.label}
                {appeals && count > 0 && (
                  <span
                    className={`text-[10px] font-bold rounded-full px-1.5 py-px min-w-[16px] text-center ${
                      active ? "bg-white/25 text-white" : "bg-parkingrabbit-bg text-parkingrabbit-navy"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {appeals == null && !error && (
          <div className="rounded-2xl border border-parkingrabbit-border bg-white p-8 flex items-center justify-center gap-2 text-sm text-parkingrabbit-muted">
            <Loader2 className="size-4 animate-spin" />
            Loading your tickets…
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {appeals && filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-parkingrabbit-border bg-white p-10 text-center">
            <FileText className="size-8 mx-auto text-parkingrabbit-muted" />
            <p className="mt-3 text-sm text-parkingrabbit-muted">
              {appeals.length === 0 ? "No tickets yet." : "No tickets match that filter."}
            </p>
            {appeals.length === 0 && (
              <Link
                href="/app/capture"
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-parkingrabbit-primary !text-white text-sm font-semibold px-4 py-2"
              >
                <Plus className="size-4 text-white" strokeWidth={2.5} />
                <span className="text-white">Add your first ticket</span>
              </Link>
            )}
          </div>
        )}

        {/* Backlog warning banner — shown when ANY unsettled ticket
         *  has ≤7 days remaining. Soonest-deadline copy in the
         *  headline; tapping scrolls the busiest card into view.
         *  Always renders ABOVE the list so a backlog can't hide
         *  behind older items. */}
        {appeals && backlogUrgent.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const first = backlogUrgent[0];
              if (first) setExpandedId(first.id);
            }}
            className="w-full rounded-2xl bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-3 text-left hover:border-red-300 transition"
          >
            <span className="size-9 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="size-4" strokeWidth={2} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-bold text-red-900 leading-tight">
                {backlogUrgent.length === 1
                  ? "1 ticket needs action"
                  : `${backlogUrgent.length} tickets need action`}
                {backlogMinDays != null && (
                  <>
                    {" "}
                    <span className="text-red-700">
                      —{" "}
                      {backlogMinDays === 0
                        ? "by end of day"
                        : backlogMinDays === 1
                          ? "within 1 day"
                          : `within ${backlogMinDays} days`}
                    </span>
                  </>
                )}
              </p>
              <p className="text-[11.5px] text-red-900/80 mt-0.5 leading-snug">
                Sorted by soonest deadline first. Tap to review.
              </p>
            </div>
          </button>
        )}

        {appeals && filtered.length > 0 && (
          <ul className="flex flex-col gap-3">
            {filtered.map((a) => (
              <li key={a.id}>
                <TicketCard
                  appeal={a}
                  mode="list"
                  isExpanded={expandedId === a.id}
                  onToggle={() =>
                    setExpandedId((curr) => (curr === a.id ? null : a.id))
                  }
                  onHide={() => hideAppeal(a.id)}
                  onAppealRefresh={updateAppealLocal}
                  now={now}
                  autoExpandManualEntry={autoExpandManualEntryFor === a.id}
                />
              </li>
            ))}
          </ul>
        )}


        <Link
          href="/app/tips"
          className="rounded-3xl bg-parkingrabbit-success-soft border border-parkingrabbit-success/25 p-4 flex items-center gap-3 hover:bg-green-100/70 transition"
        >
          <span className="size-10 rounded-full bg-white border border-parkingrabbit-success/30 text-parkingrabbit-success flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="size-5" strokeWidth={2} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-parkingrabbit-success">Deadline tip</p>
            <p className="text-[11px] text-parkingrabbit-navy/80 mt-0.5 leading-snug">
              Act early to keep discounts and appeal options open.
            </p>
          </div>
          <span className="inline-flex items-center justify-center rounded-full bg-white border border-parkingrabbit-success/40 text-parkingrabbit-success text-[11px] font-semibold px-3 py-1.5 min-w-[112px] whitespace-nowrap">
            View tips
          </span>
        </Link>

        <Link
          href="/app/profile/help"
          className="rounded-2xl bg-parkingrabbit-primary-50 border border-parkingrabbit-primary-100 p-4 flex items-center gap-3"
        >
          <span className="size-9 rounded-full bg-white text-parkingrabbit-primary flex items-center justify-center flex-shrink-0">
            <FileText className="size-[1.125rem]" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-parkingrabbit-navy">Need help?</p>
            <p className="text-[11px] text-parkingrabbit-muted">
              See guidance on paying, challenging, and deadlines.
            </p>
          </div>
          <span className="inline-flex items-center justify-center rounded-full bg-white border border-parkingrabbit-primary-100 text-parkingrabbit-primary text-[11px] font-semibold px-3 py-1.5 min-w-[112px] whitespace-nowrap">
            Contact us
          </span>
        </Link>
      </div>
    </>
  );
}

/* ───── helpers ───── */

// Mid-lifecycle predicate — fires for any state that the smart card
// renders as "actively doing something" so the list page can
// auto-expand it on arrival. Mirrors deriveCardState's `inFlight`
// boolean without re-importing the whole machinery: anything that's
// NOT settled (paid / cancelled / closed / submitted / rejected) and
// has at least started (has a ticket or a processing entry).
function isInFlight(a: AppealRecord): boolean {
  if (a.status === "cancelled" || a.status === "rejected") return false;
  if (a.status === "submitted" || a.status === "under_review" || a.status === "decision_pending") {
    return false;
  }
  // OCR / portal lookup / drafting / submitting → in flight.
  if (a.processing?.ocr?.status === "running" || a.processing?.ocr?.status === "pending") return true;
  if (a.portalLookup?.status === "pending") return true;
  if (a.preferredMethod === "portal" && !a.letterBody && a.step !== "generation_failed") return true;
  if (a.status === "submitting") return true;
  // Newly created (no ticket yet, no portal lookup yet, no draft).
  if (a.status === "draft" && !a.letterBody && !a.portalLookup) return true;
  return false;
}

function newestUpdatedAt(list: AppealRecord[]): string | null {
  let max: string | null = null;
  for (const a of list) {
    if (a.updatedAt && (!max || a.updatedAt > max)) max = a.updatedAt;
  }
  return max;
}

function mergeAppeals(
  prev: AppealRecord[] | null,
  deltas: AppealRecord[],
): AppealRecord[] {
  if (!prev) return deltas;
  const byId = new Map<string, AppealRecord>();
  for (const a of prev) byId.set(a.id, a);
  for (const d of deltas) byId.set(d.id, d);
  // Preserve original order (createdAt desc); fall back to delta order
  // for new ids that weren't in prev.
  const ordered: AppealRecord[] = [];
  const seen = new Set<string>();
  for (const a of prev) {
    const next = byId.get(a.id);
    if (next) {
      ordered.push(next);
      seen.add(a.id);
    }
  }
  for (const d of deltas) {
    if (!seen.has(d.id)) ordered.push(d);
  }
  return ordered;
}
