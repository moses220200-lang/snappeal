import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/server/db/client";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  cancelled: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  acknowledged: "bg-parkingrabbit-primary-100 text-parkingrabbit-primary-700",
  request: "bg-amber-100 text-amber-700",
  unknown: "bg-slate-100 text-slate-700",
};

export default async function AdminInboundPage() {
  const db = getDb();
  const rows = db ? await db.select().from(schema.inboundMessages).orderBy(desc(schema.inboundMessages.receivedAt)).limit(100) : [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold text-parkingrabbit-navy">Inbound mail</h1>
        <p className="text-sm text-parkingrabbit-muted mt-1">
          {rows.length} most recent council replies, classified via Claude CLI.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white border border-parkingrabbit-border">
        <table className="w-full text-sm">
          <thead className="bg-parkingrabbit-bg/50">
            <tr className="text-left text-[11px] uppercase tracking-wide text-parkingrabbit-muted">
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">From</th>
              <th className="px-4 py-3">Classification</th>
              <th className="px-4 py-3">Appeal</th>
              <th className="px-4 py-3">Received</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-parkingrabbit-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-parkingrabbit-muted">
                  No inbound messages yet.
                </td>
              </tr>
            )}
            {rows.map((m) => (
              <tr key={m.id} className="hover:bg-parkingrabbit-bg/40 transition">
                <td className="px-4 py-3 text-parkingrabbit-navy font-semibold truncate max-w-[280px]">{m.subject ?? "(no subject)"}</td>
                <td className="px-4 py-3 text-[11px] text-parkingrabbit-muted">{m.fromAddr}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${TONE[m.classification ?? "unknown"]}`}>
                    {m.classification ?? "unknown"}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-[11px]">
                  {m.appealId ? (
                    <Link href={`/admin/appeals/${m.appealId}`} className="text-parkingrabbit-primary hover:underline">
                      {m.appealId}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-[11px] text-parkingrabbit-muted">
                  {new Date(m.receivedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
