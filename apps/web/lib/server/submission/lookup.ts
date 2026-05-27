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
import { getSettings, mcpHeadlessFlag } from "../settings";
import { getAutomation } from "./automation";
import { emitToolStep, extractJsonObject } from "./_progress";
import { uploadPortalPhotos, uploadPortalPhotosFromUrls } from "../blob";
import {
  hasDeterministicRecipe,
  runDeterministicLookup,
} from "./recipes";
import type { AppealRecord } from "../appeals";
import { schema } from "../db/client";
import type { PortalLookupSnapshot, PortalLookupVerdict } from "../db/schema";
import { WESTMINSTER_LOOKUP_PROMPT } from "./prompts/westminster_lookup";
import { LAMBETH_LOOKUP_PROMPT } from "./prompts/lambeth_lookup";

/**
 * Per-council fallback lookup prompts — used ONLY when a council has no
 * `lookup_agent_prompt` row in `council_automation` yet. The DB seed in
 * `getAutomation()` populates this for any council in DEFAULTS on first
 * read, so under normal operation this map is reached only on a fresh
 * deploy or a wiped row.
 */
const PER_COUNCIL_LOOKUP_FALLBACK: Record<string, string> = {
  westminster: WESTMINSTER_LOOKUP_PROMPT,
  lambeth: LAMBETH_LOOKUP_PROMPT,
};

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

   As SOON as you determine the verdict — and BEFORE capturing any
   photos — emit it on its own line using the bracket-tag protocol so
   the customer can move ahead immediately:

     [verdict]<one of the values above>
     [verdictReason]<one-sentence reason citing the page text>

5. Capture visible ticket metadata (pcnRef, vehicleReg, contraventionCode,
   location, issuedAt, amountPence, discountUntil, fullChargeFrom,
   dueDateAt, paidAt). Leave fields undefined if not on the page.

   LIVE METADATA PROTOCOL — emit a plain-text line of the EXACT form
   "[metadata]field=value" on its own line as soon as you read each
   field. Example: "[metadata]pcnRef=WC12345678". The wrapper parses
   these to update the customer's screen in real time.
