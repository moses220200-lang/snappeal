/**
 * Per-council MCP automation helpers — read/write the `council_automation`
 * row, seed defaults from canonical prompts, run a dry-run against the
 * live portal.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { runAgentic } from "../claude-cli";
import { mkdtemp, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WESTMINSTER_AGENT_PROMPT, WESTMINSTER_FIELD_HINTS } from "./prompts/westminster";

const DEFAULTS: Record<string, { prompt: string; hints: Record<string, unknown> }> = {
  westminster: { prompt: WESTMINSTER_AGENT_PROMPT, hints: WESTMINSTER_FIELD_HINTS },
};

export async function getAutomation(councilSlug: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(schema.councilAutomation)
    .where(eq(schema.councilAutomation.councilSlug, councilSlug));
  if (rows[0]) return rows[0];

  // Seed from defaults if we have one for this slug.
  const def = DEFAULTS[councilSlug];
  if (!def) return null;
  const [seeded] = await db
    .insert(schema.councilAutomation)
    .values({
      councilSlug,
      agentPrompt: def.prompt,
      fieldHints: def.hints,
    })
    .returning();
  return seeded;
}

export async function upsertAutomation(input: {
  councilSlug: string;
  agentPrompt: string;
  fieldHints?: Record<string, unknown> | null;
  updatedBy?: string;
}) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL not set");
  const existing = await getAutomation(input.councilSlug);
  if (existing) {
    await db
      .update(schema.councilAutomation)
      .set({
        agentPrompt: input.agentPrompt,
        fieldHints: input.fieldHints ?? existing.fieldHints,
        updatedBy: input.updatedBy,
        updatedAt: new Date(),
      })
      .where(eq(schema.councilAutomation.councilSlug, input.councilSlug));
  } else {
    await db.insert(schema.councilAutomation).values({
      councilSlug: input.councilSlug,
      agentPrompt: input.agentPrompt,
      fieldHints: input.fieldHints ?? null,
      updatedBy: input.updatedBy,
    });
  }
  return getAutomation(input.councilSlug);
}

interface DryRunInput {
  councilSlug: string;
  /** Optional: pick a real appeal id to use as the fixture, else use a hand-built test record. */
  appealId?: string | null;
  /** Optional: cap the wall-clock so the admin doesn't have to wait. */
  timeoutMs?: number;
}

export interface DryRunResult {
  ok: boolean;
  events: string[];
  finalText: string;
  parsed: unknown;
  screenshotPath: string | null;
  durationMs: number;
  costUsd: number | null;
}

/**
 * Fires the Claude+Playwright MCP agent against the live council portal
 * using the current saved prompt. Persists the trace + result on the
 * `council_automation` row so the admin UI can show "last dry run: success
 * 2 hours ago".
 */
export async function dryRunAutomation(input: DryRunInput): Promise<DryRunResult> {
  const automation = await getAutomation(input.councilSlug);
  if (!automation) throw new Error(`No automation recipe for ${input.councilSlug}`);
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL not set");

  // Pick a fixture appeal payload. We never actually submit during a dry-run —
  // the prompt is overridden with a "stop at the review page, do NOT submit"
  // directive so we get a screenshot of the review without disturbing the
  // council.
  let appealPayload: Record<string, unknown> = {
    pcnRef: "WC00000000",
    vehicleReg: "AA00 AAA",
    contraventionCode: "12",
    location: "Test Lane, W1U 1AA",
    issuedAt: "2026-05-12T09:14:00+01:00",
    replyEmail: "dry-run@appeals.snappeal.ai",
    letterSubject: "Representation against PCN WC00000000",
    letterBody: "This is a Snappeal dry-run. No appeal is being submitted.",
  };
  if (input.appealId) {
    const appealRow = await db
      .select()
      .from(schema.appeals)
      .where(eq(schema.appeals.id, input.appealId));
    if (appealRow[0]) {
      const a = appealRow[0];
      const t = (a.ticket ?? {}) as Record<string, unknown>;
      appealPayload = {
        pcnRef: t.pcnRef,
        vehicleReg: t.vehicleReg,
        contraventionCode: t.contraventionCode,
        location: t.location,
        issuedAt: t.issuedAt,
        replyEmail: a.replyEmail,
        letterSubject: a.letterSubject,
        letterBody: a.letterBody,
      };
    }
  }

  const workDir = await mkdtemp(join(tmpdir(), "snappeal-dryrun-"));
  const prompt = `${automation.agentPrompt}

==== DRY RUN MODE ====
You are running in dry-run mode. Step through the portal up to the REVIEW
page but DO NOT click the final submit button. Capture a screenshot of the
review page to {{workDir}}/confirmation.png and return the result.

If you reach the review page successfully, set success=true.
If you can't get to the review page, set success=false with a reason.

Appeal payload (use these values when filling the form):
${JSON.stringify(appealPayload, null, 2)}

workDir: ${workDir}`;

  const events: string[] = [];
  const t0 = Date.now();
  const result = await runAgentic({
    prompt,
    mcpServers: {
      playwright: {
        command: process.platform === "win32" ? "npx.cmd" : "npx",
        args: ["-y", "@playwright/mcp@latest", "--headless"],
      },
    },
    allowedTools: ["mcp__playwright__*", "Read", "Write"],
    addDirs: [workDir],
    timeoutMs: input.timeoutMs ?? 5 * 60_000,
    onEvent: (e) => events.push(e.type),
  });
  const durationMs = Date.now() - t0;

  const screenshotPath = join(workDir, "confirmation.png");
  const screenshot = existsSync(screenshotPath) ? screenshotPath : null;

  // Parse the agent's final JSON.
  let parsed: unknown = null;
  try {
    const m = result.finalText.match(/\{[\s\S]*\}\s*$/);
    if (m) parsed = JSON.parse(m[0]);
  } catch {
    /* leave as null */
  }
  const ok = (parsed as { success?: boolean } | null)?.success === true;

  // Persist the trace.
  await db
    .update(schema.councilAutomation)
    .set({
      lastDryRun: { events, finalText: result.finalText, parsed, durationMs, costUsd: result.costUsd },
      lastDryRunAt: new Date(),
      lastDryRunOk: ok ? "true" : "false",
      updatedAt: new Date(),
    })
    .where(eq(schema.councilAutomation.councilSlug, input.councilSlug));

  return {
    ok,
    events,
    finalText: result.finalText,
    parsed,
    screenshotPath: screenshot,
    durationMs,
    costUsd: result.costUsd,
  };
}

// Defensive: silence unused-import warning when readFile isn't called above.
// (Kept for future "render the screenshot inline" support.)
void readFile;
