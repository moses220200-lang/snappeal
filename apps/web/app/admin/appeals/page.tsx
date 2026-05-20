import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/server/db/client";
import { getCouncilLookup } from "@/lib/server/councils";
import { CouncilBadge } from "@/components/CouncilBadge";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  ready: "bg-snappeal-primary-100 text-snappeal-primary-700",
  submitting: "bg-amber-100 text-amber-700",
  submitted: "bg-snappeal-primary-100 text-snappeal-primary-700",
  under_review: "bg-amber-100 text-amber-700",
  decision_pending: "bg-amber-100 text-amber-700",
  cancelled: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default async function AdminAppealsPage() {
  const db = getDb();
  const rows = db ? await db.select().from(schema.appeals).orderBy(desc(schema.appeals.createdAt)).limit(100) : [];
  const councilMap = await getCouncilLookup();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold text-snappeal-navy">Appeals</h1>
        <p className="text-sm text-snappeal-muted mt-1">
          {rows.length} most recent. Click an appeal to inspect, edit, or retry submission.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white border border-snappeal-border">
        <table className="w-full text-sm">
          <thead className="bg-snappeal-bg/50">
            <tr className="text-left text-[11px] uppercase tracking-wide text-snappeal-muted">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Council</th>
              <th className="px-4 py-3">PCN</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-snappeal-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-snappeal-muted">
                  No appeals yet.
                </td>
              </tr>
            )}
            {rows.map((a) => {
              const ticket = a.ticket as { issuer?: string; pcnRef?: string } | null;
              const council = a.councilSlug ? councilMap.get(a.councilSlug) : null;
              return (
                <tr key={a.id} className="hover:bg-snappeal-bg/40 transition">
                  <td className="px-4 py-3 font-mono text-[11px] text-snappeal-navy">
                    <Link href={`/admin/appeals/${a.id}`} className="hover:text-snappeal-primary">
                      {a.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${TONE[a.status] ?? TONE.draft}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-snappeal-navy">
                    {ticket?.issuer ? (
                      <CouncilBadge
                        size="sm"
                        name={ticket.issuer}
                        logoUrl={council?.logoUrl ?? null}
                        logoBg={council?.logoBg ?? null}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-snappeal-muted">{ticket?.pcnRef ?? "—"}</td>
                  <td className="px-4 py-3 text-[11px] text-snappeal-muted">{a.serviceTier}</td>
                  <td className="px-4 py-3 text-[11px] text-snappeal-muted">
                    {new Date(a.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
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
