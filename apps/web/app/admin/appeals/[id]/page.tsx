import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/lib/server/db/client";

export const dynamic = "force-dynamic";

export default async function AdminAppealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  if (!db) notFound();
  const appealRows = await db.select().from(schema.appeals).where(eq(schema.appeals.id, id));
  const appeal = appealRows[0];
  if (!appeal) notFound();

  const [submissions, inbound, jobs] = await Promise.all([
    db.select().from(schema.submissions).where(eq(schema.submissions.appealId, id)),
    db.select().from(schema.inboundMessages).where(eq(schema.inboundMessages.appealId, id)),
    db.select().from(schema.jobs).where(eq(schema.jobs.appealId, id)),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/admin/appeals" className="text-xs text-snappeal-primary">
          ← Back to all appeals
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-snappeal-navy font-mono">{appeal.id}</h1>
        <p className="text-sm text-snappeal-muted">
          {appeal.status} · {appeal.serviceTier} · created {new Date(appeal.createdAt).toLocaleString("en-GB")}
        </p>
      </div>

      <Card title="Ticket">
        <pre className="text-xs text-snappeal-navy whitespace-pre-wrap font-mono">
          {JSON.stringify(appeal.ticket ?? {}, null, 2)}
        </pre>
      </Card>

      {appeal.letterBody && (
        <Card title={`Letter — ${appeal.letterWordCount ?? 0} words`}>
          <p className="text-xs font-semibold text-snappeal-navy mb-2">{appeal.letterSubject}</p>
          <pre className="text-xs text-snappeal-navy whitespace-pre-wrap font-sans leading-relaxed">
            {appeal.letterBody}
          </pre>
        </Card>
      )}

      <Card title="Timeline">
        <pre className="text-[11px] text-snappeal-navy whitespace-pre-wrap font-mono">
          {JSON.stringify(appeal.timeline, null, 2)}
        </pre>
      </Card>

      <Card title={`Submissions (${submissions.length})`}>
        {submissions.length === 0 ? (
          <p className="text-xs text-snappeal-muted">No submissions yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {submissions.map((s) => (
              <li key={s.id} className="rounded-lg bg-snappeal-bg/50 p-3 text-xs">
                <p className="font-mono text-snappeal-navy">{s.id}</p>
                <p className="text-snappeal-muted">
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
          <p className="text-xs text-snappeal-muted">No replies yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {inbound.map((m) => (
              <li key={m.id} className="rounded-lg bg-snappeal-bg/50 p-3 text-xs">
                <p className="font-semibold text-snappeal-navy">{m.subject}</p>
                <p className="text-snappeal-muted">
                  {m.classification ?? "?"} · from {m.fromAddr} · {new Date(m.receivedAt).toLocaleString("en-GB")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Jobs (${jobs.length})`}>
        {jobs.length === 0 ? (
          <p className="text-xs text-snappeal-muted">No jobs.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {jobs.map((j) => (
              <li key={j.id} className="rounded-lg bg-snappeal-bg/50 p-3 text-xs">
                <p className="font-mono text-snappeal-navy">{j.id}</p>
                <p className="text-snappeal-muted">
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
    <section className="rounded-2xl bg-white border border-snappeal-border p-5">
      <p className="text-sm font-bold text-snappeal-navy mb-3">{title}</p>
      {children}
    </section>
  );
}
