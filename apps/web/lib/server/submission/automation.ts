/**
 * Per-council MCP automation helpers — read/write the `council_automation`
 * row, seed defaults from canonical prompts, run a dry-run against the
 * live portal.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { runAgentic } from "../claude-cli";
import { mcpHeadlessFlag } from "../settings";
import { mkdtemp, readdir, stat, rename } from "node:fs/promises";
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

/**
 * Wipe whatever's in the DB and re-seed from the canonical prompt. Useful
 * after a bad edit, or when this file's WESTMINSTER_AGENT_PROMPT etc. is
 * updated and you want the live DB row to pick up the new copy without
 * docker-execing into Postgres.
 */
export async function resetAutomationToCanonical(councilSlug: string) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL not set");
  const def = DEFAULTS[councilSlug];
  if (!def) return null;
  await db
    .delete(schema.councilAutomation)
    .where(eq(schema.councilAutomation.councilSlug, councilSlug));
  return getAutomation(councilSlug); // re-seeds from DEFAULTS
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
  /** Optional: inline ticket override — lets the admin/tests run a dry-run
   *  against a specific PCN ref + reg without creating a full appeal first. */
  ticketOverride?: {
    pcnRef?: string;
    vehicleReg?: string;
    contraventionCode?: string;
    location?: string;
    issuedAt?: string;
    amountPence?: number;
    issuer?: string;
    letterBody?: string;
    letterSubject?: string;
    replyEmail?: string;
    grounds?: string[];
  } | null;
  /** Optional: cap the wall-clock so the admin doesn't have to wait. */
  timeoutMs?: number;
}

export interface DryRunResult {
  ok: boolean;
  events: string[];
  /** Every MCP tool call the agent made, in order. Used to verify whether
   *  the agent actually called browser_take_screenshot vs claiming it did. */
  toolCalls: Array<{ name: string; input: unknown }>;
  finalText: string;
  parsed: unknown;
  /** Most recently saved screenshot (the review page in dry-run mode). */
  screenshotPath: string | null;
  /** Every PNG the agent wrote during the run, in directory order. */
  allScreenshots: string[];
  /** Temp workDir where the MCP server wrote screenshots (auto-cleaned by OS). */
  workDir: string;
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
  // council. Without an appealId we use synthetic values so the agent can
  // still validate the portal flow.
  let appealPayload: Record<string, unknown> = {
    issuer: "Westminster City Council",
    pcnRef: "WC00000000",
    vehicleReg: "AA00 AAA",
    contraventionCode: "12",
    amountPence: 13000,
    location: "Test Lane, W1U 1AA",
    issuedAt: "2026-05-12T09:14:00+01:00",
    grounds: ["signage-unclear"],
    replyEmail: "dry-run@appeals.snappeal.ai",
    letterSubject: "Representation against PCN WC00000000",
    letterBody: "This is a Snappeal dry-run. No appeal is being submitted.",
    fixture: true,
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
        issuer: t.issuer,
        pcnRef: t.pcnRef,
        vehicleReg: t.vehicleReg,
        contraventionCode: t.contraventionCode,
        amountPence: t.amountPence,
        location: t.location,
        issuedAt: t.issuedAt,
        grounds: a.grounds ?? [],
        replyEmail: a.replyEmail,
        letterSubject: a.letterSubject,
        letterBody: a.letterBody,
        fixture: false,
      };
    }
  }
  if (input.ticketOverride) {
    // Merge inline overrides onto whatever we started with (fixture or appeal).
    appealPayload = { ...appealPayload, ...input.ticketOverride, fixture: false };
  }

  const workDir = await mkdtemp(join(tmpdir(), "snappeal-dryrun-"));
  const prompt = `${automation.agentPrompt}

==== DRY RUN MODE ====
You are running in dry-run mode. Step through the portal up to the REVIEW
page but DO NOT click the final submit button.

REQUIRED SCREENSHOTS (HARD REQUIREMENT — read this twice):
The dry-run wrapper checks workDir for PNG files after you finish. If there
are ZERO PNG files, your success=true claim is AUTOMATICALLY REJECTED and
the dry-run is marked as failed — regardless of what you say in your
response. The user cannot see your accessibility snapshots. They can only
see actual PNG images. browser_snapshot does NOT count — only the
mcp__playwright__browser_take_screenshot tool produces a PNG.

You MUST call mcp__playwright__browser_take_screenshot (NOT browser_snapshot)
at each of these moments. Pass filename as a basename only:

  • After the landing page loads:                 filename: "01-landing.png"
  • After the PCN lookup form is filled (if any): filename: "02-lookup.png"
  • After the challenge route is opened:          filename: "03-challenge.png"
  • After the letter is pasted into the textarea: filename: "04-letter.png"
  • On the FINAL REVIEW PAGE (before any submit): filename: "05-review.png"

The 05-review.png screenshot is the most important — use fullPage:true on
that one so the entire review is captured even if it scrolls. Do not declare
success=true until 05-review.png has been written.

If you reach the review page successfully, set success=true.
If you can't get to the review page, set success=false with a reason.

Appeal payload (use these values when filling the form):
${JSON.stringify(appealPayload, null, 2)}`;

  const events: string[] = [];
  const toolCalls: Array<{ name: string; input: unknown }> = [];
  const t0 = Date.now();
  const result = await runAgentic({
    prompt,
    mcpServers: {
      playwright: {
        command: process.platform === "win32" ? "npx.cmd" : "npx",
        // `--output-dir` makes browser_take_screenshot land in workDir so
        // the dry-run's final screenshot path is found by `existsSync` below.
        // `--headless` is conditional: admins can flip headed mode on from
        // /admin/health to watch the dry-run drive the portal live.
        args: ["-y", "@playwright/mcp@latest", ...mcpHeadlessFlag(), "--output-dir", workDir],
      },
    },
    allowedTools: ["mcp__playwright__*", "Read", "Write"],
    addDirs: [workDir],
    timeoutMs: input.timeoutMs ?? 5 * 60_000,
    onEvent: (e) => {
      events.push(e.type);
      // Pull every tool_use out of assistant messages so we can verify the
      // agent actually called browser_take_screenshot when it claims to.
      const raw = e.raw as Record<string, unknown> | null;
      const msg = raw?.message as Record<string, unknown> | undefined;
      const content = (msg?.content ?? []) as Array<Record<string, unknown>>;
      for (const block of content) {
        if (block.type === "tool_use") {
          toolCalls.push({ name: String(block.name ?? ""), input: block.input });
        }
      }
    },
  });
  const durationMs = Date.now() - t0;

  // @playwright/mcp@latest currently IGNORES --output-dir and writes PNGs
  // into process.cwd() (typically apps/web/). Sweep the cwd for any PNG
  // touched during this run window and pull them into workDir so the rest
  // of the wrapper can treat workDir as authoritative.
  await rescuePngsFromCwd(workDir, t0);

  // Pick the most recently modified PNG in workDir. The agent saves
  // milestone-named files (e.g. "05-review.png") per the canonical prompt,
  // so we can't hardcode a single filename — take the latest.
  const screenshot = await pickLatestPng(workDir);
  const allScreenshots = await listPngs(workDir);

  // Parse the agent's final JSON. The reply often comes wrapped in a
  // ```json ... ``` fence, so we extract the first {...} block (greedy
  // match of the LAST closing brace) regardless of trailing fence text.
  const parsed = extractAgentJson(result.finalText);
  const agentSaysOk = (parsed as { success?: boolean } | null)?.success === true;
  // Hard requirement: at least one PNG must exist. The agent loves to claim
  // success while only ever calling browser_snapshot (text dump) instead of
  // browser_take_screenshot. We refuse to accept success without proof.
  const ok = agentSaysOk && allScreenshots.length > 0;

  // Persist the trace.
  await db
    .update(schema.councilAutomation)
    .set({
      lastDryRun: {
        events,
        finalText: result.finalText,
        parsed,
        durationMs,
        costUsd: result.costUsd,
        screenshotPath: screenshot,
        appealId: input.appealId ?? null,
      },
      lastDryRunAt: new Date(),
      lastDryRunOk: ok ? "true" : "false",
      updatedAt: new Date(),
    })
    .where(eq(schema.councilAutomation.councilSlug, input.councilSlug));

  return {
    ok,
    events,
    toolCalls,
    finalText: result.finalText,
    parsed,
    screenshotPath: screenshot,
    allScreenshots,
    workDir,
    durationMs,
    costUsd: result.costUsd,
  };
}

