/**
 * Shared SSE progress helpers for the council-portal MCP agents.
 *
 * Both `runPortalAutomation()` (submission) and `runPortalLookup()` (read-
 * only ticket verification) stream Claude-CLI events to the customer's
 * waiting page. The translation from `AgenticStreamEvent` → human-friendly
 * "Clicking Submit", "Typing into PCN reference", etc. is identical for
 * both flows, so it lives here.
 */
import type { AgenticStreamEvent } from "../claude-cli";
import { appendProgress } from "../jobs/progress";

/**
 * Translate a Claude CLI stream event into a customer-friendly step
 * message and append it to the job's progress log. Tool calls become
 * short visible steps; brief assistant text becomes "thoughts" UNLESS
 * the line matches the `[metadata]field=value` extraction protocol —
 * in which case it becomes a structured `metadata` event the client
 * uses to populate its live "Council confirms" panel.
 *
 * The metadata protocol is documented in the lookup prompts. Each
 * `[metadata]field=value` line found anywhere inside an assistant text
 * block emits one metadata event. The rest of the block (lines that
 * AREN'T metadata) becomes a single thought event if non-empty.
 */
const METADATA_LINE = /^\s*\[metadata\]\s*([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*(.+?)\s*$/;

export async function emitToolStep(
  jobId: string,
  evt: AgenticStreamEvent,
): Promise<void> {
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
      if (!text) continue;
      // Sniff out [metadata] lines. Each one fires a structured event;
      // remaining lines collapse into a single thought (if any).
      const lines = text.split(/\r?\n/);
      const nonMetaLines: string[] = [];
      for (const line of lines) {
        const m = METADATA_LINE.exec(line);
        if (m) {
          const field = m[1];
          const value = m[2];
          if (field && value && value.length < 200) {
            await appendProgress(jobId, { kind: "metadata", field, value });
          }
          continue;
        }
        nonMetaLines.push(line);
      }
      const thought = nonMetaLines.join("\n").trim();
      if (thought && thought.length < 240) {
        await appendProgress(jobId, { kind: "thought", message: thought });
      }
    }
  }
}

export function describeToolUse(
  toolName: string,
  input: Record<string, unknown>,
): string | null {
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

/**
 * Pull a single JSON object out of the agent's free-form final reply.
 *
 * The Claude agent often wraps its JSON in a ```json … ``` fence plus
 * extra prose before/after, so the obvious "last-brace to last-brace"
 * sweep is unreliable. This walker:
 *   1. fast-paths a whole-reply JSON.parse,
 *   2. tries a ```json … ``` fence,
 *   3. brace-balances scan for the longest valid {...} substring
 *      (skipping braces inside string literals).
 *
 * Lifted from the previously duplicated copy in `automation.ts → extractAgentJson`.
 */
export function extractJsonObject(text: string): unknown | null {
  if (!text) return null;
  const trimmed = text.trim();
  // 1) Whole-reply JSON.
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  // 2) Fenced ```json … ``` block.
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      /* fall through */
    }
  }
  // 3) Brace-balance scan — pick the longest balanced object.
  let best: string | null = null;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let j = i; j < trimmed.length; j++) {
      const ch = trimmed[j];
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
          const candidate = trimmed.slice(i, j + 1);
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
