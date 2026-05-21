/**
 * Portal submission via Claude + Playwright MCP.
 *
 * Spawns the headless Claude CLI with @playwright/mcp attached, hands it the
 * appeal payload + the council's portal URL, and asks it to:
 *
 *   1. Open the portal
 *   2. Navigate to the "challenge a PCN" form
 *   3. Fill in the PCN reference, vehicle reg, and the user's contact email
 *   4. Paste the drafted letter into the representation/reasons field
 *   5. Submit
 *   6. Capture the confirmation reference + a screenshot
 *   7. Report back as a single JSON object with success/failure
 *
 * The agent runs with `--dangerously-skip-permissions` because it lives in
 * an ephemeral working directory and is allowed only the Playwright MCP
 * tools + Read/Write. No file-system damage surface.
 *
 * Hard limits: 5-minute wall-clock cap, agent budgeted via the prompt's
 * step limit (the agent is instructed to abort after 30 turns).
 */
import { mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { runAgentic, type AgenticStreamEvent } from "../claude-cli";
import type { AppealRecord } from "../appeals";
import { getDb, schema } from "../db/client";
import { getAutomation } from "./automation";
import { appendProgress, watchScreenshots } from "../jobs/progress";
import { getSettings, mcpHeadlessFlag } from "../settings";

type CouncilRow = typeof schema.councils.$inferSelect;

/**
 * Load the signed-in customer's profile (name + email + UK postal address +
 * phone) so the portal-automation prompt can fill the council's contact-
 * details form with real data instead of falling back to the "Foreign
 * address / C/o ParkingRabbit" workaround. Returns null when the appeal is still
 * anonymous (guest session — no userId yet).
 */
async function loadCustomerProfile(userId: string | null): Promise<{
  name: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  phone: string | null;
} | null> {
  if (!userId) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      email: schema.users.email,
      displayName: schema.users.displayName,
      addressLine1: schema.users.addressLine1,
      addressLine2: schema.users.addressLine2,
      addressCity: schema.users.addressCity,
      addressPostcode: schema.users.addressPostcode,
      phone: schema.users.phone,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    name: r.displayName,
    email: r.email,
    addressLine1: r.addressLine1,
    addressLine2: r.addressLine2,
    city: r.addressCity,
    postcode: r.addressPostcode,
    phone: r.phone,
  };
}

export interface PortalAutomationResult {
  success: boolean;
  councilReference: string | null;
  screenshotPath: string | null;
  error: string | null;
  durationMs: number;
  costUsd: number | null;
}

const ResultSchema = z.object({
  success: z.boolean(),
  councilReference: z.string().nullable().optional(),
  notes: z.string().optional(),
  errorMessage: z.string().nullable().optional(),
});

/**
 * Generic fallback system prompt — used when a council has no row in the
 * `council_automation` table. The Westminster + future per-council prompts
 * are stored in the DB and edited via /admin/councils/<slug>/automation,
 * which is the source of truth.
 */
const FALLBACK_SYSTEM_PROMPT = `You are ParkingRabbit's council-portal submission agent.

Your job:
- Use the Playwright MCP tools to open the council's PCN challenge portal
  (URL provided in the user prompt).
- Find the page that lets a motorist submit a representation against a PCN.
  (Often labelled "Challenge a PCN", "Make a representation", or similar.)
- Fill in every required form field using the data supplied. Map fields by
  their visible label, not by guessed selectors.
- Paste the drafted representation letter into the "reasons" / "evidence" /
  "representation" textarea. Use the exact letter text. Do NOT rewrite it.
- Submit. Capture the confirmation reference (PRN / case number / receipt
  id) and save a screenshot via the Playwright MCP screenshot tool.
- Stop after 30 navigation/form steps maximum. If the portal flow looks
  abnormal (CAPTCHA, multi-page consent gates, login wall), abort and
  return success=false with the reason in errorMessage.

When done, return ONE JSON object matching:
{ "success": boolean,
  "councilReference": string|null,
  "notes": string?,
  "errorMessage": string|null }

Hard rules:
- Never invent a council reference. Read it from the portal response.
- Never submit if you can't see and confirm the final review page.
- Treat anything that looks like a payment page as an error — appeals are
  free; the portal should be the representation/challenge route.
`;

