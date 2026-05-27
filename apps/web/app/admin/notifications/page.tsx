/**
 * /admin/notifications — admin CRUD over the push-notification system.
 *
 * Three views combined:
 *   1. Dispatch log (top): every push attempt across all users +
 *      filters by event / result / user.
 *   2. Stats strip: counts by result over the last 7 days so the
 *      admin can spot a spike of failures / gone subs.
 *   3. Quick links: per-user prefs (jump to /admin/users/<id>) + send
 *      test push (admin-fired) routes.
 *
 * "Read" = view log + per-user prefs. "Create" = send test push.
 * "Update" = edit per-user prefs from the user detail page. "Delete"
 * = clear pushAskedAt / push subscription via dedicated buttons on
 * the user prefs page.
 *
 * The page is admin-only via `requireAdminPage()` on the admin layout
 * (no need to repeat the check here).
 */
import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/server/db/client";

export const dynamic = "force-dynamic";

const RESULT_TONE: Record<string, string> = {
  sent: "bg-green-100 text-green-700",
  toggle_off: "bg-slate-100 text-slate-600",
  no_subscription: "bg-slate-100 text-slate-600",
  no_owner: "bg-slate-100 text-slate-600",
  send_gone: "bg-amber-100 text-amber-700",
  send_failed: "bg-red-100 text-red-700",
  no_vapid: "bg-red-100 text-red-700",
  no_appeal: "bg-red-100 text-red-700",
  db_missing: "bg-red-100 text-red-700",
};