/**
 * @playwright/mcp@latest writes browser_take_screenshot output to its cwd
 * rather than the configured --output-dir on Windows. Move any PNG created
 * since `runStart` into workDir so screenshots aren't silently lost (and
 * so we don't pollute apps/web with leftover files).
 */
async function rescuePngsFromCwd(workDir: string, runStart: number): Promise<void> {
  const cwd = process.cwd();
  let names: string[] = [];
  try {
    names = await readdir(cwd);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.toLowerCase().endsWith(".png")) continue;
    const src = join(cwd, name);
    let mtime = 0;
    try {
      mtime = (await stat(src)).mtimeMs;
    } catch {
      continue;
    }
    if (mtime < runStart) continue; // not from this run
    const dest = join(workDir, name);
    try {
      await rename(src, dest);
    } catch {
      /* leave behind — best effort */
    }
  }
}

async function listPngs(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const names = await readdir(dir);
  return names.filter((n) => n.toLowerCase().endsWith(".png")).map((n) => join(dir, n));
}

async function pickLatestPng(dir: string): Promise<string | null> {
  const pngs = await listPngs(dir);
  if (pngs.length === 0) return null;
  let latest = pngs[0];
  let latestMtime = (await stat(latest)).mtimeMs;
  for (const p of pngs.slice(1)) {
    const m = (await stat(p)).mtimeMs;
    if (m > latestMtime) {
      latest = p;
      latestMtime = m;
    }
  }
  return latest;
}

/**
 * Extract the agent's final JSON object from a free-form reply. The agent
 * usually returns a JSON block wrapped in a ```json ... ``` fence and then
 * extra prose around it, so a simple "last brace to last brace" sweep is
 * unreliable. This walker scans for a balanced {...} substring.
 */
function extractAgentJson(text: string): unknown | null {
  if (!text) return null;
  // 1) Try a fenced ```json ... ``` block.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      /* fall through */
    }
  }
  // 2) Brace-balance scan — pick the longest balanced object we can find.
  let best: string | null = null;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (inString) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(i, j + 1);
          if (!best || candidate.length > best.length) best = candidate;
          break;
        }
      }
    }
  }
  if (best) {
    try {
      return JSON.parse(best);
    } catch {
      return null;
    }
  }
  return null;
}

