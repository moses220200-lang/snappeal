/**
 * Council-portal PCN lookup via Claude + Playwright MCP.
 *
 * Sibling to `runPortalAutomation()` (in `./portal.ts`) but READ-ONLY: the
 * agent walks the public appeals portal, looks up the PCN with reference
 * + reg, opens the "View images" route, captures the warden photos and
 * any visible metadata, and returns a validity verdict — without ever
 * submitting a representation or starting a payment.
 *
 * Used by the `pcn_lookup` job kind, which fires between intake and
 * the evidence/quiz page so the user sees portal-confirmed details
 * (and is hard-blocked when the portal says the PCN is paid / closed /
 * not found).
 *
 * Reuses the same `runAgentic()` machinery, Playwright MCP config, and
 * screenshot watcher as the submission flow, so the smart ticket card
 * on `/app/tickets/[id]` can stream live screenshots inline via the same
 * SSE pipeline (behind the "Watch live" disclosure).
 */
import { mkdtemp, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { runAgentic } from "../claude-cli";
import { appendProgress, watchScreenshots } from "../jobs/progress";
import { mcpHeadlessFlag } from "../settings";
import { getAutomation } from "./automation";
import { emitToolStep, extractJsonObject } from "./_progress";
import { uploadPortalPhotos } from "../blob";
import type { AppealRecord } from "../appeals";
import { schema } from "../db/client";
import type { PortalLookupSnapshot, PortalLookupVerdict } from "../db/schema";
import { WESTMINSTER_LOOKUP_PROMPT } from "./prompts/westminster_lookup";

type CouncilRow = typeof schema.councils.$inferSelect;

const VERDICTS: readonly PortalLookupVerdict[] = [
  "open",
  "paid",
  "closed",
  "not_found",
  "expired",
  "unknown",
];

const LookupResultSchema = z.object({
  success: z.boolean(),
  verdict: z.enum(VERDICTS as unknown as [PortalLookupVerdict, ...PortalLookupVerdict[]]).optional(),
  verdictReason: z.string().nullable().optional(),
  metadata: z
    .object({
      pcnRef: z.string().optional(),
      vehicleReg: z.string().optional(),
      contraventionCode: z.string().optional(),
      location: z.string().optional(),
      issuedAt: z.string().optional(),
      amountPence: z.number().int().nonnegative().optional(),
      discountUntil: z.string().optional(),
      fullChargeFrom: z.string().optional(),
      dueDateAt: z.string().optional(),
      paidAt: z.string().nullable().optional(),
    })
    .partial()
    .optional(),
  photoFiles: z.array(z.string()).optional(),
  stepsCompleted: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
  errorMessage: z.string().nullable().optional(),
});

export interface PortalLookupResult {
  /** Did the agent successfully complete the read-only walk? */
  success: boolean;
  snapshot: PortalLookupSnapshot;
  /** Filesystem path of the most recent screenshot (review preview). */
  screenshotPath: string | null;
  durationMs: number;
  costUsd: number | null;
  /** Underlying agent error, if any. */
  error: string | null;
}

const FALLBACK_LOOKUP_PROMPT = `You are ParkingRabbit's council-portal LOOKUP agent.

Your job is to confirm whether a PCN is still open and capture the
council's own evidence photos — READ-ONLY only. NEVER submit a form
other than the initial PCN lookup. NEVER click Pay, Make Representation,
Challenge, Dispute, Appeal, Submit, or Finish.

Steps:
1. Open the council's appeals portal (URL in the user prompt).
2. Accept any cookie banner.
3. Find a PCN lookup form (PCN reference + vehicle reg). Submit it with
   the EXACT values from the payload (preserve casing + spacing).
4. From the resulting ticket-details page, determine the verdict:
     "open"      — page offers View / Pay / Challenge options.
     "paid"      — page explicitly shows the PCN as paid in full.
     "closed"    — case is cancelled, withdrawn, or no longer pursued.
     "expired"   — statutory challenge window has passed.
     "not_found" — lookup returned "not found" / no record.
     "unknown"   — none of the above can be reasonably determined.
5. Capture visible ticket metadata (pcnRef, vehicleReg, contraventionCode,
   location, issuedAt, amountPence, discountUntil, fullChargeFrom,
   dueDateAt, paidAt). Leave fields undefined if not on the page.

   LIVE METADATA PROTOCOL — emit a plain-text line of the EXACT form
   "[metadata]field=value" on its own line as soon as you read each
   field. Example: "[metadata]pcnRef=WC12345678". The wrapper parses
   these to update the customer's screen in real time.
6. If a "View images" / "View photos" route exists, follow it and call
   \`mcp__playwright__browser_take_screenshot\` once per visible warden
   photo with filename "warden-1.png", "warden-2.png", etc.
7. Return ONE JSON object matching the schema below as your final reply
   — no commentary, no prose:

{
  "success": boolean,
  "verdict": "open"|"paid"|"closed"|"expired"|"not_found"|"unknown",
  "verdictReason": "one-sentence reason",
  "metadata": { ... },
  "photoFiles": ["warden-1.png", "warden-2.png"],
  "stepsCompleted": number,
  "notes": "optional",
  "errorMessage": null
}

Hard rules:
- Stop after 30 navigation/form steps maximum.
- If CAPTCHA / human verification appears, abort with errorMessage="captcha".
- Pass screenshot filenames as basenames only — --output-dir is configured
  for you.
- NEVER click any button that lodges a representation or starts a payment.
`;

export async function runPortalLookup(opts: {
  appeal: AppealRecord;
  council: CouncilRow;
  /** Job id for streaming SSE progress to the customer. */
  jobId?: string;
  /** Filesystem root for live screenshot streaming (defaults to <cwd>/public). */
  publicRoot?: string;
}): Promise<PortalLookupResult> {
  const { appeal, council, jobId } = opts;
  const started = Date.now();
  const workDir = await mkdtemp(join(tmpdir(), "snappeal-lookup-"));
  // Per-run Chrome user-data-dir lives INSIDE the workDir so each
  // Playwright MCP invocation gets its own isolated browser profile.
  // Without this, two back-to-back lookups against the same council
  // share state — one run's stale Chrome lock blocks the next, which is
  // the recurring "Browser MCP session appears locked" failure mode.
  // The workDir is torn down by the OS at boot; we also explicitly
  // clean it up via `rm` in the runAgentic finally.
  const userDataDir = join(workDir, "chrome-profile");
  const publicRoot = opts.publicRoot ?? join(process.cwd(), "public");

  const watcher = jobId
    ? watchScreenshots({ jobId, workDir, publicRoot })
    : { stop: async () => {} };

  if (jobId) {
    await appendProgress(jobId, {
      kind: "status",
      message: `Looking up your PCN with ${council.name}`,
    });
  }

  const automation = await getAutomation(council.slug);
  const systemPrompt =
    automation?.lookupAgentPrompt ??
    (council.slug === "westminster" ? WESTMINSTER_LOOKUP_PROMPT : FALLBACK_LOOKUP_PROMPT);

  const userPrompt = `Look up this PCN on the council's appeals portal.

Council: ${council.name}
Portal URL: ${council.appealPortalUrl}

PCN lookup payload (use these EXACT values when filling the lookup form
— preserve casing, dashes, spaces, leading zeros):
- PCN reference: ${appeal.ticket?.pcnRef ?? "UNKNOWN"}
- Vehicle reg:   ${appeal.ticket?.vehicleReg ?? "UNKNOWN"}

This is a READ-ONLY walk. Do NOT click any submit / pay / representation
button. Capture warden photos via mcp__playwright__browser_take_screenshot
with filenames "warden-1.png", "warden-2.png", etc. Use these milestone
basenames for the navigation screenshots:

  01-portal-loaded.png        (after first navigation)
  02-ticket-found.png         (after the lookup form resolves)
  03-photos-summary.png       (after opening View images)
  warden-1.png, warden-2.png  (one per visible warden image)

Return the lookup JSON as specified in the system prompt — no commentary.`;

  const events: string[] = [];
  // Page-as-source-of-truth: the agent emits structured `[tag]value`
  // lines as it reads the council portal, and we treat THOSE as the
  // primary validation output. Final-JSON parsing remains a fallback
  // for legacy prompts, but the `[verdict]` + `[verdictReason]` +
  // `[metadata]field=value` lines are now the canonical channel. This
  // sidesteps the Claude CLI's Windows "exit mid-completion" failure
  // mode entirely — by the time the agent is emitting the verdict
  // line, all the structured data is already on the wire.
  const METADATA_RE = /^\s*\[metadata\]\s*([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*(.+?)\s*$/;
  const VERDICT_RE = /^\s*\[verdict\]\s*(open|paid|closed|expired|not_found|unknown)\s*$/i;
  const VERDICT_REASON_RE = /^\s*\[verdictReason\]\s*(.+?)\s*$/;
  const scrapedMetadata: Record<string, string> = {};
  let scrapedVerdict: PortalLookupVerdict | undefined;
  let scrapedReason: string | undefined;
  const scrapeFromText = (text: string) => {
    if (!text) return;
    for (const line of text.split(/\r?\n/)) {
      const m = METADATA_RE.exec(line);
      if (m) {
        scrapedMetadata[m[1]] = m[2];
        continue;
      }
      const v = VERDICT_RE.exec(line);
      if (v) {
        scrapedVerdict = v[1].toLowerCase() as PortalLookupVerdict;
        continue;
      }
      const r = VERDICT_REASON_RE.exec(line);
      if (r) {
        scrapedReason = r[1];
      }
    }
  };
  const result = await runAgentic({
    prompt: userPrompt,
    systemPrompt,
    mcpServers: {
      playwright: {
        command: process.platform === "win32" ? "npx.cmd" : "npx",
        args: [
          "-y",
          "@playwright/mcp@latest",
          ...mcpHeadlessFlag(),
          "--output-dir",
          workDir,
          // Per-run user-data-dir gives each lookup an isolated Chrome
          // profile so back-to-back runs can't lock each other out
          // ("Browser MCP session appears locked" failure mode). The
          // workDir is a unique mkdtemp() path, torn down with the run.
          "--user-data-dir",
          userDataDir,
        ],
      },
    },
    allowedTools: ["mcp__playwright__*", "Read", "Write"],
    addDirs: [workDir],
    // Lookup is cheaper than submission — no letter to paste, fewer
    // pages to traverse. Cap at 3 minutes so a hung portal doesn't tie
    // up a worker slot.
    timeoutMs: 3 * 60_000,
    onEvent: (e) => {
      events.push(e.type);
      if (jobId) void emitToolStep(jobId, e);
      // Sniff metadata from both full assistant text blocks and the
      // streamed partial-message deltas. Either could land first; if
      // both arrive we just overwrite with the latest value (idempotent).
      const raw = e.raw as Record<string, unknown> | null;
      if (!raw) return;
      const message = raw.message as Record<string, unknown> | undefined;
      const content = (message?.content ?? []) as Array<Record<string, unknown>>;
      for (const block of content) {
        if (block.type === "text" && typeof block.text === "string") {
          scrapeFromText(block.text);
        }
      }
      const evt = raw.event as Record<string, unknown> | undefined;
      if (evt?.type === "content_block_delta") {
        const delta = evt.delta as Record<string, unknown> | undefined;
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          scrapeFromText(delta.text);
        }
      }
    },
  });
  await watcher.stop();

  if (jobId) {
    await appendProgress(jobId, { kind: "status", message: "Confirming validity" });
  }

  // Optional JSON parse — kept as a courtesy fallback, but the
  // scraped lines are the authoritative source of truth now.
  const parsedRaw = extractJsonObject(result.finalText);
  const parsed = parsedRaw ? LookupResultSchema.safeParse(parsedRaw) : null;
  const jsonData = parsed && parsed.success ? parsed.data : null;

  const screenshot = await pickLatestPng(workDir);

  // Merge scraped lines + optional JSON. Scraped wins where both
  // exist because they came directly off the page the agent was
  // reading, not from a final summary that might have been cut off.
  const mergedMetadata: Record<string, unknown> = { ...(jsonData?.metadata ?? {}) };
  for (const [k, v] of Object.entries(coerceMetadata(scrapedMetadata))) {
    mergedMetadata[k] = v;
  }
  const finalVerdict: PortalLookupVerdict | undefined =
    scrapedVerdict ?? jsonData?.verdict;
  const finalReason = scrapedReason ?? jsonData?.verdictReason ?? undefined;

  // Walk the workDir for warden screenshots. Used to gate on the
  // JSON's `photoFiles` array — too fragile when the JSON didn't
  // arrive. Now we always sweep the disk for `warden-*.png` files.
  const allFiles = await readdir(workDir).catch(() => [] as string[]);
  const wardenFiles = allFiles.filter((f) => /^warden-\d+\.png$/i.test(f));
  const wardenPaths = wardenFiles
    .map((f) => join(workDir, f))
    .filter((p) => existsSync(p));
  const photoUrls = wardenPaths.length
    ? await uploadPortalPhotos({ appealId: appeal.id, paths: wardenPaths })
    : [];

  const hasUsefulData =
    Object.keys(mergedMetadata).length > 0 ||
    photoUrls.length > 0 ||
    Boolean(finalVerdict);

  if (!hasUsefulData) {
    // Agent emitted nothing useful — couldn't read the page at all.
    return {
      success: false,
      snapshot: emptySnapshot({
        jobId: jobId ?? null,
        status: "error",
        verdictReason: `agent didn't read the portal page (events=${events.length})`,
      }),
      screenshotPath: screenshot,
      durationMs: Date.now() - started,
      costUsd: result.costUsd,
      error: `agent didn't read the portal (events=${events.length})`,
    };
  }

  // Verdict policy:
  //   - If the agent emitted [verdict], use it.
  //   - Else, if we have metadata (page was readable), default to "open"
  //     — pulling ticket data means the PCN exists and is queryable.
  //   - Else "unknown".
  const resolvedVerdict: PortalLookupVerdict =
    finalVerdict ??
    (Object.keys(mergedMetadata).length > 0 ? "open" : "unknown");
  const lifecycle: PortalLookupSnapshot["status"] =
    resolvedVerdict === "paid" ||
    resolvedVerdict === "closed" ||
    resolvedVerdict === "not_found"
      ? "invalid"
      : "verified";

  const snapshot: PortalLookupSnapshot = {
    jobId: jobId ?? null,
    status: lifecycle,
    verdict: resolvedVerdict,
    verdictReason:
      finalReason ??
      (finalVerdict
        ? undefined
        : "Council page was read; verdict assumed open from the captured ticket data"),
    photoUrls,
    metadata:
      Object.keys(mergedMetadata).length > 0
        ? (mergedMetadata as NonNullable<PortalLookupSnapshot["metadata"]>)
        : undefined,
    fetchedAt: new Date().toISOString(),
  };

  return {
    success: true,
    snapshot,
    screenshotPath: screenshot,
    durationMs: Date.now() - started,
    costUsd: result.costUsd,
    error: null,
  };
}

/**
 * Coerce a flat string-only metadata bag (as scraped from `[metadata]`
 * lines) into the typed `PortalLookupSnapshot["metadata"]` shape. The
 * portal emits `amountPence` as a pence integer string; everything else
 * is a string and lands verbatim.
 */
function coerceMetadata(
  raw: Record<string, string>,
): NonNullable<PortalLookupSnapshot["metadata"]> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "amountPence") {
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n) && n >= 0) out[k] = n;
      continue;
    }
    out[k] = v;
  }
  return out as NonNullable<PortalLookupSnapshot["metadata"]>;
}

function emptySnapshot(
  base: Pick<PortalLookupSnapshot, "jobId" | "status"> & { verdictReason?: string },
): PortalLookupSnapshot {
  return {
    jobId: base.jobId,
    status: base.status,
    verdictReason: base.verdictReason,
    photoUrls: [],
    fetchedAt: new Date().toISOString(),
  };
}

async function pickLatestPng(dir: string): Promise<string | null> {
  if (!existsSync(dir)) return null;
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  const pngs = names.filter((n) => n.toLowerCase().endsWith(".png"));
  if (pngs.length === 0) return null;
  // Files have predictable prefixes (01-…, 02-…) so a lex sort yields
  // the latest milestone last. Warden screenshots come AFTER 03- so they
  // also end up at the tail — which is fine; we just want SOMETHING for
  // the validating page's preview.
  pngs.sort();
  return join(dir, pngs[pngs.length - 1]);
}
