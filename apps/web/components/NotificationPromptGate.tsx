"use client";

/**
 * NotificationPromptGate — server-aware wrapper around
 * NotificationPermissionSheet. Handles the "ask once per moment"
 * logic centrally so callsites don't reinvent it.
 *
 * Two moments where the prompt makes sense (never more than once each):
 *   1. `appealTap` — user just tapped the Appeal tile. Strong context:
 *      "We'll ping you when the council confirms your PCN."
 *   2. `submitDone` — submit_appeal job succeeded. The customer just
 *      paid £2.99 and the appeal is filed. "We'll ping you when the
 *      council replies (usually within 56 days)."
 *
 * Skip rules:
 *   - Native Notification.permission !== "default" → already granted
 *     or hard-denied; nothing to ask.
 *   - User row's `notification_prefs.pushAskedAt[moment]` is set → we
 *     already asked at this moment; never re-ask.
 *   - Viewer is a guest (no userId) → no persistent prefs surface;
 *     the sheet still shows (it's a per-session ask) but we don't
 *     POST the asked-at flag.
 *
 * After the sheet resolves, POSTs to
 * /api/users/me/notification-prefs/asked so the skip-once flag
 * persists across sessions for signed-in users.
 */
import { useEffect, useState } from "react";
import { NotificationPermissionSheet } from "@/components/NotificationPermissionSheet";

export type PromptMoment = "appealTap" | "submitDone";

interface Props {
  /** Bumping this number opens the gate. Callers use a `useState`
   *  counter the same way they did before with
   *  `NotificationPermissionSheet`. */
  trigger: number;
  /** Which moment this gate represents. */
  moment: PromptMoment;
  /** Optional callback fired once the gate fully resolves (sheet
   *  shown + dismissed, OR skipped because permission already
   *  granted, OR skipped because we already asked at this moment). */
  onResolved?: () => void;
}

interface AskedStatus {
  /** true = we already asked at this moment for this user. */
  asked: boolean;
  /** true = the gate has loaded its server-side status. Until this
   *  flips, we don't show the sheet (avoids a flash-then-skip when
   *  the server already has us recorded). */
  loaded: boolean;
}

export function NotificationPromptGate({
  trigger,
  moment,
  onResolved,
}: Props) {
  const [askedStatus, setAskedStatus] = useState<AskedStatus>({
    asked: false,
    loaded: false,
  });

  // One-shot read of the server-side pushAskedAt for this moment.
  // Cheap (single user row); we do it once per gate mount.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/users/me/notification-prefs", {
          cache: "no-store",
        });
        if (!alive) return;
        if (!res.ok) {
          // 401 = guest. Treat as "not asked" so the sheet still
          // shows; we just won't persist the asked-at.
          setAskedStatus({ asked: false, loaded: true });
          return;
        }
        const json = (await res.json()) as {
          prefs?: { pushAskedAt?: Record<string, string> };
        };
        const askedAt = json.prefs?.pushAskedAt?.[moment];
        setAskedStatus({ asked: Boolean(askedAt), loaded: true });
      } catch {
        if (alive) setAskedStatus({ asked: false, loaded: true });
      }
    })();
    return () => {
      alive = false;
    };
  }, [moment]);

  // Only forward the trigger if (a) loaded, (b) not already asked.
  const effectiveTrigger =
    askedStatus.loaded && !askedStatus.asked ? trigger : 0;

  // When the sheet resolves, persist the asked-at server-side. Fire
  // the optional caller callback either way (so the caller's flow
  // can proceed regardless of whether the user granted or dismissed).
  const handleResolved = () => {
    // Mark this moment asked server-side (best-effort; guests get a
    // 200 with `ignored: "guest"`).
    void fetch("/api/users/me/notification-prefs/asked", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ moment }),
    }).catch(() => {});
    // Update our local state so we don't re-prompt within this
    // session even before the next page load reads server state.
    setAskedStatus((s) => ({ ...s, asked: true }));
    onResolved?.();
  };

  // While we're still loading the asked-at status, render nothing.
  // After load, if already asked, render nothing AND fire onResolved
  // so the caller flow proceeds. If not asked, mount the sheet with
  // the trigger.
  useEffect(() => {
    if (askedStatus.loaded && askedStatus.asked && trigger > 0) {
      onResolved?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askedStatus.loaded, askedStatus.asked, trigger]);

  if (!askedStatus.loaded) return null;
  if (askedStatus.asked) return null;

  return (
    <NotificationPermissionSheet
      trigger={effectiveTrigger > 0}
      onResolved={handleResolved}
    />
  );
}
