"use client";

/**
 * Slick bottom-sheet that asks the user for native-Notification permission
 * the *first* time we'd actually fire one — i.e. when they kick off the
 * background validation, drafting, or submission flow. Asking at the moment
 * of value (rather than on app launch) is the higher-grant-rate pattern.
 *
 * Renders nothing when permission is already granted or denied — purely
 * gated by `nativePermission() === "default"`. Stores a "user dismissed
 * once" flag so we don't nag on every kickoff; the user can always
 * re-enable from `/app/profile/notifications`.
 */
import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import {
  nativePermission,
  requestNotificationPermission,
} from "@/lib/client/notifications";

const DISMISSED_KEY = "parkingrabbit.notifications.prompt.dismissed";
// `sessionStorage` (not localStorage) so the "Not now" choice survives
// in-session navigations but resets on a fresh tab. Notifications are
// load-bearing for the background flow — we want to re-ask each session
// rather than silently never ask again after one dismiss.
const dismissedStore = (): Storage | null =>
  typeof window === "undefined" ? null : window.sessionStorage;

interface Props {
  /** Set true to open the sheet — typically right after the user taps
   *  "I agree to Terms & Conditions" / "Draft my appeal — Free" / Submit.
   *  Internally gated to actual permission state so it never double-asks. */
  trigger: boolean;
  /** Fires once the user either grants, denies, or dismisses. */
  onResolved?: () => void;
}

export function NotificationPermissionSheet({ trigger, onResolved }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!trigger) return;
    if (typeof window === "undefined") return;
    // Migrate older builds that wrote the dismissed flag into localStorage
    // (which suppressed the prompt forever). Wipe it on first sight so
    // returning users get re-asked at least once.
    try {
      if (window.localStorage.getItem(DISMISSED_KEY) === "1") {
        window.localStorage.removeItem(DISMISSED_KEY);
      }
    } catch {
      /* private mode etc. */
    }
    const perm = nativePermission();
    if (perm !== "default") {
      onResolved?.();
      return;
    }
    const dismissed = dismissedStore()?.getItem(DISMISSED_KEY) === "1";
    if (dismissed) {
      onResolved?.();
      return;
    }
    // The trigger prop is a tick counter from the parent; opening the
    // sheet in response is an externalised state-machine, not a render
    // cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
  }, [trigger, onResolved]);

  if (!open) return null;

  const close = (markDismissed: boolean) => {
    if (markDismissed) dismissedStore()?.setItem(DISMISSED_KEY, "1");
    setOpen(false);
    onResolved?.();
  };

  const onAllow = async () => {
    setPending(true);
    await requestNotificationPermission();
    setPending(false);
    close(true); // never re-prompt after explicit interaction
  };

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={() => close(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white border-t border-parkingrabbit-border sm:border shadow-2xl p-6 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]"
        style={{ animation: "parkingrabbit-sheet-up 280ms cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="flex items-start gap-3">
          <span className="size-11 rounded-2xl bg-parkingrabbit-primary-50 text-parkingrabbit-primary flex items-center justify-center shrink-0">
            <Bell className="size-5" strokeWidth={1.75} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-parkingrabbit-navy leading-tight">
              Get notified when it&apos;s done
            </p>
            <p className="mt-1.5 text-[13px] text-parkingrabbit-muted leading-relaxed">
              ParkingRabbit works in the background — validation, drafting,
              and council submission can take a minute or two. Allow
              notifications and we&apos;ll ping you the moment each step
              finishes so you don&apos;t have to babysit the page.
            </p>
          </div>
          <button
            type="button"
            onClick={() => close(false)}
            aria-label="Close"
            className="size-8 rounded-full hover:bg-parkingrabbit-bg flex items-center justify-center shrink-0"
          >
            <X className="size-4 text-parkingrabbit-muted" />
          </button>
        </div>

        <ul className="mt-5 space-y-2 text-[12.5px] text-parkingrabbit-navy/85">
          <li className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-parkingrabbit-success" />
            Hear when the council&apos;s verdict lands
          </li>
          <li className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-parkingrabbit-success" />
            Know the moment your appeal letter is drafted
          </li>
          <li className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-parkingrabbit-success" />
            Catch the council&apos;s reply without checking the app
          </li>
        </ul>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onAllow}
            disabled={pending}
            className="rounded-2xl bg-parkingrabbit-primary text-white font-semibold py-3.5 inline-flex items-center justify-center gap-2 hover:bg-parkingrabbit-primary-600 transition shadow-lg shadow-parkingrabbit-primary/30 disabled:opacity-60"
          >
            {pending ? "Asking your browser…" : "Allow notifications"}
          </button>
          <button
            type="button"
            onClick={() => close(true)}
            className="text-xs text-parkingrabbit-muted hover:text-parkingrabbit-navy py-1"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
