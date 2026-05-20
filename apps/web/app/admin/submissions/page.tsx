import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/server/db/client";
import { getCouncilLookup } from "@/lib/server/councils";
import { CouncilBadge } from "@/components/CouncilBadge";
import { DryRunButton } from "@/components/DryRunButton";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  queued: "bg-slate-100 text-slate-700",
  submitting: "bg-amber-100 text-amber-700",
  submitted: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export default async function AdminSubmissionsPage() {
  const db = getDb();
  const rows = db
    ? await db
        .select({
          id: schema.submissions.id,
          appealId: schema.submissions.appealId,
          status: schema.submissions.status,
          method: schema.submissions.method,
          councilReference: schema.submissions.councilReference,
          createdAt: schema.submissions.createdAt,
          lastError: schema.submissions.lastError,
          councilSlug: schema.appeals.councilSlug,
        })
        .from(schema.submissions)
        .leftJoin(schema.appeals, eq(schema.appeals.id, schema.submissions.appealId))
        .orderBy(desc(schema.submissions.createdAt))
        .limit(100)
    : [];
  const councilMap = await getCouncilLookup();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold text-snappeal-navy">Submissions</h1>
        <p className="text-sm text-snappeal-muted mt-1">
          {rows.length} most recent submission attempts. Use <span className="font-semibold text-snappeal-navy">Dry-run</span> on
          a failed row to replay the council&apos;s portal automation against the real ticket data without resubmitting.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white border border-snappeal-border">
        <table className="w-full text-sm">
          <thead className="bg-snappeal-bg/50">
            <tr className="text-left text-[11px] uppercase tracking-wide text-snappeal-muted">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Appeal</th>
              <th className="px-4 py-3">Council</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Ref</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-snappeal-border">
            {rows.map((s) => {
              const council = s.councilSlug ? councilMap.get(s.councilSlug) : null;
              return (
              <tr key={s.id} className="hover:bg-snappeal-bg/40 transition">
                <td className="px-4 py-3 font-mono text-[11px] text-snappeal-muted">{s.id}</td>
                <td className="px-4 py-3 font-mono text-[11px]">
                  <Link href={`/admin/appeals/${s.appealId}`} className="text-snappeal-primary hover:underline">
                    {s.appealId}
                  </Link>
                </td>
                <td className="px-4 py-3 text-snappeal-navy">
                  {council ? (
                    <CouncilBadge
                      size="sm"
                      name={council.name}
                      logoUrl={council.logoUrl}
                      logoBg={council.logoBg}
                    />
                  ) : (
                    <span className="text-snappeal-muted text-[11px]">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${STATUS_TONE[s.status] ?? STATUS_TONE.queued}`}>
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[11px] text-snappeal-muted capitalize">{s.method}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-snappeal-navy">{s.councilReference ?? "—"}</td>
                <td className="px-4 py-3 text-[11px] text-snappeal-muted">
                  {new Date(s.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="px-4 py-3 text-right">
                  {s.method === "portal" && s.councilSlug ? (
                    <DryRunButton councilSlug={s.councilSlug} appealId={s.appealId} />
                  ) : (
                    <span className="text-[11px] text-snappeal-muted">—</span>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