export async function runPortalAutomation(opts: {
  appeal: AppealRecord;
  council: CouncilRow;
  /** Job id used as the anchor for live progress events streamed back to the customer. */
  jobId?: string;
  /** Filesystem root for publicly-served screenshots (defaults to <cwd>/public). */
  publicRoot?: string;
}): Promise<PortalAutomationResult> {
  const { appeal, council, jobId } = opts;
  const started = Date.now();

  const workDir = await mkdtemp(join(tmpdir(), "snappeal-portal-"));
  const publicRoot = opts.publicRoot ?? join(process.cwd(), "public");

  // Stream live screenshots to the customer if we have a job to attach to.
  const watcher = jobId
    ? watchScreenshots({ jobId, workDir, publicRoot })
    : { stop: async () => {} };

  if (jobId) {
    await appendProgress(jobId, { kind: "status", message: `Connecting to ${council.name} portal` });
  }

  const { stopAtReview } = getSettings();
  if (jobId && stopAtReview) {
    await appendProgress(jobId, {
      kind: "status",
      message: "Safety mode: stopping at review — no real submission will be sent",
    });
  }

  const stopAtReviewBlock = stopAtReview
    ? `

==================================================================
🛑 STOP-AT-REVIEW SAFETY MODE — READ FIRST 🛑
==================================================================
This run is operating in ParkingRabbit's safety mode. You MUST drive the
council portal up to the FINAL REVIEW page (the screen that shows the
filled letter + contact details + checkboxes, with a "Finish" / "Submit
representation" button visible) — and then STOP. Do NOT click the final
submit button under any circumstances.

Required behaviour:
1. Walk through every step as normal — lookup, challenge route, grounds,
   letter, contact details.
2. When you reach the review page, take the "05-review.png" screenshot.
3. Return success=true with note="stopped at review — safety mode".
4. DO NOT click Finish / Submit representation / Confirm submission / OK
   on any dialog that would lodge the representation.

If you accidentally click Finish, that's a critical bug — log it in
errorMessage. The ParkingRabbit team enables safety mode while the agent is
under iteration; lodging a real PCN appeal here would harm the user.
==================================================================
`
    : "";

  // Load the signed-in customer's profile (name + signup email + UK postal
  // address + phone) so the agent fills the council's contact form with the
  // customer's real identity instead of falling back to "The Registered
  // Keeper" + C/o ParkingRabbit. We keep `appeal.replyEmail` as the council-
  // correspondence alias (forwards to inbound mail) so replies still land
  // in the customer's ParkingRabbit inbox.
  const profile = await loadCustomerProfile(appeal.userId);
  const keeperName = profile?.name ?? "The Registered Keeper";
  const keeperContactEmail = profile?.email ?? appeal.replyEmail ?? "no-reply@parkingrabbit.com";
  const keeperReplyAlias = appeal.replyEmail ?? "no-reply@parkingrabbit.com";
  const keeperAddress = profile
    ? [profile.addressLine1, profile.addressLine2, profile.city, profile.postcode]
        .filter(Boolean)
        .join(", ")
    : "";

  const userPrompt = `Submit this PCN appeal via the council portal.${stopAtReviewBlock}

Council: ${council.name}
Portal URL: ${council.appealPortalUrl}

Appeal payload:
- PCN reference: ${appeal.ticket?.pcnRef ?? "UNKNOWN"}
- Vehicle reg: ${appeal.ticket?.vehicleReg ?? "UNKNOWN"}
- Contravention code: ${appeal.ticket?.contraventionCode ?? "UNKNOWN"}
- Location: ${appeal.ticket?.location ?? "UNKNOWN"}
- Issued: ${appeal.ticket?.issuedAt ?? "UNKNOWN"}

Registered keeper / contact (use these EXACT values on the contact form):
- Name: ${keeperName}
- Email (signup, primary contact): ${keeperContactEmail}
- Reply-to alias (for council correspondence — use if the form has a
  separate "reply" or "correspondence" email field): ${keeperReplyAlias}
- UK postal address: ${keeperAddress || "(NOT PROVIDED — try the foreign-address fallback only as last resort)"}
- Phone: ${profile?.phone ?? "(not provided — leave blank if the field is optional)"}

Letter subject: ${appeal.letterSubject ?? ""}
Letter body (paste verbatim into the representation field):
---
${appeal.letterBody ?? ""}
---

As you progress, take a screenshot at each major milestone so the user can
watch live. Use the Playwright MCP screenshot tool with the \`filename\`
argument set to ONE of these exact basenames (the MCP server is configured
to write into ${workDir}, so do not pass an absolute path):
  01-portal-loaded.png       (after first navigation)
  02-form-found.png          (after reaching the challenge form)
  03-details-filled.png      (after entering PCN + vehicle reg)
  04-letter-pasted.png       (after pasting the representation letter)
  05-review.png              (review page, BEFORE clicking submit)
  06-confirmation.png        (the success/reference page)
Skip a step only if it does not apply to this portal.

When you finish (success or abort), call your screenshot tool one last time
with filename "confirmation.png", then return a single JSON object as
specified in the system prompt — no commentary.`;

  // Load the per-council agent prompt from `council_automation` (edited via
  // /admin/councils/<slug>/automation). Falls back to the generic prompt
  // when no row exists yet — defends against forgetting to seed.
  const automation = await getAutomation(council.slug);
  const systemPrompt = automation?.agentPrompt ?? FALLBACK_SYSTEM_PROMPT;

  const events: string[] = [];
  const result = await runAgentic({
    prompt: userPrompt,
    systemPrompt,
    mcpServers: {
      playwright: {
        command: process.platform === "win32" ? "npx.cmd" : "npx",
        // `--output-dir` lands all browser_take_screenshot files inside our
        // workDir so the screenshot watcher can pipe them to the customer.
        // `--headless` is conditional: admins can toggle it off from
        // /admin/health to watch the agent drive a council portal live.
        args: ["-y", "@playwright/mcp@latest", ...mcpHeadlessFlag(), "--output-dir", workDir],
      },
    },
    allowedTools: [
      "mcp__playwright__*",
      "Read",
      "Write",
    ],
    addDirs: [workDir],
    timeoutMs: 5 * 60_000,
    onEvent: (e) => {
      events.push(e.type);
      if (jobId) void emitToolStep(jobId, e);
    },
  });
  await watcher.stop();

  if (jobId) {
    await appendProgress(jobId, { kind: "status", message: "Wrapping up" });
  }

  const screenshotPath = join(workDir, "confirmation.png");
  const screenshot = existsSync(screenshotPath) ? screenshotPath : null;

  // Parse the agent's final JSON reply.
  let parsed: z.infer<typeof ResultSchema> | null = null;
  const candidate = extractJsonObject(result.finalText);
  if (candidate) {
    const safe = ResultSchema.safeParse(candidate);
    if (safe.success) parsed = safe.data;
  }

  if (!parsed) {
    return {
      success: false,
      councilReference: null,
      screenshotPath: screenshot,
      error: `agent did not return a recognisable result (events=${events.length})`,
      durationMs: Date.now() - started,
      costUsd: result.costUsd,
    };
  }

  return {
    success: parsed.success,
    councilReference: parsed.councilReference ?? null,
    screenshotPath: screenshot,
    error: parsed.success ? null : (parsed.errorMessage ?? "agent reported failure"),
    durationMs: Date.now() - started,
    costUsd: result.costUsd,
  };
}

