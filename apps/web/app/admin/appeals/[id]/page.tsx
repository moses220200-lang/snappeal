import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/lib/server/db/client";
import { formatCostUsd } from "@/lib/server/aiCalls";

export const dynamic = "force-dynamic";

export default async function AdminAppealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  if (!db) notFound();
  const appealRows = await db.select().from(schema.appeals).where(eq(schema.appeals.id, id));
  const appeal = appealRows[0];
  if (!appeal) notFound();

  const [submissions, inbound, jobs, aiCalls] = await Promise.all([
    db.select().from(schema.submissions).where(eq(schema.submissions.appealId, id)),
    db.select().from(schema.inboundMessages).where(eq(schema.inboundMessages.appealId, id)),
    db.select().from(schema.jobs).where(eq(schema.jobs.appealId, id)),
    db
      .select()
      .from(schema.aiCalls)
      .where(eq(schema.aiCalls.appealId, id))
      .orderBy(asc(schema.aiCalls.createdAt)),
  ]);

  // Total spend + total agent wall-clock for the header strip.
  let totalUsd = 0;
  let totalMs = 0;
  for (const c of aiCalls) {
    totalUsd += c.costUsd != null ? Number(c.costUsd) : 0;
    totalMs += c.durationMs ?? 0;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/admin/appeals" className="text-xs text-parkingrabbit-primary">
          ← Back to all appeals
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-parkingrabbit-navy font-mono">{appeal.id}</h1>
        <p className="text-sm text-parkingrabbit-muted">
          {appeal.status} · {appeal.serviceTier} · created {new Date(appeal.createdAt).toLocaleString("en-GB")}
        </p>
      </div>

      <Card title={`AI calls (${aiCalls.length}) · ${formatCostUsd(totalUsd)} · ${(totalMs / 1000).toFixed(1)}s`}>
        {aiCalls.length === 0 ? (
          <p className="text-xs text-parkingrabbit-muted">No Claude calls recorded for this appeal yet.</p>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-parkingrabbit-muted">
                <th className="py-1.5 pr-3">When</th>
                <th className="py-1.5 pr-3">Stage</th>
                <th className="py-1.5 pr-3">Mode</th>
                <th className="py-1.5 pr-3">Model</th>
                <th className="py-1.5 pr-3 text-right">In</th>
                <th className="py-1.5 pr-3 text-right">Out</th>
                <th className="py-1.5 pr-3 text-right">Cost</th>
                <th className="py-1.5 pr-3 text-right">Duration</th>
                <th className="py-1.5">OK</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-parkingrabbit-border">
              {aiCalls.map((c) => (
                <tr key={c.id} className="text-parkingrabbit-navy">
                  <td className="py-1.5 pr-3 text-parkingrabbit-muted whitespace-nowrap">
                    {new Date(c.createdAt).toLocaleTimeString("en-GB", { hour12: false })}
                  </td>
                  <td className="py-1.5 pr-3 font-mono">{c.stage}</td>
                  <td className="py-1.5 pr-3 text-parkingrabbit-muted">{c.mode}</td>
                  <td className="py-1.5 pr-3 text-parkingrabbit-muted font-mono">{c.model}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{c.inputTokens ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{c.outputTokens ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">
                    {c.costUsd != null ? formatCostUsd(Number(c.costUsd)) : "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono text-parkingrabbit-muted">
                    {c.durationMs != null ? `${(c.durationMs / 1000).toFixed(1)}s` : "—"}
                  </td>
                  <td className="py-1.5">
                    {c.ok ? (
                      <span className="text-green-700">✓</span>
                    ) : (
                      <span className="text-red-700" title={c.errorMessage ?? c.errorKind ?? "failed"}>
                        ✗
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Ticket">
        <pre className="text-xs text-parkingrabbit-navy whitespace-pre-wrap font-mono">
          {JSON.stringify(appeal.ticket ?? {}, null, 2)}
        </pre>
      </Card>

      {appeal.letterBody && (
        <Card title={`Letter — ${appeal.letterWordCount ?? 0} words`}>
          <p className="text-xs font-semibold text-parkingrabbit-navy mb-2">{appeal.letterSubject}</p>
          <pre className="text-xs text-parkingrabbit-navy whitespace-pre-wrap font-sans leading-relaxed">
            {appeal.letterBody}
          </pre>
        </Card>
      )}

      <Card title="Timeline">
        <pre className="text-[11px] text-parkingrabbit-navy whitespace-pre-wrap font-mono">
          {JSON.stringify(appeal.timeline, null, 2)}
        </pre>
      </Card>

      <Card title={`Submissions (${submissions.length})`}>
        {submissions.length === 0 ? (
          <p className="text-xs text-parkingrabbit-muted">No submissions yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {submissions.map((s) => (
              <li key={s.id} className="rounded-lg bg-parkingrabbit-bg/50 p-3 text-xs">
                <p className="font-mono text-parkingrabbit-navy">{s.id}</p>
                <p className="text-parkingrabbit-muted">
                  {s.status} · {s.method} · ref {s.councilReference ?? "—"} ·
                  {" "}{s.submittedAt ? new Date(s.submittedAt).toLocaleString("en-GB") : "pending"}
                </p>
                {s.lastError && <p className="text-red-700 mt-1">err: {s.lastError}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Inbound (${inbound.length})`}>
        {inbound.length === 0 ? (
          <p className="text-xs text-parkingrabbit-muted">No replies yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {inbound.map((m) => (
              <li key={m.id} className="rounded-lg bg-parkingrabbit-bg/50 p-3 text-xs">
                <p className="font-semibold text-parkingrabbit-navy">{m.subject}</p>
                <p className="text-parkingrabbit-muted">
                  {m.classification ?? "?"} · from {m.fromAddr} · {new Date(m.receivedAt).toLocaleString("en-GB")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Jobs (${jobs.length})`}>
        {jobs.length === 0 ? (
          <p className="text-xs text-parkingrabbit-muted">No jobs.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {jobs.map((j) => (
              <li key={j.id} className="rounded-lg bg-parkingrabbit-bg/50 p-3 text-xs">
                <p className="font-mono text-parkingrabbit-navy">{j.id}</p>
                <p className="text-parkingrabbit-muted">
                  {j.kind} · {j.status} · attempt {j.attempts}/{j.maxAttempts}
                </p>
                {j.lastError && <p className="text-red-700 mt-1">err: {j.lastError}</p>}
              </li>
            ))}
          </ul>
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
