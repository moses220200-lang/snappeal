/**
 * /admin/appeals — "Appeal Tickets" admin list.
 *
 * Mirror of the customer-facing /app/tickets concept, with admin
 * extras: per-stage Claude cost columns (OCR, validation, draft,
 * submit) sourced from the `ai_calls` table. The legacy
 * `appeals.cost_pence_millis` column has been retired; cost rollups
 * come from `getCostBreakdowns()` in `lib/server/aiCalls.ts`.
 *
 * Cost rendering: USD with 3-decimal precision, since Claude bills in
 * fractions of a cent. The tooltip on each cell shows token counts +
 * model + duration so admins can spot expensive calls and slow stages.
 */
import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/server/db/client";
import { getCouncilLookup } from "@/lib/server/councils";
import { CouncilBadge } from "@/components/CouncilBadge";
import {
  formatCostUsd,
  getCostBreakdowns,
} from "@/lib/server/aiCalls";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  ready: "bg-parkingrabbit-primary-100 text-parkingrabbit-primary-700",
  submitting: "bg-amber-100 text-amber-700",
  submitted: "bg-parkingrabbit-primary-100 text-parkingrabbit-primary-700",
  under_review: "bg-amber-100 text-amber-700",
  decision_pending: "bg-amber-100 text-amber-700",
  cancelled: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default async function AdminAppealTicketsPage() {
  const db = getDb();
  const rows = db
    ? await db
        .select()
        .from(schema.appeals)
        .orderBy(desc(schema.appeals.createdAt))
        .limit(100)
    : [];
  const councilMap = await getCouncilLookup();
  // One-shot cost breakdown for the page. N+1 avoided —
  // `getCostBreakdowns` fetches every ai_calls row for these IDs in a
  // single query then buckets client-side.
  const costs = await getCostBreakdowns(rows.map((r) => r.id));

  // Roll up totals for the page header.
  let pageTotalUsd = 0;
  for (const breakdown of costs.values()) pageTotalUsd += breakdown.totalUsd;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-parkingrabbit-navy">
            Appeal Tickets
          </h1>
          <p className="text-sm text-parkingrabbit-muted mt-1">
            {rows.length} most recent. Click a row to inspect, edit, or
            retry submission.
          </p>
        </div>
        <div className="rounded-2xl bg-white border border-parkingrabbit-border px-4 py-3 text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-parkingrabbit-muted">
            Page total · Claude spend
          </p>
          <p className="text-xl font-bold text-parkingrabbit-navy mt-0.5 font-mono">
            {formatCostUsd(pageTotalUsd)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white border border-parkingrabbit-border">
        <table className="w-full text-sm min-w-[1100px]">
          <thead className="bg-parkingrabbit-bg/50">
            <tr className="text-left text-[11px] uppercase tracking-wide text-parkingrabbit-muted">
              <th className="px-3 py-3">ID</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Council</th>
              <th className="px-3 py-3">PCN</th>
              <th className="px-3 py-3 text-right">OCR</th>
              <th className="px-3 py-3 text-right">Validation</th>
              <th className="px-3 py-3 text-right">Draft</th>
              <th className="px-3 py-3 text-right">Submit</th>
              <th className="px-3 py-3 text-right font-bold">Total</th>
              <th className="px-3 py-3">Created</th>
              <th className="px-3 py-3 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-parkingrabbit-border">
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={11}
                  className="px-4 py-8 text-center text-parkingrabbit-muted"
                >
                  No appeal tickets yet.
                </td>
              </tr>
            )}
            {rows.map((a) => {
              const ticket = a.ticket as {
                issuer?: string;
                pcnRef?: string;
              } | null;
              const council = a.councilSlug
                ? councilMap.get(a.councilSlug)
                : null;
              const breakdown = costs.get(a.id);
              // Validation costs come from BOTH the council-id pass
              // (extract route, pass 1) and the lookup MCP job. Sum
              // them — the user thinks of "validation" as a single
              // bucket regardless of which Claude call produced it.
              const validationUsd =
                (breakdown?.byStage.council_id ?? 0) +
                (breakdown?.byStage.lookup ?? 0);
              const ocrUsd = breakdown?.byStage.ocr ?? 0;
              const draftUsd =
                (breakdown?.byStage.draft ?? 0) +
                (breakdown?.byStage.strength ?? 0);
              const submitUsd = breakdown?.byStage.submit ?? 0;
              const totalUsd = breakdown?.totalUsd ?? 0;
              return (
                <tr
                  key={a.id}
                  className="hover:bg-parkingrabbit-bg/40 transition"
                >
                  <td className="px-3 py-3 font-mono text-[11px] text-parkingrabbit-navy">
                    <Link
                      href={`/admin/appeals/${a.id}`}
                      className="hover:text-parkingrabbit-primary"
                    >
                      {a.id}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                        STATUS_TONE[a.status] ?? STATUS_TONE.draft
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-parkingrabbit-navy">
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
                  <td className="px-3 py-3 font-mono text-[11px] text-parkingrabbit-muted">
                    {ticket?.pcnRef ?? "—"}
                  </td>
                  <CostCell
                    usd={ocrUsd}
                    calls={breakdown?.callsByStage.ocr ?? 0}
                  />
                  <CostCell
                    usd={validationUsd}
                    calls={
                      (breakdown?.callsByStage.council_id ?? 0) +
                      (breakdown?.callsByStage.lookup ?? 0)
                    }
                  />
                  <CostCell
                    usd={draftUsd}
                    calls={
                      (breakdown?.callsByStage.draft ?? 0) +
                      (breakdown?.callsByStage.strength ?? 0)
                    }
                  />
                  <CostCell
                    usd={submitUsd}
                    calls={breakdown?.callsByStage.submit ?? 0}
                  />
                  <td className="px-3 py-3 text-right font-mono text-[11px] font-bold text-parkingrabbit-navy">
                    {totalUsd > 0 ? formatCostUsd(totalUsd) : "—"}
                  </td>
                  <td className="px-3 py-3 text-[11px] text-parkingrabbit-muted whitespace-nowrap">
                    {new Date(a.createdAt).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/admin/appeals/${a.id}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-parkingrabbit-primary-50 text-parkingrabbit-primary border border-parkingrabbit-primary/20 px-2.5 py-1 text-[11px] font-bold hover:bg-parkingrabbit-primary hover:text-white transition"
                    >
                      Details →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-parkingrabbit-muted">
        Costs sourced from <code className="font-mono">ai_calls</code>.
        Validation = council-id pass + portal lookup. Draft = letter
        generation + strength rescore.
      </p>
    </div>
  );
}

/** Right-aligned monospace cost cell with a hover hint showing the
 *  number of Claude calls behind the sum (0 = stage hasn't run; we
 *  render an em-dash to keep the column quiet). */
function CostCell({ usd, calls }: { usd: number; calls: number }) {
  if (calls === 0 || usd === 0) {
    return (
      <td className="px-3 py-3 text-right text-[11px] text-parkingrabbit-border font-mono">
        —
      </td>
    );
  }
  return (
    <td
      className="px-3 py-3 text-right font-mono text-[11px] text-parkingrabbit-navy"
      title={`${calls} Claude call${calls === 1 ? "" : "s"}`}
    >
      {formatCostUsd(usd)}
    </td>
  );
}