/**
 * Translate a Claude CLI stream event into a customer-friendly step message.
 * Most events get squashed to nothing — we only surface tool-use calls that
 * tell a story (navigate, type, click, screenshot) plus brief model thoughts.
 */
async function emitToolStep(jobId: string, evt: AgenticStreamEvent): Promise<void> {
  const raw = evt.raw as Record<string, unknown> | null;
  if (!raw) return;
  const message = raw.message as Record<string, unknown> | undefined;
  const content = (message?.content ?? []) as Array<Record<string, unknown>>;

  for (const block of content) {
    if (block.type === "tool_use") {
      const name = String(block.name ?? "");
      const input = (block.input ?? {}) as Record<string, unknown>;
      const step = describeToolUse(name, input);
      if (step) await appendProgress(jobId, { kind: "step", message: step });
    } else if (block.type === "text" && evt.type === "assistant") {
      const text = String(block.text ?? "").trim();
      if (text && text.length < 240) {
        await appendProgress(jobId, { kind: "thought", message: text });
      }
    }
  }
}

function describeToolUse(toolName: string, input: Record<string, unknown>): string | null {
  // Drop the `mcp__playwright__` prefix for matching.
  const short = toolName.replace(/^mcp__[^_]+__/, "");
  switch (short) {
    case "browser_navigate":
      return `Opening ${String(input.url ?? "the council portal")}`;
    case "browser_navigate_back":
      return "Going back to the previous page";
    case "browser_snapshot":
      return "Reading the page";
    case "browser_take_screenshot":
      return "Capturing what you'd see";
    case "browser_type":
      return `Typing into "${String(input.element ?? input.name ?? "field")}"`;
    case "browser_fill_form":
      return "Filling in your details";
    case "browser_select_option":
      return `Selecting "${String(input.values ?? input.value ?? "option")}"`;
    case "browser_click":
      return `Clicking "${String(input.element ?? input.text ?? "button")}"`;
    case "browser_press_key":
      return `Pressing ${String(input.key ?? "a key")}`;
    case "browser_file_upload":
      return "Uploading evidence";
    case "browser_wait_for":
      return "Waiting for the page to settle";
    case "browser_evaluate":
      return "Inspecting the form";
    default:
      return null;
  }
}

function extractJsonObject(text: string): unknown | null {
  if (!text) return null;
  const trimmed = text.trim();
  // Fast path: whole reply is one JSON.
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  // Otherwise pick the last {...} block.
  const start = trimmed.lastIndexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}