interface SearchParams {
  result?: string;
  event?: string;
  user?: string;
}

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const db = getDb();
  if (!db)
    return (
      <p className="text-sm text-parkingrabbit-muted">Database not configured.</p>
    );

  // Build the dispatch-log query. Drizzle doesn't compose `where`
  // conditionally as cleanly as raw SQL here, so we use sql template
  // for the filter clause.
  const filters: string[] = [];
  const params: unknown[] = [];
  if (sp.result) {
    filters.push(`result = $${params.length + 1}`);
    params.push(sp.result);
  }
  if (sp.event) {
    filters.push(`event = $${params.length + 1}`);
    params.push(sp.event);
  }
  if (sp.user) {
    filters.push(`user_id = $${params.length + 1}`);
    params.push(sp.user);
  }
  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  // Run two queries: filtered list + last-7-days stats. Stats ignore
  // the filters so the admin always sees the overall health.
  const [dispatches, stats, eventDistinct, resultDistinct] = await Promise.all([
    db.execute(
      sql.raw(
        `SELECT id, user_id, appeal_id, event, payload, result, reason, created_at
         FROM notification_dispatches
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT 100`,
      ),
    ) as Promise<
      Array<{
        id: string;
        user_id: string | null;
        appeal_id: string | null;
        event: string;
        payload: { title?: string; body?: string } | null;
        result: string;
        reason: string | null;
        created_at: string;
      }>
    >,
    db.execute(
      sql.raw(
        `SELECT result, count(*)::int AS n
         FROM notification_dispatches
         WHERE created_at > now() - interval '7 days'
         GROUP BY result
         ORDER BY n DESC`,
      ),
    ) as Promise<Array<{ result: string; n: number }>>,
    db.execute(
      sql.raw(
        `SELECT DISTINCT event FROM notification_dispatches ORDER BY event`,
      ),
    ) as Promise<Array<{ event: string }>>,
    db.execute(
      sql.raw(
        `SELECT DISTINCT result FROM notification_dispatches ORDER BY result`,
      ),
    ) as Promise<Array<{ result: string }>>,
  ]);

  const totalLast7 = stats.reduce((sum, r) => sum + r.n, 0);
  const sentLast7 = stats.find((r) => r.result === "sent")?.n ?? 0;
  const failedLast7 = stats
    .filter((r) =>
      ["send_failed", "send_gone", "no_vapid"].includes(r.result),
    )
    .reduce((sum, r) => sum + r.n, 0);
  const successRate =
    totalLast7 > 0 ? Math.round((sentLast7 / totalLast7) * 100) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-parkingrabbit-navy">
            Notifications
          </h1>
          <p className="text-sm text-parkingrabbit-muted mt-1 max-w-2xl">
            Push-notification audit log. Every <code className="font-mono text-[11px]">dispatchAppealEvent()</code> call writes a row here regardless of outcome —
            so &ldquo;why didn&apos;t user X get pinged?&rdquo; has a paper
            trail.
          </p>
        </div>
        <Link
          href="/admin/notifications/test"
          className="inline-flex items-center gap-2 rounded-2xl bg-parkingrabbit-action text-white font-semibold px-4 py-2.5 shadow-md hover:bg-parkingrabbit-action-600 transition text-sm"
        >
          Send test push →
        </Link>
      </div>

      {/* Stats strip — last 7 days */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Sent (7d)" value={String(sentLast7)} tone="positive" />
        <Stat label="Failed (7d)" value={String(failedLast7)} tone="danger" />
        <Stat
          label="Total dispatches"
          value={String(totalLast7)}
          tone="neutral"
        />
        <Stat
          label="Success rate"
          value={successRate != null ? `${successRate}%` : "—"}
          tone={successRate == null ? "neutral" : successRate >= 80 ? "positive" : "warn"}
        />
      </div>

      {/* Filters */}
      <form
        method="get"
        className="rounded-2xl bg-white border border-parkingrabbit-border p-4 flex flex-wrap items-end gap-3"
      >
        <FilterSelect
          name="result"
          label="Result"
          value={sp.result ?? ""}
          options={resultDistinct.map((r) => r.result)}
        />
        <FilterSelect
          name="event"
          label="Event"
          value={sp.event ?? ""}
          options={eventDistinct.map((e) => e.event)}
        />
        <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
          <label className="text-[10px] font-bold uppercase tracking-wider text-parkingrabbit-muted">
            User ID
          </label>
          <input
            name="user"
            defaultValue={sp.user ?? ""}
            placeholder="u_…"
            className="rounded-xl border border-parkingrabbit-border bg-parkingrabbit-bg/50 px-3 py-2 text-xs font-mono text-parkingrabbit-navy outline-none focus:border-parkingrabbit-primary"
          />
        </div>
        <button
          type="submit"
          className="rounded-2xl bg-parkingrabbit-primary text-white font-semibold px-4 py-2 text-xs"
        >
          Filter
        </button>
        {(sp.result || sp.event || sp.user) && (
          <Link
            href="/admin/notifications"
            className="text-[11px] text-parkingrabbit-muted hover:text-parkingrabbit-navy"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Dispatch log table */}
      <div className="overflow-x-auto rounded-2xl bg-white border border-parkingrabbit-border">
        <table className="w-full text-sm">
          <thead className="bg-parkingrabbit-bg/50">
            <tr className="text-left text-[11px] uppercase tracking-wide text-parkingrabbit-muted">
              <th className="px-3 py-3">When</th>
              <th className="px-3 py-3">Event</th>
              <th className="px-3 py-3">Result</th>
              <th className="px-3 py-3">User</th>
              <th className="px-3 py-3">Appeal</th>
              <th className="px-3 py-3">Title</th>
              <th className="px-3 py-3">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-parkingrabbit-border">
            {dispatches.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-parkingrabbit-muted text-sm"
                >
                  No dispatches{" "}
                  {sp.result || sp.event || sp.user
                    ? "match those filters"
                    : "yet"}
                  .
                </td>
              </tr>
            ) : (
              dispatches.map((d) => (
                <tr
                  key={d.id}
                  className="hover:bg-parkingrabbit-bg/30 transition text-[11.5px]"
                >
                  <td className="px-3 py-2.5 text-parkingrabbit-muted whitespace-nowrap">
                    {new Date(d.created_at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-parkingrabbit-navy">
                    {d.event}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${RESULT_TONE[d.result] ?? "bg-slate-100 text-slate-600"}`}
                    >
                      {d.result}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-parkingrabbit-muted">
                    {d.user_id ? (
                      <Link
                        href={`/admin/users/${d.user_id}`}
                        className="hover:text-parkingrabbit-primary"
                      >
                        {d.user_id.slice(0, 14)}…
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-parkingrabbit-muted">
                    {d.appeal_id ? (
                      <Link
                        href={`/admin/appeals/${d.appeal_id}`}
                        className="hover:text-parkingrabbit-primary"
                      >
                        {d.appeal_id.slice(0, 14)}…
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-parkingrabbit-navy">
                    {d.payload?.title ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-parkingrabbit-muted text-[10.5px]">
                    {d.reason ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-parkingrabbit-muted">
        Showing {dispatches.length} of the most recent matching dispatches. Per-user
        preferences are editable from each user&apos;s profile (link in the
        User column).
      </p>
    </div>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: string[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold uppercase tracking-wider text-parkingrabbit-muted">
        {label}
      </label>
      <select
        name={name}
        defaultValue={value}
        className="rounded-xl border border-parkingrabbit-border bg-parkingrabbit-bg/50 px-3 py-2 text-xs text-parkingrabbit-navy outline-none focus:border-parkingrabbit-primary min-w-[140px]"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "positive" | "warn" | "danger" | "neutral";
}) {
  const palette =
    tone === "positive"
      ? "bg-green-50 border-green-200"
      : tone === "warn"
        ? "bg-amber-50 border-amber-200"
        : tone === "danger"
          ? "bg-red-50 border-red-200"
          : "bg-white border-parkingrabbit-border";
  return (
    <div className={`rounded-2xl border p-4 ${palette}`}>
      <p className="text-[10px] uppercase tracking-wider font-bold text-parkingrabbit-muted">
        {label}
      </p>
      <p className="text-2xl font-bold text-parkingrabbit-navy mt-1 font-mono">
        {value}
      </p>
    </div>
  );
}
