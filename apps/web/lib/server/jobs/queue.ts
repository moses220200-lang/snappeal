/**
 * Postgres-backed job queue.
 *
 * Workers claim jobs atomically with `FOR UPDATE SKIP LOCKED`. Each claim
 * transitions a queued (or stale-running) row to `running`, stamping
 * `lockedAt` + `lockedBy`. The worker then runs the handler, updates the
 * row to `done` (with result) or — on failure — bumps `attempts` and either
 * re-queues with backoff or marks `failed`.
 *
 * Stale-lock recovery: any `running` row older than `STALE_LOCK_AFTER_MS`
 * is considered abandoned (worker crashed mid-job) and is eligible to be
 * re-claimed. Idempotency is the handler's responsibility; for now we
 * assume the underlying ops are safe-to-retry.
 */
import { randomBytes } from "node:crypto";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import type { JobProgressEvent } from "../db/schema";

const STALE_LOCK_AFTER_MS = 5 * 60_000;

export type JobKind = "submit_appeal" | "generate_draft" | "pcn_lookup";

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface Job {
  id: string;
  kind: JobKind;
  appealId: string | null;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  lastError: string | null;
  result: unknown;
  progress: JobProgressEvent[];
  createdAt: Date;
  updatedAt: Date;
}

const newJobId = (kind: JobKind) =>
  `job_${kind.replace("_", "-")}_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;

interface EnqueueInput {
  kind: JobKind;
  appealId?: string | null;
  payload: Record<string, unknown>;
  maxAttempts?: number;
  runAfter?: Date;
}

export async function enqueue(input: EnqueueInput): Promise<Job> {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL not set");
  const id = newJobId(input.kind);
  const [row] = await db
    .insert(schema.jobs)
    .values({
      id,
      kind: input.kind,
      appealId: input.appealId ?? null,
      payload: input.payload,
      status: "queued",
      maxAttempts: input.maxAttempts ?? 3,
      runAfter: input.runAfter ?? new Date(),
    })
    .returning();
  return toJob(row);
}

export async function getJob(id: string): Promise<Job | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  return rows[0] ? toJob(rows[0]) : null;
}

/**
 * Atomically pick the next runnable job for this worker, or null if there's
 * nothing to do. Uses raw SQL because Drizzle doesn't surface SKIP LOCKED.
 */
export async function claimNext(workerId: string): Promise<Job | null> {
  const db = getDb();
  if (!db) return null;
  // postgres-js + drizzle sql template can't bind a JS Date directly —
  // serialize to ISO 8601 so it lands as a `timestamptz` literal.
  const staleCutoff = new Date(Date.now() - STALE_LOCK_AFTER_MS).toISOString();
  const rows = await db.execute<{
    id: string;
    kind: string;
    appeal_id: string | null;
    payload: Record<string, unknown>;
    status: string;
    attempts: number;
    max_attempts: number;
    run_after: string | Date;
    locked_at: string | Date | null;
    locked_by: string | null;
    last_error: string | null;
    result: unknown;
    progress: unknown;
    created_at: string | Date;
    updated_at: string | Date;
  }>(sql`
    WITH next AS (
      SELECT id FROM jobs
      WHERE (status = 'queued' AND run_after <= now())
         OR (status = 'running' AND locked_at < ${staleCutoff})
      ORDER BY run_after ASC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE jobs j
    SET status = 'running',
        locked_at = now(),
        locked_by = ${workerId},
        attempts = j.attempts + 1,
        updated_at = now()
    FROM next
    WHERE j.id = next.id
    RETURNING j.*;
  `);
  // postgres-js returns array directly on .execute
  const result = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? [];
  const row = (result[0] ?? null) as typeof rows extends Array<infer T> ? T : never | null;
  if (!row) return null;
  return toJob({
    id: row.id,
    kind: row.kind,
    appealId: row.appeal_id,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    runAfter: new Date(row.run_after as string),
    lockedAt: row.locked_at ? new Date(row.locked_at as string) : null,
    lockedBy: row.locked_by,
    lastError: row.last_error,
    result: row.result,
    progress: (row.progress ?? []) as JobProgressEvent[],
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  });
}

export async function markDone(id: string, result: unknown): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(schema.jobs)
    .set({ status: "done", result, lockedAt: null, lockedBy: null, updatedAt: new Date() })
    .where(eq(schema.jobs.id, id));
}

export async function markFailed(id: string, err: unknown, retryable = true): Promise<void> {
  const db = getDb();
  if (!db) return;
  const message = err instanceof Error ? err.message : String(err);
  const rows = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  const job = rows[0];
  if (!job) return;
  if (retryable && job.attempts < job.maxAttempts) {
    // Exponential backoff: 30s, 2min, 5min.
    const delaySeconds = [30, 120, 300][Math.min(job.attempts - 1, 2)] ?? 300;
    await db
      .update(schema.jobs)
      .set({
        status: "queued",
        runAfter: new Date(Date.now() + delaySeconds * 1000),
        lockedAt: null,
        lockedBy: null,
        lastError: message,
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, id));
  } else {
    await db
      .update(schema.jobs)
      .set({ status: "failed", lockedAt: null, lockedBy: null, lastError: message, updatedAt: new Date() })
      .where(eq(schema.jobs.id, id));
  }
}

/**
 * Convenience: re-queue any zombie running rows on boot. Belt-and-braces;
 * the stale-lock cutoff in claimNext already covers this.
 */
export async function recoverZombies(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const cutoff = new Date(Date.now() - STALE_LOCK_AFTER_MS);
  const rows = await db
    .update(schema.jobs)
    .set({ status: "queued", lockedAt: null, lockedBy: null, updatedAt: new Date() })
    .where(
      and(
        eq(schema.jobs.status, "running"),
        or(isNull(schema.jobs.lockedAt), lt(schema.jobs.lockedAt, cutoff))!,
      ),
    )
    .returning({ id: schema.jobs.id });
  return rows.length;
}

function toJob(row: typeof schema.jobs.$inferSelect): Job {
  return {
    id: row.id,
    kind: row.kind as JobKind,
    appealId: row.appealId,
    payload: (row.payload as Record<string, unknown>) ?? {},
    status: row.status as JobStatus,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    runAfter: row.runAfter,
    lockedAt: row.lockedAt,
    lockedBy: row.lockedBy,
    lastError: row.lastError,
    result: row.result,
    progress: (row.progress ?? []) as JobProgressEvent[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
