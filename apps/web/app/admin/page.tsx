import { sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/server/db/client";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const stats = await loadStats();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-snappeal-navy">Overview</h1>
        <p className="text-sm text-snappeal-muted mt-1">
          Live snapshot of the ParkingRabbit backend. All counts are unfiltered.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Users" value={stats.users} />
        <StatCard label="Appeals" value={stats.appeals} />
        <StatCard label="Submitted" value={stats.submitted} tone="success" />
        <StatCard label="Cancelled" value={stats.cancelled} tone="success" />
        <StatCard label="Councils" value={stats.councils} />
        <StatCard label="Inbound msgs" value={stats.inbound} />
        <StatCard label="Jobs queued" value={stats.jobsQueued} tone={stats.jobsQueued > 0 ? "warning" : undefined} />
        <StatCard label="Jobs failed" value={stats.jobsFailed} tone={stats.jobsFailed > 0 ? "danger" : undefined} />
      </div>

      <section className="rounded-2xl bg-white border border-snappeal-border p-5">
        <p className="text-sm font-bold text-snappeal-navy mb-2">Today</p>
        <p className="text-xs text-snappeal-muted leading-relaxed">
          {stats.appealsToday} appeals created · {stats.submissionsToday} submissions logged ·
          {" "}{stats.inboundToday} inbound council messages classified
        </p>
      </section>
    </div>
  );
}

interface Stats {
  users: number;
  appeals: number;
  submitted: number;
  cancelled: number;
  councils: number;
  inbound: number;
  jobsQueued: number;
  jobsFailed: number;
  appealsToday: number;
  submissionsToday: number;
  inboundToday: number;
}

async function loadStats(): Promise<Stats> {
  const db = getDb();
  if (!db) {
    return {
      users: 0,
      appeals: 0,
      submitted: 0,
      cancelled: 0,
      councils: 0,
      inbound: 0,
      jobsQueued: 0,
      jobsFailed: 0,
      appealsToday: 0,
      submissionsToday: 0,
      inboundToday: 0,
    };
  }
  // postgres-js can't bind a raw JS Date through drizzle's sql template —
  // serialize to ISO 8601 so it lands as a `timestamptz` literal.
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [
    [{ count: users }],
    [{ count: appeals }],
    [{ count: submitted }],
    [{ count: cancelled }],
    [{ count: councils }],
    [{ count: inbound }],
    [{ count: jobsQueued }],
    [{ count: jobsFailed }],
    [{ count: appealsToday }],
    [{ count: submissionsToday }],
    [{ count: inboundToday }],
  ] = await Promise.all([
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int as count FROM users`),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int as count FROM appeals`),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int as count FROM appeals WHERE status = 'submitted'`),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int as count FROM appeals WHERE status = 'cancelled'`),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int as count FROM councils`),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int as count FROM inbound_messages`),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int as count FROM jobs WHERE status = 'queued'`),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int as count FROM jobs WHERE status = 'failed'`),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int as count FROM appeals WHERE created_at > ${dayAgo}`),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int as count FROM submissions WHERE created_at > ${dayAgo}`),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int as count FROM inbound_messages WHERE received_at > ${dayAgo}`),
  ]);

  void schema; // satisfy import-used check
  return {
    users: Number(users ?? 0),
    appeals: Number(appeals ?? 0),
    submitted: Number(submitted ?? 0),
    cancelled: Number(cancelled ?? 0),
    councils: Number(councils ?? 0),
    inbound: Number(inbound ?? 0),
    jobsQueued: Number(jobsQueued ?? 0),
    jobsFailed: Number(jobsFailed ?? 0),
    appealsToday: Number(appealsToday ?? 0),
    submissionsToday: Number(submissionsToday ?? 0),
    inboundToday: Number(inboundToday ?? 0),
  };
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning" | "danger";
}) {
  const accent =
    tone === "success"
      ? "text-green-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "danger"
          ? "text-red-700"
          : "text-snappeal-navy";
  return (
    <div className="rounded-2xl bg-white border border-snappeal-border p-4">
      <p className="text-[11px] uppercase tracking-wide text-snappeal-muted">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${accent}`}>{value.toLocaleString()}</p>
    </div>
  );
}
