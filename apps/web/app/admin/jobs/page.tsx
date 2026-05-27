import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/server/db/client";
import { JobRowActions } from "@/components/JobRowActions";
import { DryRunButton } from "@/components/DryRunButton";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  queued: "bg-slate-100 text-slate-700",
  running: "bg-amber-100 text-amber-700",
  done: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export default async function AdminJobsPage() {
  const db = getDb();
  const rows = db
    ? await db
        .select({
          id: schema.jobs.id,
          kind: schema.jobs.kind,
          status: schema.jobs.status,
          attempts: schema.jobs.attempts,
          maxAttempts: schema.jobs.maxAttempts,
          appealId: schema.jobs.appealId,
          updatedAt: schema.jobs.updatedAt,
          lastError: schema.jobs.lastError,
          councilSlug: schema.appeals.councilSlug,
        })
        .from(schema.jobs)
        .leftJoin(schema.appeals, eq(schema.appeals.id, schema.jobs.appealId))
        .orderBy(desc(schema.jobs.createdAt))
        .limit(100)
    : [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold text-parkingrabbit-navy">Job queue</h1>
        <p className="text-sm text-parkingrabbit-muted mt-1">
          {rows.length} most recent jobs. Failed jobs back off and retry until <code className="font-mono text-[11px]">maxAttempts</code>.
          For failed <code className="font-mono text-[11px]">submit_appeal</code> jobs, use <span className="font-semibold text-parkingrabbit-navy">Dry-run</span>
          {" "}to reproduce the portal flow against the real ticket data without resubmitting.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white border border-parkingrabbit-border">
        <table className="w-full text-sm">
          <thead className="bg-parkingrabbit-bg/50">
            <tr className="text-left text-[11px] uppercase tracking-wide text-parkingrabbit-muted">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Kind</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Attempts</th>
              <th className="px-4 py-3">Appeal</th>
              <th className="px-4 py-3">Council</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Last error</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-parkingrabbit-border">
            {rows.map((j) => (
              <tr key={j.id} className="hover:bg-parkingrabbit-bg/40 transition">
                <td className="px-4 py-3 font-mono text-[11px] text-parkingrabbit-muted truncate max-w-[200px]">{j.id}</td>
                <td className="px-4 py-3 text-[11px] text-parkingrabbit-navy">{j.kind}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${STATUS_TONE[j.status] ?? STATUS_TONE.queued}`}>
                    {j.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[11px] text-parkingrabbit-muted">{j.attempts}/{j.maxAttempts}</td>
                <td className="px-4 py-3 font-mono text-[11px]">
                  {j.appealId ? (
                    <Link href={`/admin/appeals/${j.appealId}`} className="text-parkingrabbit-primary hover:underline">
                      {j.appealId}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-[11px] capitalize text-parkingrabbit-navy">
                  {j.councilSlug ? j.councilSlug.replace(/-/g, " ") : <span className="text-parkingrabbit-muted">—</span>}
                </td>
                <td className="px-4 py-3 text-[11px] text-parkingrabbit-muted">
                  {new Date(j.updatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="px-4 py-3 text-[11px] text-red-700 truncate max-w-[220px]">{j.lastError ?? ""}</td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-3 justify-end">
                    {j.kind === "submit_appeal" && j.councilSlug && (
                      <DryRunButton councilSlug={j.councilSlug} appealId={j.appealId} />
                    )}
                    <JobRowActions id={j.id} status={j.status} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
