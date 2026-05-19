import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/server/db/client";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  queued: "bg-slate-100 text-slate-700",
  running: "bg-amber-100 text-amber-700",
  done: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export default async function AdminJobsPage() {
  const db = getDb();
  const rows = db ? await db.select().from(schema.jobs).orderBy(desc(schema.jobs.createdAt)).limit(100) : [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold text-snappeal-navy">Job queue</h1>
        <p className="text-sm text-snappeal-muted mt-1">
          {rows.length} most recent jobs. Failed jobs back off and retry until <code className="font-mono text-[11px]">maxAttempts</code>.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white border border-snappeal-border">
        <table className="w-full text-sm">
          <thead className="bg-snappeal-bg/50">
            <tr className="text-left text-[11px] uppercase tracking-wide text-snappeal-muted">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Kind</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Attempts</th>
              <th className="px-4 py-3">Appeal</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Last error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-snappeal-border">
            {rows.map((j) => (
              <tr key={j.id} className="hover:bg-snappeal-bg/40 transition">
                <td className="px-4 py-3 font-mono text-[11px] text-snappeal-muted truncate max-w-[200px]">{j.id}</td>
                <td className="px-4 py-3 text-[11px] text-snappeal-navy">{j.kind}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${STATUS_TONE[j.status] ?? STATUS_TONE.queued}`}>
                    {j.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[11px] text-snappeal-muted">{j.attempts}/{j.maxAttempts}</td>
                <td className="px-4 py-3 font-mono text-[11px]">
                  {j.appealId ? (
                    <Link href={`/admin/appeals/${j.appealId}`} className="text-snappeal-primary hover:underline">
                      {j.appealId}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-[11px] text-snappeal-muted">
                  {new Date(j.updatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="px-4 py-3 text-[11px] text-red-700 truncate max-w-[260px]">{j.lastError ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
