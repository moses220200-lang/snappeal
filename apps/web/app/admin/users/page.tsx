import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/server/db/client";

export const dynamic = "force-dynamic";

const ROLE_TONE: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  user: "bg-slate-100 text-slate-700",
};

export default async function AdminUsersPage() {
  const db = getDb();
  // Select only the columns we render. Never pull `passwordHash` into the
  // React tree, even from a Server Component — it would land in the RSC
  // payload and (depending on hydration boundaries) become reachable from
  // a future `"use client"` child.
  const rows = db
    ? await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          displayName: schema.users.displayName,
          role: schema.users.role,
          serviceTier: schema.users.serviceTier,
          createdAt: schema.users.createdAt,
          lastSignInAt: schema.users.lastSignInAt,
        })
        .from(schema.users)
        .orderBy(desc(schema.users.createdAt))
        .limit(200)
    : [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold text-snappeal-navy">Users</h1>
        <p className="text-sm text-snappeal-muted mt-1">
          {rows.length} most recent users. Promote with{" "}
          <code className="font-mono text-[11px]">npm run admin:promote -- email@example.com</code>.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white border border-snappeal-border">
        <table className="w-full text-sm">
          <thead className="bg-snappeal-bg/50">
            <tr className="text-left text-[11px] uppercase tracking-wide text-snappeal-muted">
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Last sign-in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-snappeal-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-snappeal-muted">
                  No users yet.
                </td>
              </tr>
            )}
            {rows.map((u) => (
              <tr key={u.id} className="hover:bg-snappeal-bg/40 transition">
                <td className="px-4 py-3 text-snappeal-navy font-semibold">{u.email}</td>
                <td className="px-4 py-3 text-[11px] text-snappeal-muted">{u.displayName ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${ROLE_TONE[u.role] ?? ROLE_TONE.user}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-[11px] text-snappeal-muted">{u.serviceTier}</td>
                <td className="px-4 py-3 text-[11px] text-snappeal-muted">
                  {new Date(u.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short" })}
                </td>
                <td className="px-4 py-3 text-[11px] text-snappeal-muted">
                  {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
