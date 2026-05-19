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
      <div>
        <h1 className="text-3xl font-bold text-snappeal-navy">Councils</h1>
        <p className="text-sm text-snappeal-muted mt-1">
          {rows.length} councils in the knowledge base. Edit the seed script in <code className="font-mono text-[11px]">apps/web/scripts/seed-councils.ts</code> to add or update.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white border border-snappeal-border">
        <table className="w-full text-sm">
          <thead className="bg-snappeal-bg/50">
            <tr className="text-left text-[11px] uppercase tracking-wide text-snappeal-muted">
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Automation</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Portal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-snappeal-border">
            {rows.map((c) => (
              <tr key={c.slug} className="hover:bg-snappeal-bg/40 transition">
                <td className="px-4 py-3 font-mono text-[11px] text-snappeal-muted">{c.slug}</td>
                <td className="px-4 py-3 text-snappeal-navy font-semibold">{c.name}</td>
                <td className="px-4 py-3 text-[11px] text-snappeal-muted capitalize">{c.type}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${STATUS_TONE[c.automationStatus] ?? STATUS_TONE.manual}`}>
                    {c.automationStatus.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3 text-[11px] text-snappeal-muted">{c.appealEmail ?? "—"}</td>
                <td className="px-4 py-3 text-[11px]">
                  <a href={c.appealPortalUrl} target="_blank" rel="noopener" className="text-snappeal-primary hover:underline truncate inline-block max-w-[260px]">
                    {c.appealPortalUrl}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
