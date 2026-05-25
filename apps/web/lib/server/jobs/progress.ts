/**
 * Live progress emitter for in-flight jobs.
 *
 * Each `submit_appeal` job streams a sequence of events to its row's
 * `progress` jsonb column. The smart ticket card subscribes to those
 * events via `/api/jobs/[id]/progress` (SSE) and sees the agent's work
 * in real time — including screenshots of the council portal as the
 * agent fills the form (when the "Watch live" disclosure is open).
 *
 * Append is atomic via Postgres `||` on jsonb; one update per event is fine
 * (the agent emits on the order of 10–30 events per submission, not 10k).
 */
import { eq, sql } from "drizzle-orm";
import { mkdir, copyFile, watch, readdir, stat, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { getDb, schema } from "../db/client";
import type { JobProgressEvent } from "../db/schema";
import { emitProgress } from "./event-bus";

// Distributive Omit so the discriminated-union variants survive the strip.
type ProgressInput = JobProgressEvent extends infer E ? (E extends { kind: string } ? Omit<E, "ts"> : never) : never;

export async function appendProgress(jobId: string, event: ProgressInput): Promise<void> {
  const db = getDb();
  if (!db) return;
  const stamped = { ts: new Date().toISOString(), ...event } as JobProgressEvent;
  // jsonb || jsonb concatenates arrays atomically; this avoids a read+write race
  // when N events land in quick succession from different async callbacks.
  await db
    .update(schema.jobs)
    .set({
      progress: sql`COALESCE(${schema.jobs.progress}, '[]'::jsonb) || ${JSON.stringify([stamped])}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(schema.jobs.id, jobId));
  // Push to any live SSE subscribers in the same Node process. The DB write
  // is the durable record; this is the hot-path delivery channel that gets
  // sub-millisecond latency without polling. Safe to call when there are no
  // subscribers (no-op).
  emitProgress(jobId, stamped);
}

export async function readProgress(jobId: string): Promise<{
  status: string;
  progress: JobProgressEvent[];
  lastError: string | null;
  result: unknown;
} | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      status: schema.jobs.status,
      progress: schema.jobs.progress,
      lastError: schema.jobs.lastError,
      result: schema.jobs.result,
    })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId));
  if (!rows[0]) return null;
  return {
    status: rows[0].status,
    progress: (rows[0].progress ?? []) as JobProgressEvent[],
    lastError: rows[0].lastError,
    result: rows[0].result,
  };
}

/**
 * How many jobs of the same kind are effectively ahead of this one —
 * any same-kind row that's either:
 *   - queued with `run_after <= now()` and created before this one
 *   - currently `running` (a slot is busy and we have to wait for it)
 *
 * Includes stale-running rows too — they're recovered by `claimNext`'s
 * SKIP-LOCKED cutoff, but until the cutoff fires they hold a slot and
 * count against you. Reported as a 0-indexed position: 0 = next up.
 *
 * The ETA computed downstream in the SSE route is
 *   ceil((position + 1) / concurrency) * avg_seconds
 * which deliberately keeps the math conservative — if 2 jobs are
 * running on a 2-slot concurrency, your wait is ~1 average duration
 * regardless of how many extra ones are queued behind them.
 */
export async function queuePosition(jobId: string): Promise<number | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db.execute<{ position: number }>(sql`
    WITH target AS (
      SELECT created_at, kind, status FROM jobs WHERE id = ${jobId}
    )
    SELECT (
      SELECT COUNT(*)::int FROM jobs j, target t
      WHERE j.kind = t.kind
        AND j.id != ${jobId}
        AND (
          (j.status = 'queued' AND j.run_after <= now() AND j.created_at < t.created_at)
          OR j.status = 'running'
        )
    ) AS position
  `);
  const result = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? [];
  const row = result[0] as { position?: number } | undefined;
  return row?.position ?? null;
}

/**
 * Watch a workDir for new PNG screenshots written by the Playwright MCP agent
 * (the prompt instructs it to save numbered files like `step-1.png`,
 * `step-2.png`, …). On each new file, copy it to a public path the customer's
 * browser can fetch and append a `screenshot` event to the job's progress.
 *
 * Returns a `stop()` you must call when the agent finishes.
 */
export function watchScreenshots(opts: {
  jobId: string;
  workDir: string;
  publicRoot: string;
}): { stop: () => Promise<void> } {
  const seen = new Set<string>();
  const ac = new AbortController();
  let counter = 0;
  const startedAt = Date.now();

  // copyFile retry params: the agent may still be writing the PNG when
  // fs.watch fires. Five tries × 60ms = up to 300ms of patience before
  // we drop a screenshot. Cheaper than the old fixed 200ms wait per file.
  const COPY_MAX_TRIES = 5;
  const COPY_BACKOFF_MS = 60;

  const copyWithRetry = async (src: string, dest: string): Promise<boolean> => {
    for (let i = 0; i < COPY_MAX_TRIES; i++) {
      try {
        await copyFile(src, dest);
        return true;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "EBUSY" || code === "EPERM" || code === "ENOENT") {
          await new Promise((r) => setTimeout(r, COPY_BACKOFF_MS));
          continue;
        }
        return false; // unknown error — give up
      }
    }
    return false;
  };

  const handle = async (filename: string, fromDir: string) => {
    if (!filename.toLowerCase().endsWith(".png")) return;
    if (seen.has(filename)) return;
    seen.add(filename); // claim it before async copy so concurrent ticks don't race
    const src = join(fromDir, filename);
    counter += 1;
    const destDir = join(opts.publicRoot, "submissions", opts.jobId);
    await mkdir(destDir, { recursive: true });
    const destName = `${String(counter).padStart(3, "0")}-${basename(filename)}`;
    const dest = join(destDir, destName);
    const ok = await copyWithRetry(src, dest);
    if (!ok) {
      // Release the seen slot — a later sweep might still rescue this file.
      seen.delete(filename);
      counter -= 1;
      return;
    }
    const t0 = Date.now() - startedAt;
    console.info(`[watcher:${opts.jobId.slice(-8)}] +${destName} (t+${t0}ms)`);
    await appendProgress(opts.jobId, {
      kind: "screenshot",
      step: counter,
      url: `/submissions/${opts.jobId}/${destName}`,
      caption: filename.replace(/\.png$/i, "").replace(/[-_]/g, " "),
    });
  };

  // @playwright/mcp ignores --output-dir on Windows and writes screenshots
  // into process.cwd() instead. Poll cwd alongside the workDir watcher so
  // the customer-facing live page picks them up too. Tight 250ms cadence —
  // a readdir of cwd is cheap, and this is the main mover on Windows.
  const sweepCwd = async () => {
    const cwd = process.cwd();
    let names: string[] = [];
    try {
      names = await readdir(cwd);
    } catch {
      return;
    }
    for (const name of names) {
      if (!name.toLowerCase().endsWith(".png")) continue;
      if (seen.has(name)) continue;
      let mtime = 0;
      try {
        mtime = (await stat(join(cwd, name))).mtimeMs;
      } catch {
        continue;
      }
      if (mtime < startedAt) continue;
      // Move it into workDir to keep cwd clean, then process from there.
      const moved = join(opts.workDir, name);
      try {
        await rename(join(cwd, name), moved);
      } catch {
        /* fall through — still process from cwd */
      }
      await handle(name, existsSync(moved) ? opts.workDir : cwd);
    }
  };
  const cwdInterval = setInterval(() => void sweepCwd(), 250);

  void (async () => {
    try {
      const watcher = watch(opts.workDir, { signal: ac.signal });
      for await (const event of watcher) {
        if (!event.filename) continue;
        // No fixed debounce — copyWithRetry handles the file-still-writing
        // case with bounded backoff, giving near-zero added latency on the
        // hot path.
        void handle(event.filename, opts.workDir);
      }
    } catch {
      /* aborted */
    }
  })();

  return {
    stop: async () => {
      ac.abort();
      clearInterval(cwdInterval);
      // Final sweep to catch any PNG written after the agent's last event.
      await sweepCwd();
    },
  };
}

/**
 * Walks `<publicRoot>/submissions/<jobId>/` and deletes any directory
 * whose corresponding `jobs` row is older than `olderThanMs`. Runs on
 * worker boot — see `recoverZombies()`. Keeps `/public` from growing
 * forever on a long-lived dev box.
 *
 * Cheap: one stat per top-level folder, one DB lookup. Errors are
 * swallowed — a stale folder isn't worth crashing over.
 */
export async function cleanupStaleScreenshots(opts: {
  publicRoot: string;
  olderThanMs: number;
}): Promise<number> {
  const root = join(opts.publicRoot, "submissions");
  if (!existsSync(root)) return 0;
  let names: string[] = [];
  try {
    names = await readdir(root);
  } catch {
    return 0;
  }
  const cutoff = Date.now() - opts.olderThanMs;
  let deleted = 0;
  for (const name of names) {
    if (!name.startsWith("job_")) continue;
    const dir = join(root, name);
    let mtime = 0;
    try {
      mtime = (await stat(dir)).mtimeMs;
    } catch {
      continue;
    }
    if (mtime > cutoff) continue;
    try {
      await rm(dir, { recursive: true, force: true });
      deleted += 1;
    } catch {
      /* best-effort */
    }
  }
  if (deleted > 0) {
    console.info(`[cleanup] removed ${deleted} stale screenshot folder(s)`);
  }
  return deleted;
}