6. If a "View images" / "View photos" route exists, follow it. Then run
   ONE \`mcp__playwright__browser_evaluate\` to harvest the absolute URLs
   of every warden photo in the DOM — do NOT screenshot them. Function
   body:

     () => Array.from(
       document.querySelectorAll('img.warden-photo, .ticket-image img, .gallery-item img, .photo-gallery img, .photos-list img, main img')
     )
       .map((el) => ({ src: el.getAttribute('src') || '', w: el.naturalWidth || 0, h: el.naturalHeight || 0 }))
       .filter((r) => r.src && r.w >= 200 && r.h >= 200)
       .map((r) => ({ url: new URL(r.src, location.href).href }));

   For each URL, emit one line on its own:
     [photoUrl]<absolute-url>

   The wrapper fetches each URL server-side and re-hosts the bytes on
   our CDN. Take ONE audit-record screenshot "03-photos-summary.png"
   of the photos page overview (not one per photo).
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
  /** Fired ONCE the moment the council's verdict is first read off the
   *  page — with the verdict + metadata captured so far and NO photos yet.
   *  Lets the caller persist a verified snapshot early so the customer can
   *  advance to Pay/appeal while the agent keeps capturing warden photos in
   *  the background. The final return value still carries the full snapshot
   *  (incl. photos) for a final persist. */
  onVerdictConfirmed?: (snapshot: PortalLookupSnapshot) => void | Promise<void>;
}): Promise<PortalLookupResult> {
  const { appeal, council, jobId, onVerdictConfirmed } = opts;
  const started = Date.now();

  // Phase 9 — deterministic-first lookup. Try the per-council
  // Playwright recipe before spending Claude tokens. The recipe
  // either:
  //   - Succeeds → return immediately with a fully-built snapshot.
  //     ~10-20s, $0. ai_calls row is written by the worker with
  //     mode='deterministic'.
  //   - Drifts (DOM signature mismatch) → fall through to the
  //     Claude MCP path below. The drift reason is logged so the
  //     admin sees WHICH signature broke.
  //   - Errors (timeout / network) → fall through. Same as drift.
  //   - No recipe registered → fall through silently.
  if (
    appeal.ticket?.pcnRef &&
    appeal.ticket?.vehicleReg &&
    hasDeterministicRecipe(council.slug)
  ) {
    if (jobId) {
      await appendProgress(jobId, {
        kind: "status",
        message: `Checking ${council.name} (fast path)`,
      });
    }
    const recipeResult = await runDeterministicLookup(council.slug, {
      pcnRef: appeal.ticket.pcnRef,
      vehicleReg: appeal.ticket.vehicleReg,
    });
    if (recipeResult?.ok) {
      // Re-host warden photos to Blob the same way the Claude path
      // does so the customer-facing URLs survive a portal-side
      // cookie expiry.
      const photoUrls = recipeResult.photoUrls.length
        ? await uploadPortalPhotosFromUrls({
            appealId: appeal.id,
            urls: recipeResult.photoUrls,
          })
        : [];

      const lifecycle: PortalLookupSnapshot["status"] =
        recipeResult.verdict === "paid" ||
        recipeResult.verdict === "closed" ||
        recipeResult.verdict === "not_found"
          ? "invalid"
          : "verified";
      const snapshot: PortalLookupSnapshot = {
        jobId: jobId ?? null,
        status: lifecycle,
        verdict: recipeResult.verdict,
        verdictReason: recipeResult.verdictReason,
        photoUrls,
        metadata: Object.keys(recipeResult.metadata).length
          ? recipeResult.metadata
          : undefined,
        fetchedAt: new Date().toISOString(),
      };
      // Fire the early-confirmation callback so the customer
      // advances immediately — same UX as the Claude path's
      // onVerdictConfirmed.
      if (onVerdictConfirmed) {
        await Promise.resolve(onVerdictConfirmed(snapshot)).catch(() => {});
      }
      return {
        success: true,
        snapshot,
        screenshotPath: null, // deterministic path never screenshots
        durationMs: recipeResult.durationMs,
        costUsd: 0,
        error: null,
      };
    }
    // Drift or error → log the reason so the admin sees which
    // signature broke, then fall through to the Claude MCP path.
    if (recipeResult) {
      const detail = recipeResult.drift
        ? `recipe drift at step ${recipeResult.step}: ${recipeResult.reason}`
        : `recipe error (${recipeResult.errorKind}): ${recipeResult.reason}`;
      console.warn(`[lookup] ${council.slug} ${detail} — falling back to Claude MCP`);
      if (jobId) {
        await appendProgress(jobId, {
          kind: "status",
          message: `Switching to deep validation (council portal may have changed)`,
        });
      }
    }
  }

  // ─── Claude MCP fallback (legacy path) ───
  const workDir = await mkdtemp(join(tmpdir(), "parkingrabbit-lookup-"));
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
    PER_COUNCIL_LOOKUP_FALLBACK[council.slug] ??
    FALLBACK_LOOKUP_PROMPT;

  // Runtime screenshot directive — appended to the user prompt instead
  // of baking the milestone screenshot list into every council's
  // canonical prompt. Lets the admin toggle `mcpCaptureScreenshots` in
  // /admin/settings flip behaviour live without prompt edits.
  //
  // ON  (audit mode): agent takes milestone screenshots for the admin
  //                    to inspect drift / debug a broken portal.
  // OFF (default, fast path): HTML-scrape only via browser_evaluate —
  //                    no browser_take_screenshot calls. ~3× faster
  //                    lookups; sufficient for prod where we only need
  //                    the verdict + photo URLs.
  //
  // Warden photo URLs are NEVER screenshots — they're URL-harvested
  // and re-hosted via Blob, independent of this directive.
  const captureScreenshots = getSettings().mcpCaptureScreenshots;
  const screenshotDirective = captureScreenshots
    ? `SCREENSHOT CAPTURE: ENABLED (audit mode).
