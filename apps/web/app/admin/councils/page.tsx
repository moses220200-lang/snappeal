import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { getDb, schema } from "@/lib/server/db/client";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  manual: "bg-slate-100 text-slate-700",
  automated_beta: "bg-amber-100 text-amber-700",
  automated_ga: "bg-green-100 text-green-700",
};

export default async function AdminCouncilsPage() {
  const db = getDb();
  const rows = db ? await db.select().from(schema.councils).orderBy(schema.councils.name) : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-snappeal-navy">Councils</h1>
          <p className="text-sm text-snappeal-muted mt-1">
            {rows.length} authorities in the knowledge base. Each one can have a custom Claude+Playwright MCP automation recipe.
          </p>
        </div>
        <Link
          href="/admin/councils/new"
          className="inline-flex items-center gap-2 rounded-2xl bg-snappeal-action text-white font-semibold px-4 py-2.5 text-sm shadow-lg shadow-snappeal-action/40 hover:bg-snappeal-action-600 transition"
        >
          <Plus className="size-4" />
          Add council
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white border border-snappeal-border">
        <table className="w-full text-sm">
          <thead className="bg-snappeal-bg/50">
            <tr className="text-left text-[11px] uppercase tracking-wide text-snappeal-muted">
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Automation</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-snappeal-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-snappeal-muted">
                  No councils yet — add the first one.
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.slug} className="hover:bg-snappeal-bg/40 transition">
                <td className="px-4 py-3 font-mono text-[11px] text-snappeal-muted">{c.slug}</td>
                <td className="px-4 py-3 text-snappeal-navy font-semibold">{c.name}</td>
                <td className="px-4 py-3 text-[11px] text-snappeal-muted capitalize">{c.type.replace("_", " ")}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${STATUS_TONE[c.automationStatus] ?? STATUS_TONE.manual}`}>
                    {c.automationStatus.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3 text-[11px] text-snappeal-muted">{c.appealEmail ?? "—"}</td>
                <td className="px-4 py-3 text-[11px] whitespace-nowrap text-right">
                  <Link href={`/admin/councils/${c.slug}`} className="text-snappeal-primary font-semibold hover:underline mr-3">
                    Edit
                  </Link>
                  <Link href={`/admin/councils/${c.slug}/automation`} className="inline-flex items-center gap-1 text-snappeal-primary font-semibold hover:underline">
                    MCP
                    <ChevronRight className="size-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
