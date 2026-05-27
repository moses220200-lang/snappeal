/**
 * /admin/users/[id] — single-user admin view.
 *
 * Shows identity strip + their notification_prefs (read-only here),
 * recent appeals, and recent push dispatches for this user. The
 * client-side editor (UserPrefsEditor) lives in a separate component
 * so this server component can stay async.
 *
 * Admin CRUD:
 *   - Read: prefs + appeals + dispatch log
 *   - Update: flip any boolean toggle via the inline editor
 *   - Delete-ish: "Reset asked-at" wipes the skip-once tracker so the
 *     NotificationPromptGate prompts again. "Clear push subscription"
 *     forces the user to re-subscribe (useful when an endpoint went
 *     bad and we want them to re-grant in the browser).
 */
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/lib/server/db/client";
import { mergePrefs } from "@/lib/server/notifications/types";
import { UserPrefsEditor } from "@/components/admin/UserPrefsEditor";

export const dynamic = "force-dynamic";

const RESULT_TONE: Record<string, string> = {
  sent: "bg-green-100 text-green-700",
  toggle_off: "bg-slate-100 text-slate-600",
  no_subscription: "bg-slate-100 text-slate-600",
  send_gone: "bg-amber-100 text-amber-700",
  send_failed: "bg-red-100 text-red-700",
};

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  if (!db) notFound();
  const userRows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      displayName: schema.users.displayName,
      role: schema.users.role,
      serviceTier: schema.users.serviceTier,
      createdAt: schema.users.createdAt,
      lastSignInAt: schema.users.lastSignInAt,
      emailVerifiedAt: schema.users.emailVerifiedAt,
      phone: schema.users.phone,
      addressLine1: schema.users.addressLine1,
      addressLine2: schema.users.addressLine2,
      addressCity: schema.users.addressCity,
      addressPostcode: schema.users.addressPostcode,
      notificationPrefs: schema.users.notificationPrefs,
    })
    .from(schema.users)
    .where(eq(schema.users.id, id));
  const user = userRows[0];
  if (!user) notFound();

  const [appeals, dispatches] = await Promise.all([
    db
      .select({
        id: schema.appeals.id,
        status: schema.appeals.status,
        councilSlug: schema.appeals.councilSlug,
        createdAt: schema.appeals.createdAt,
      })
      .from(schema.appeals)
      .where(eq(schema.appeals.userId, id))
      .orderBy(desc(schema.appeals.createdAt))
      .limit(20),
    db
      .select()
      .from(schema.notificationDispatches)
      .where(eq(schema.notificationDispatches.userId, id))
      .orderBy(desc(schema.notificationDispatches.createdAt))
      .limit(30),
  ]);

  const prefs = mergePrefs(user.notificationPrefs);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/admin/users" className="text-xs text-parkingrabbit-primary">
          ← Back to Users
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-parkingrabbit-navy">
          {user.displayName ?? user.email}
        </h1>
        <p className="text-sm text-parkingrabbit-muted mt-1 font-mono">
          {user.email} · <span>{user.id}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Identity">
          <Kv label="ID" value={user.id} mono />
          <Kv label="Email" value={user.email} />
          <Kv label="Display name" value={user.displayName ?? "—"} />
          <Kv label="Role" value={user.role} />
          <Kv label="Service tier" value={user.serviceTier} />
          <Kv label="Email verified" value={user.emailVerifiedAt ? new Date(user.emailVerifiedAt).toLocaleString("en-GB") : "—"} />
          <Kv label="Created" value={new Date(user.createdAt).toLocaleString("en-GB")} />
          <Kv label="Last sign-in" value={user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString("en-GB") : "—"} />
        </Card>
        <Card title="Postal address (for council forms)">
          <Kv label="Address line 1" value={user.addressLine1 ?? "—"} />
          <Kv label="Address line 2" value={user.addressLine2 ?? "—"} />
          <Kv label="City" value={user.addressCity ?? "—"} />
          <Kv label="Postcode" value={user.addressPostcode ?? "—"} mono />
          <Kv label="Phone" value={user.phone ?? "—"} mono />
        </Card>
      </div>

      {/* The big one — notification prefs editor */}
      <UserPrefsEditor userId={user.id} initialPrefs={prefs} />

      <Card title={`Appeals (${appeals.length})`}>
        {appeals.length === 0 ? (
          <p className="text-xs text-parkingrabbit-muted">No appeals for this user.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {appeals.map((a) => (
              <li key={a.id} className="text-[11.5px] flex items-center gap-3">
                <Link href={`/admin/appeals/${a.id}`} className="font-mono text-parkingrabbit-primary hover:underline">
                  {a.id}
                </Link>
                <span className="text-parkingrabbit-muted">{a.status}</span>
                {a.councilSlug && (
                  <span className="text-parkingrabbit-muted">· {a.councilSlug}</span>
                )}
                <span className="text-parkingrabbit-muted">
                  · {new Date(a.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Push dispatches (${dispatches.length})`}>
        {dispatches.length === 0 ? (
          <p className="text-xs text-parkingrabbit-muted">No dispatches recorded.</p>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-parkingrabbit-muted">
                <th className="py-1.5 pr-3">When</th>
                <th className="py-1.5 pr-3">Event</th>
                <th className="py-1.5 pr-3">Result</th>
                <th className="py-1.5 pr-3">Title</th>
                <th className="py-1.5">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-parkingrabbit-border">
              {dispatches.map((d) => {
                const payload = d.payload as { title?: string } | null;
                return (
                  <tr key={d.id}>
                    <td className="py-1.5 pr-3 text-parkingrabbit-muted whitespace-nowrap">
                      {new Date(d.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="py-1.5 pr-3 font-mono">{d.event}</td>
                    <td className="py-1.5 pr-3">
                      <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${RESULT_TONE[d.result] ?? "bg-slate-100 text-slate-600"}`}>
                        {d.result}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-parkingrabbit-navy">{payload?.title ?? "—"}</td>
                    <td className="py-1.5 text-parkingrabbit-muted text-[10.5px]">{d.reason ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white border border-parkingrabbit-border p-5">
      <p className="text-sm font-bold text-parkingrabbit-navy mb-3">{title}</p>
      {children}
    </section>
  );
}

function Kv({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-1 text-[11.5px]">
      <span className="text-parkingrabbit-muted w-[140px] shrink-0">{label}</span>
      <span className={`text-parkingrabbit-navy break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