For admin audit + drift detection, take milestone screenshots at:
  01-portal-loaded.png  (after first navigation)
  02-ticket-found.png   (after the lookup form resolves)
  03-photos-summary.png (after opening View images, if the link exists)
DO NOT screenshot individual warden photos — URL-harvest those via
browser_evaluate as specified in the system prompt.`
    : `SCREENSHOT CAPTURE: DISABLED (fast path).
DO NOT call mcp__playwright__browser_take_screenshot anywhere in this
run. Use HTML scrape via mcp__playwright__browser_evaluate as the
system prompt specifies. This cuts the lookup duration by ~3×.`;

  const userPrompt = `Look up this PCN on the council's appeals portal.

Council: ${council.name}
Portal URL: ${council.appealPortalUrl}

PCN lookup payload (use these EXACT values when filling the lookup form
— preserve casing, dashes, spaces, leading zeros):
- PCN reference: ${appeal.ticket?.pcnRef ?? "UNKNOWN"}
- Vehicle reg:   ${appeal.ticket?.vehicleReg ?? "UNKNOWN"}

This is a READ-ONLY walk. Do NOT click any submit / pay / representation
button.

${screenshotDirective}

Warden photo URLs (always required): emit `+ "`[photoUrl]<absolute-url>`" + ` lines per the system
prompt's browser_evaluate harvest. The wrapper fetches each URL
server-side and re-hosts on Blob.

