"use client";

/**
 * Mounted once at the top of `/app` (in `app/app/layout.tsx`). Polls
 * `/api/appeals` periodically and watches for status transitions on three
 * background flows:
 *
 *   - **Validation**  — `appeal.portalLookup.status` flips from `pending`
 *                       to a terminal state (`verified` / `invalid` /
 *                       `skipped` / `error` / `overridden`).
 *   - **Drafting**    — `appeal.letterBody` transitions from null to a
 *                       string, OR `appeal.step` flips to `generation_failed`.
 *   - **Submission**  — `appeal.status` transitions from `submitting` to a
 *                       terminal status (`submitted` / `under_review` /
 *                       `decision_pending` / `cancelled` / `rejected`).
 *
 * On a detected transition we push a record into the client-side
 * notification store (`lib/client/notifications.ts`), which in turn fires
 * the native browser notification when permission has been granted.
 *
 * Polling cadence is 5s in the foreground, 30s when the document is
 * hidden. Stops entirely once the user signs out.
 */
import { useEffect, useRef } from "react";
import { getOrCreateSessionId } from "@/lib/client/session";
import { addNotification } from "@/lib/client/notifications";
import type { AppealRecord } from "@/lib/server/appeals";

const FG_INTERVAL_MS = 5_000;
const BG_INTERVAL_MS = 30_000;

interface AppealFingerprint {
  portalStatus: string;
  hasLetter: boolean;
  step: string;
  appealStatus: string;
}

function fingerprintOf(a: AppealRecord): AppealFingerprint {
  return {
    portalStatus: a.portalLookup?.status ?? "none",
    hasLetter: Boolean(a.letterBody),
    step: a.step,
    appealStatus: a.status,
  };
}

function ticketLabel(a: AppealRecord): string {
  const ref = a.ticket?.pcnRef;
  return ref ? `PCN ${ref}` : "your ticket";
}

export function NotificationWatcher() {
  const knownRef = useRef<Map<string, AppealFingerprint>>(new Map());
  const initialPassRef = useRef(true);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (!alive) return;
      try {
        const sessionId = getOrCreateSessionId();
        const appealsRes = await fetch(
          `/api/appeals?sessionId=${encodeURIComponent(sessionId)}`,
          {
            cache: "no-store",
            headers: { "x-parkingrabbit-session": sessionId },
          },
        );
        if (appealsRes.ok && alive) {
          const json = (await appealsRes.json()) as { appeals?: AppealRecord[] };
          const appeals = json.appeals ?? [];
          const prev = knownRef.current;
          const next = new Map<string, AppealFingerprint>();
          for (const a of appeals) {
            const fp = fingerprintOf(a);
            next.set(a.id, fp);
            const before = prev.get(a.id);
            // On the very first poll we seed the known-state map without
            // firing notifications — we'd otherwise dump a backlog every
            // time the user reloads. Only deltas observed AFTER the seed
            // pass surface.
            if (!initialPassRef.current && before) {
              diffAndEmit(a, before, fp);
            }
          }
          knownRef.current = next;
          initialPassRef.current = false;
        }
      } catch {
        /* transient — try again on the next tick */
      }
      if (!alive) return;
      const interval = document.visibilityState === "hidden" ? BG_INTERVAL_MS : FG_INTERVAL_MS;
      timer = setTimeout(tick, interval);
    };

    void tick();
    const onVisibility = () => {
      // Re-tick immediately when the tab regains focus so the user sees
      // any backlog rather than waiting up to BG_INTERVAL_MS.
      if (document.visibilityState === "visible") {
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
  }, []);

  return null;
}

function diffAndEmit(
  a: AppealRecord,
  before: AppealFingerprint,
  after: AppealFingerprint,
): void {
  // Validation transitioned out of pending.
  if (before.portalStatus === "pending" && after.portalStatus !== "pending") {
    const verdict = a.portalLookup?.verdict ?? null;
    const isInvalid =
      verdict === "paid" || verdict === "closed" || verdict === "not_found";
    addNotification({
      id: `${a.id}-validation-${after.portalStatus}`,
      appealId: a.id,
      kind: "validation",
      title: isInvalid
        ? `Council says ${ticketLabel(a)} is ${verdict}`
        : `Validation done — ${ticketLabel(a)}`,
      body: isInvalid
        ? "Tap to review what the council recorded."
        : "Tap to review and continue your appeal.",
    });
  }
  // Drafting completed.
  if (!before.hasLetter && after.hasLetter) {
    addNotification({
      id: `${a.id}-draft-ready`,
      appealId: a.id,
      kind: "draft",
      title: `Your appeal letter is ready — ${ticketLabel(a)}`,
      body: "Tap to read and submit when you're ready.",
    });
  } else if (before.step !== "generation_failed" && after.step === "generation_failed") {
    addNotification({
      id: `${a.id}-draft-failed`,
      appealId: a.id,
      kind: "draft",
      title: `Drafting hit a snag — ${ticketLabel(a)}`,
      body: "Your photos are saved. Tap to retry.",
    });
  }
  // Submission settled.
  if (before.appealStatus === "submitting" && after.appealStatus !== "submitting") {
    addNotification({
      id: `${a.id}-submit-${after.appealStatus}`,
      appealId: a.id,
      kind: "submit",
      title: submitTitle(a, after.appealStatus),
      body: "Tap to see the council's response.",
    });
  }
}


function submitTitle(a: AppealRecord, status: string): string {
  const label = ticketLabel(a);
  switch (status) {
    case "submitted":
    case "under_review":
    case "decision_pending":
      return `Appeal filed — ${label}`;
    case "cancelled":
      return `🎉 PCN cancelled — ${label}`;
    case "rejected":
      return `Appeal rejected — ${label}`;
    default:
      return `${label} updated`;
  }
}
