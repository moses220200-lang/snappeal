"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { haptic } from "@/lib/client/haptics";

/**
 * Web Push permission card. Renders nothing if push is unsupported or
 * permission already granted. On grant, registers the service worker and
 * POSTs the subscription to /api/push/subscribe for storage against the
 * current user.
 *
 * The subscription endpoint accepts the subscription as opaque JSON; it's
 * persisted to a `push_subscriptions` table (TBD — see migrations).
 */
export function PushPermission({ inline = false }: { inline?: boolean }) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(ok);
    if (ok) {
       
      setPermission(Notification.permission);
    }
  }, []);

  if (!supported || permission === "granted") return null;

  const request = async () => {
    haptic("tap");
    const status = await Notification.requestPermission();
    setPermission(status);
    if (status !== "granted") return;

    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        // No VAPID key wired yet — registration is enough for now, push
        // will work once the server-side key is in place.
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      haptic("success");
    } catch {
      haptic("error");
    }
  };

  return (
    <button
      type="button"
      onClick={request}
      className={`flex items-center gap-3 ${
        inline
          ? "rounded-full bg-snappeal-primary-100 text-snappeal-primary-700 px-4 py-2 text-xs font-bold"
          : "w-full rounded-2xl bg-white border border-snappeal-border p-4 hover:border-snappeal-primary transition"
      }`}
    >
      <span
        className={`flex items-center justify-center flex-shrink-0 ${
          inline ? "" : "size-9 rounded-xl bg-snappeal-primary-100 text-snappeal-primary"
        }`}
      >
        {permission === "denied" ? (
          <BellOff className={inline ? "size-3.5" : "size-[1.125rem]"} />
        ) : (
          <Bell className={inline ? "size-3.5" : "size-[1.125rem]"} />
        )}
      </span>
      {inline ? (
        <span>Turn on push alerts</span>
      ) : (
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold text-snappeal-navy">
            {permission === "denied" ? "Notifications are off" : "Turn on push alerts"}
          </p>
          <p className="text-xs text-snappeal-muted mt-0.5">
            We&apos;ll ping you when the council replies. No marketing — ever.
          </p>
        </div>
      )}
    </button>
  );
}

/* VAPID key conversion — Web Push wants Uint8Array form of the base64 key. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}