Return the verdict + metadata as the system prompt specifies — no commentary.`;

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
  // v0.3.7 — DOM-first warden photos. The agent emits one
  // `[photoUrl]<absolute-url>` line per `<img>` it found on the View
  // Images page (extracted via a single `browser_evaluate` instead of
  // a screenshot per photo). The wrapper fetches each URL server-side
  // after the run, re-hosts on Blob, and persists the resulting URLs
  // to `portalLookup.photoUrls` (the customer-facing list).
  const PHOTO_URL_RE = /^\s*\[photoUrl\]\s*(https?:\/\/\S+?)\s*$/;
  const scrapedMetadata: Record<string, string> = {};
  let scrapedVerdict: PortalLookupVerdict | undefined;
  let scrapedReason: string | undefined;
  const scrapedPhotoUrls = new Set<string>();

  /** Run the bracket-tag regexes against ONE complete line. Never call
   *  this with a partial fragment — it will happily match truncated URLs
   *  (e.g. `[photoUrl]https://pcnevidence` mid-stream) and the wrapper
   *  will then try to fetch a hostname like `pcnevidence` and fail with
   *  `getaddrinfo ENOTFOUND`. */
  const scrapeLine = (line: string) => {
    const m = METADATA_RE.exec(line);
    if (m) {
      scrapedMetadata[m[1]] = m[2];
      return;
    }
    const v = VERDICT_RE.exec(line);
    if (v) {
      scrapedVerdict = v[1].toLowerCase() as PortalLookupVerdict;
      return;
    }
    const r = VERDICT_REASON_RE.exec(line);
    if (r) {
      scrapedReason = r[1];
      return;
    }
    const p = PHOTO_URL_RE.exec(line);
    if (p) {
      // De-dup by exact URL string — `Set` handles the case where the
      // agent emits the same warden URL twice (e.g. a re-read after a
      // navigation).
      scrapedPhotoUrls.add(p[1]);
    }
  };

  /** Used for FULL text blocks (assistant message content already complete).
   *  Safe to split on newlines and scrape every line. */
  const scrapeFromText = (text: string) => {
    if (!text) return;
    for (const line of text.split(/\r?\n/)) scrapeLine(line);
  };

  /** Streaming text_delta buffer. Claude content_block_delta events
   *  fragment a single line across many chunks — splitting `[photoUrl]…`
   *  mid-URL is the typical failure mode. We accumulate deltas and only
   *  hand a line to scrapeLine() once we've seen its terminating
   *  newline. Anything left buffered at the end of the run is flushed
   *  by the final full-text scrape. */
  let deltaBuffer = "";
  const scrapeFromDelta = (chunk: string) => {
    if (!chunk) return;
    deltaBuffer += chunk;
    let nl: number;
    while ((nl = deltaBuffer.indexOf("\n")) !== -1) {
      const line = deltaBuffer.slice(0, nl).replace(/\r$/, "");
      deltaBuffer = deltaBuffer.slice(nl + 1);
      scrapeLine(line);
    }
  };

  // Fire ONCE the first time a verdict is read off the page. Persists the
  // confirmed status (with whatever metadata is captured so far, no photos)
  // so the customer advances to Pay/appeal immediately while the agent
  // carries on capturing warden photos in the background.
  let earlyConfirmFired = false;
  const maybeConfirmEarly = () => {
    if (earlyConfirmFired || !scrapedVerdict || !onVerdictConfirmed) return;
    earlyConfirmFired = true;
    const meta = coerceMetadata(scrapedMetadata);
    const lifecycle: PortalLookupSnapshot["status"] =
      scrapedVerdict === "paid" ||
      scrapedVerdict === "closed" ||
      scrapedVerdict === "not_found"
        ? "invalid"
        : "verified";
    const prelim: PortalLookupSnapshot = {
      jobId: jobId ?? null,
      status: lifecycle,
      verdict: scrapedVerdict,
      verdictReason: scrapedReason,
      photoUrls: [],
      metadata: Object.keys(meta).length
        ? (meta as NonNullable<PortalLookupSnapshot["metadata"]>)
        : undefined,
      fetchedAt: new Date().toISOString(),
    };
    if (jobId) {
      void appendProgress(jobId, {
        kind: "status",
        message: "Council confirmed — preparing your options",
      }).catch(() => {});
    }
    void Promise.resolve(onVerdictConfirmed(prelim)).catch(() => {});
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
          // Buffer until newline — a single Claude delta routinely
          // chops a URL in half, and the bracket-tag regexes will
          // happily match `[photoUrl]https://pcnevidence` if we feed
          // them a fragment. scrapeFromDelta() only emits whole lines.
          scrapeFromDelta(delta.text);
        }
      }
      // Advance the customer the instant the verdict lands (background
      // photo capture continues).
      maybeConfirmEarly();
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

  // v0.3.7 — DOM-first photo acquisition. Preferred path: the agent
  // ran a single `browser_evaluate` on the View Images page and emitted
  // each warden photo's absolute URL via `[photoUrl]<url>` bracket-tags
  // during the run. We fetch those URLs server-side (no Chromium
  // screenshot of each photo) and re-host on Blob.
  //
  // Backwards-compat: if the agent emitted no URLs (e.g. a council
  // whose prompt hasn't migrated yet), fall through to the legacy
  // disk-sweep that picks up `warden-*.png` files the agent
  // screenshotted into workDir. Once Westminster + the fallback prompt
  // are both verified live on the URL path, the disk-sweep branch can
  // be deleted in a follow-up.
  let photoUrls: string[] = [];
  if (scrapedPhotoUrls.size > 0) {
    photoUrls = await uploadPortalPhotosFromUrls({
      appealId: appeal.id,
      urls: [...scrapedPhotoUrls],
    });
  } else {
    const allFiles = await readdir(workDir).catch(() => [] as string[]);
    const wardenFiles = allFiles.filter((f) => /^warden-\d+\.png$/i.test(f));
    const wardenPaths = wardenFiles
      .map((f) => join(workDir, f))
      .filter((p) => existsSync(p));
    if (wardenPaths.length) {
      photoUrls = await uploadPortalPhotos({
        appealId: appeal.id,
        paths: wardenPaths,
      });
    }
  }

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
