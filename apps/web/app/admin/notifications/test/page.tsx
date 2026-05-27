"use client";

/**
 * /admin/notifications/test — admin tool to fire a test push at a
 * specific user. The user must have a push subscription on file
 * (granted permission + completed /api/push/subscribe at some point).
 *
 * Result is shown inline + logged to `notification_dispatches` with
 * `event = 'test'`. The /admin/notifications log surface shows it
 * alongside real dispatches.
 */
import Link from "next/link";
import { ChevronLeft, Loader2, Send } from "lucide-react";
import { useEffect, useState } from "react";

interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
  hasPushSubscription: boolean;
}

export default function AdminTestNotificationPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [userId, setUserId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/app/tickets");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<
    | { ok: true; dispatchId: string }
    | { ok: false; reason: string; gone: boolean }
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/admin/notifications/users", {
          cache: "no-store",
        });
        if (!alive) return;
        if (res.ok) {
          const json = (await res.json()) as { users: UserRow[] };
          setUsers(json.users);
        }
      } catch {
        /* swallow — surface error on send */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const send = async () => {
    if (!userId) {
      setError("Pick a user first.");
      return;
    }
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/notifications/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId,
          title: title || undefined,
          body: body || undefined,
          url: url || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message ?? `Failed (${res.status})`);
      }
      if (json.sent) {
        setResult({ ok: true, dispatchId: json.dispatchId });
      } else {
        setResult({
          ok: false,
          reason: json.reason ?? "unknown",
          gone: json.gone ?? false,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  const subscribedUsers = users?.filter((u) => u.hasPushSubscription) ?? [];

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div>
        <Link
          href="/admin/notifications"
          className="text-xs text-parkingrabbit-primary inline-flex items-center gap-1"
        >
          <ChevronLeft className="size-3.5" /> Back to Notifications
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-parkingrabbit-navy">
          Send test push
        </h1>
        <p className="text-sm text-parkingrabbit-muted mt-1">
          Fires a one-off notification to a specific user. Bypasses the
          per-event toggle gate so a test always lands (assuming the user has a
          subscription). Logged in <code className="font-mono text-[11px]">notification_dispatches</code> with{" "}
          <code className="font-mono text-[11px]">event = &lsquo;test&rsquo;</code>.
        </p>
      </div>

      <section className="rounded-2xl bg-white border border-parkingrabbit-border p-5 flex flex-col gap-4">
        <Field
          label={`Recipient (${subscribedUsers.length} of ${users?.length ?? "?"} users have a push subscription)`}
        >
          {!users ? (
            <p className="text-xs text-parkingrabbit-muted">Loading users…</p>
          ) : (
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full rounded-xl border border-parkingrabbit-border bg-parkingrabbit-bg/50 px-3 py-2.5 text-sm text-parkingrabbit-navy outline-none focus:border-parkingrabbit-primary"
            >
              <option value="">Pick a user…</option>
              <optgroup label="With push subscription">
                {subscribedUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName ? `${u.displayName} · ` : ""}
                    {u.email} ({u.id.slice(0, 14)}…)
                  </option>
                ))}
              </optgroup>
              <optgroup label="No push subscription (will fail with 'no_subscription')">
                {(users ?? [])
                  .filter((u) => !u.hasPushSubscription)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName ? `${u.displayName} · ` : ""}
                      {u.email}
                    </option>
                  ))}
              </optgroup>
            </select>
          )}
        </Field>

        <Field label="Title (optional)" hint="Max 80 chars">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Test notification"
            maxLength={80}
            className="w-full rounded-xl border border-parkingrabbit-border bg-parkingrabbit-bg/50 px-3 py-2.5 text-sm text-parkingrabbit-navy outline-none focus:border-parkingrabbit-primary"
          />
        </Field>

        <Field label="Body (optional)" hint="Max 200 chars">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Admin-initiated test from /admin/notifications/test"
            maxLength={200}
            rows={3}
            className="w-full rounded-xl border border-parkingrabbit-border bg-parkingrabbit-bg/50 px-3 py-2.5 text-sm text-parkingrabbit-navy outline-none focus:border-parkingrabbit-primary resize-y"
          />
        </Field>

        <Field label="Deep link URL" hint="Path the browser opens when the notification is tapped">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/app/tickets"
            className="w-full rounded-xl border border-parkingrabbit-border bg-parkingrabbit-bg/50 px-3 py-2.5 text-sm font-mono text-parkingrabbit-navy outline-none focus:border-parkingrabbit-primary"
          />
        </Field>

        <button
          type="button"
          onClick={send}
          disabled={sending || !userId}
          className="self-start inline-flex items-center gap-2 rounded-2xl bg-parkingrabbit-action text-white font-semibold px-5 py-3 shadow-lg shadow-parkingrabbit-action/40 hover:bg-parkingrabbit-action-600 transition disabled:opacity-60"
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          Send test push
        </button>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        )}

        {result && (
          <div
            className={`rounded-xl border px-3 py-2 text-xs ${
              result.ok
                ? "border-green-200 bg-green-50 text-green-800"
                : result.gone
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {result.ok ? (
              <>
                ✓ Push sent. Dispatch ID:{" "}
                <code className="font-mono">{result.dispatchId}</code>
              </>
            ) : (
              <>
                {result.gone ? "Subscription gone (410)" : "Send failed"} —{" "}
                <code className="font-mono">{result.reason}</code>.
                {result.gone &&
                  " We've cleared the stored subscription from this user's prefs."}
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-parkingrabbit-muted">
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-[10px] text-parkingrabbit-muted">{hint}</span>
      )}
    </label>
  );
}
