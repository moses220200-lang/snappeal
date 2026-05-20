/**
 * Live progress emitter for in-flight jobs.
 *
 * Each `submit_appeal` job streams a sequence of events to its row's
 * `progress` jsonb column. The customer subscribes to those events via
 * `/api/submissions/[id]/progress` (SSE) and sees the agent's work in
 * real time — including screenshots of the council portal as the agent
 * fills the form.
 *
 * Append is atomic via Postgres `||` on jsonb; one update per event is fine
 * (the agent emits on the order of 10–30 events per submission, not 10k).
 */
import { eq, sql } from "drizzle-orm";
import { mkdir, copyFile, watch, readdir, stat, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { getDb, schema } from "../db/client";
import type { JobProgressEvent } from "../db/schema";

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
 * How many `submit_appeal` jobs are ahead of this one (queued + run-after-now).
 * Lets the customer-facing page render "you are #2 in the queue".
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
        AND j.status = 'queued'
        AND j.run_after <= now()
        AND j.created_at < t.created_at
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

  const handle = async (filename: string, fromDir: string) => {
    if (!filename.toLowerCase().endsWith(".png")) return;
    if (seen.has(filename)) return;
    const src = join(fromDir, filename);
    if (!existsSync(src)) return;
    seen.add(filename);
    counter += 1;
    const destDir = join(opts.publicRoot, "submissions", opts.jobId);
    await mkdir(destDir, { recursive: true });
    const destName = `${String(counter).padStart(3, "0")}-${basename(filename)}`;
    const dest = join(destDir, destName);
    try {
      await copyFile(src, dest);
    } catch {
      return;
    }
    await appendProgress(opts.jobId, {
      kind: "screenshot",
      step: counter,
      url: `/submissions/${opts.jobId}/${destName}`,
      caption: filename.replace(/\.png$/i, "").replace(/[-_]/g, " "),
    });
  };

  // @playwright/mcp ignores --output-dir on Windows and writes screenshots
  // into process.cwd() instead. Poll cwd alongside the workDir watcher so
  // the customer-facing live page picks them up too.
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
  const cwdInterval = setInterval(() => void sweepCwd(), 1000);

  void (async () => {
    try {
      const watcher = watch(opts.workDir, { signal: ac.signal });
      for await (const event of watcher) {
        if (!event.filename) continue;
        // Small debounce — file may still be being written.
        setTimeout(() => void handle(event.filename!, opts.workDir), 200);
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
