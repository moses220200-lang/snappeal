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
import { mkdtemp, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { runAgentic } from "../claude-cli";
import type { AppealRecord } from "../appeals";
import type { schema } from "../db/client";

type CouncilRow = typeof schema.councils.$inferSelect;

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

const SYSTEM_PROMPT = `You are Snappeal's council-portal submission agent.

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
}): Promise<PortalAutomationResult> {
  const { appeal, council } = opts;
  const started = Date.now();

  const workDir = await mkdtemp(join(tmpdir(), "snappeal-portal-"));

  const userPrompt = `Submit this PCN appeal via the council portal.

Council: ${council.name}
Portal URL: ${council.appealPortalUrl}

Appeal payload:
- PCN reference: ${appeal.ticket?.pcnRef ?? "UNKNOWN"}
- Vehicle reg: ${appeal.ticket?.vehicleReg ?? "UNKNOWN"}
- Contravention code: ${appeal.ticket?.contraventionCode ?? "UNKNOWN"}
- Location: ${appeal.ticket?.location ?? "UNKNOWN"}
- Issued: ${appeal.ticket?.issuedAt ?? "UNKNOWN"}
- Reply-to email (for council correspondence): ${appeal.replyEmail ?? "no-reply@snappeal.ai"}

Letter subject: ${appeal.letterSubject ?? ""}
Letter body (paste verbatim into the representation field):
---
${appeal.letterBody ?? ""}
---

When you finish (success or abort), call your screenshot tool and save the
result to ${workDir}/confirmation.png. Then return a single JSON object as
specified in the system prompt — no commentary.`;

  const events: string[] = [];
  const result = await runAgentic({
    prompt: userPrompt,
    systemPrompt: SYSTEM_PROMPT,
    mcpServers: {
      playwright: {
        command: process.platform === "win32" ? "npx.cmd" : "npx",
        args: ["-y", "@playwright/mcp@latest", "--headless"],
      },
    },
    allowedTools: [
      "mcp__playwright__*",
      "Read",
      "Write",
    ],
    addDirs: [workDir],
    timeoutMs: 5 * 60_000,
    onEvent: (e) => events.push(e.type),
  });

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _unused(_p: string) {
  await readFile(_p, "utf8");
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
