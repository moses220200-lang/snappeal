"use client";

/**
 * Admin-side editor for a user's notification preferences.
 *
 * Reads initial state from the server-rendered page, writes through
 * /api/admin/users/[id]/notification-prefs. Distinct from the
 * customer-facing /api/users/me/notification-prefs because:
 *   - Admin must specify which user (security)
 *   - Admin can RESET pushAskedAt (re-prompt user)
 *   - Admin can CLEAR push subscription (force re-subscribe)
 *
 * Every change is optimistic with rollback on error.
 */
import { useState } from "react";
import { Loader2, RefreshCw, Trash2, Send } from "lucide-react";
import type { NotificationPrefs } from "@/lib/server/notifications/types";

interface Props {
  userId: string;
  initialPrefs: NotificationPrefs;
}

type ToggleKey =
  | "pushOnValidation"
  | "pushOnSubmission"
  | "pushOnCouncilReply"
  | "emailOnCouncilReply"
  | "emailOnSubmission"
  | "showMcpLiveView";

const TOGGLES: Array<{ key: ToggleKey; label: string; body: string }> = [
  {
    key: "pushOnValidation",
    label: "Push: PCN verified",
    body: "Fires when pcn_lookup verdict lands (validation_done / validation_failed events).",
  },
  {
    key: "pushOnSubmission",
    label: "Push: appeal submitted",
    body: "Fires on submit_appeal success/failure.",
  },
  {
    key: "pushOnCouncilReply",
    label: "Push: council replied",
    body: "Fires on inbound-mail webhook (council_replied event).",
  },
  {
    key: "emailOnCouncilReply",
    label: "Email: council replied",
    body: "Future wire — not yet implemented in the dispatcher.",
  },
  {
    key: "emailOnSubmission",
    label: "Email: submitted",
    body: "Future wire — not yet implemented.",
  },
  {
    key: "showMcpLiveView",
    label: "Show MCP live view",
    body: "Customer's display preference for the live screenshot strip during validation/submission.",
  },
];

export function UserPrefsEditor({ userId, initialPrefs }: Props) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(initialPrefs);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const patch = async (body: Record<string, unknown>, key: string) => {
    setPending(key);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/notification-prefs`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json?.error?.message ?? `Save failed (${res.status})`);
      setPrefs(json.prefs as NotificationPrefs);
      if (body._info) setInfo(body._info as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="rounded-2xl bg-white border border-parkingrabbit-border p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <p className="text-sm font-bold text-parkingrabbit-navy">
            Notification preferences
          </p>
          <p className="text-[11px] text-parkingrabbit-muted mt-0.5">
            Editing on behalf of this user. Changes take effect on the next
            event (or right now for the &ldquo;Watch live&rdquo; preference).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {prefs.push ? (
            <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-green-100 text-green-700">
              ✓ Subscribed
            </span>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-slate-100 text-slate-600">
              No subscription
            </span>
          )}
        </div>
      </div>

      {/* Toggles */}
      <div className="divide-y divide-parkingrabbit-border/60">
        {TOGGLES.map((t) => (
          <div
            key={t.key}
            className="py-3 flex items-start gap-4"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-semibold text-parkingrabbit-navy">
                {t.label}
              </p>
              <p className="text-[11px] text-parkingrabbit-muted mt-0.5 leading-snug">
                {t.body}
              </p>
            </div>
            {pending === t.key ? (
              <Loader2 className="size-4 animate-spin text-parkingrabbit-muted" />
            ) : (
              <ToggleSwitch
                on={prefs[t.key]}
                onChange={(next) => patch({ [t.key]: next }, t.key)}
              />
            )}
          </div>
        ))}
      </div>

      {/* Destructive actions */}
      <div className="mt-4 pt-4 border-t border-parkingrabbit-border flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            if (
              !confirm(
                "Reset the 'we already asked' tracker? The user will see the notification permission sheet again at their next Appeal-tap and at submit-success.",
              )
            )
              return;
            void patch(
              { resetAskedAt: true, _info: "Asked-at tracker reset." },
              "resetAskedAt",
            );
          }}
          disabled={pending === "resetAskedAt"}
          className="inline-flex items-center gap-2 rounded-xl bg-white border border-parkingrabbit-border text-[11.5px] font-semibold text-parkingrabbit-navy px-3 py-2 hover:border-parkingrabbit-primary transition disabled:opacity-60"
        >
          {pending === "resetAskedAt" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Reset asked-at tracker
          <span className="text-parkingrabbit-muted font-normal">
            ({Object.keys(prefs.pushAskedAt).length} moments recorded)
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (
              !confirm(
                "Clear this user's push subscription? They'll have to re-grant permission on their next visit. Use this when an endpoint went bad.",
              )
            )
              return;
            void patch(
              {
                clearSubscription: true,
                _info: "Push subscription cleared.",
              },
              "clearSubscription",
            );
          }}
          disabled={!prefs.push || pending === "clearSubscription"}
          className="inline-flex items-center gap-2 rounded-xl bg-white border border-parkingrabbit-border text-[11.5px] font-semibold text-parkingrabbit-muted px-3 py-2 hover:text-red-700 hover:border-red-300 transition disabled:opacity-40"
        >
          {pending === "clearSubscription" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
          Clear push subscription
        </button>
        <a
          href={`/admin/notifications/test?user=${userId}`}
          className="inline-flex items-center gap-2 rounded-xl bg-parkingrabbit-primary-50 border border-parkingrabbit-primary/20 text-parkingrabbit-primary text-[11.5px] font-semibold px-3 py-2 hover:bg-parkingrabbit-primary hover:text-white transition"
        >
          <Send className="size-3.5" />
          Send test push…
        </a>
      </div>

      {info && (
        <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-[11.5px] text-green-800">
          ✓ {info}
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-800">
          {error}
        </div>
      )}

      {Object.keys(prefs.pushAskedAt).length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[11.5px] font-semibold text-parkingrabbit-primary">
            Asked-at tracker (skip-once moments)
          </summary>
          <pre className="mt-2 bg-parkingrabbit-bg/50 rounded-lg p-3 text-[11px] text-parkingrabbit-navy overflow-x-auto">
            {JSON.stringify(prefs.pushAskedAt, null, 2)}
          </pre>
        </details>
      )}
    </section>
  );
}

function ToggleSwitch({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition shrink-0 ${
        on ? "bg-parkingrabbit-success" : "bg-parkingrabbit-border"
      }`}
    >
      <span
        className={`inline-block size-5 transform rounded-full bg-white shadow transition ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
