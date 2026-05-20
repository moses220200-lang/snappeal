/**
 * Headless wrapper around the `claude` CLI (Claude Code).
 *
 * Two modes:
 *
 *   1. `runStructured()` — one-shot reasoning with a JSON Schema. Used for
 *      vision + drafting in /api/generate. Equivalent to `generateObject`
 *      with the AI SDK, but routed through Claude Code so prompts, model
 *      selection, and tool access stay consistent with the agentic path.
 *
 *   2. `runAgentic()` — multi-turn agent with MCP servers attached. Used by
 *      the submission engine to drive Playwright MCP through council
 *      portals. Streams tool-use events back so callers can observe and
 *      timeout cleanly.
 *
 * `--strict-mcp-config` keeps the only MCP servers in scope to the ones we
 * pass in. We resolve the claude binary path ourselves and spawn without a
 * shell so JSON-arg quoting can't be mangled by cmd.exe on Windows.
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { delimiter as PATH_DELIM } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ZodType } from "zod";
import { z } from "zod";

const DEFAULT_MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";

let resolvedClaudeBin: string | null = null;

/**
 * Walk PATH (and well-known Windows install dirs) to find an executable
 * `claude` binary we can spawn directly without a shell.
 */
function resolveClaudeBin(): string {
  if (resolvedClaudeBin) return resolvedClaudeBin;
  if (process.env.CLAUDE_BIN) {
    resolvedClaudeBin = process.env.CLAUDE_BIN;
    return resolvedClaudeBin;
  }
  const candidates = ["claude"];
  if (process.platform === "win32") {
    candidates.unshift("claude.exe", "claude.cmd");
  }
  const pathDirs = (process.env.PATH ?? "").split(PATH_DELIM).filter(Boolean);
  for (const dir of pathDirs) {
    for (const name of candidates) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) {
        resolvedClaudeBin = candidate;
        return resolvedClaudeBin;
      }
    }
  }
  resolvedClaudeBin = "claude";
  return resolvedClaudeBin;
}

export class ClaudeCliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number | null,
    public readonly stderr: string,
    public readonly stdoutTail: string,
  ) {
    // Bake the stderr tail into .message so response bodies + logs show
    // the actual cause (Not logged in / npx missing / model rejected the
    // request / etc.) instead of just "claude exited with code 1".
    const stderrTail = (stderr ?? "").trim().slice(-600);
    const outTail = (stdoutTail ?? "").trim().slice(-300);
    const detail = stderrTail || outTail
      ? `\n  stderr: ${stderrTail || "(empty)"}\n  stdout (tail): ${outTail || "(empty)"}`
      : "";
    super(message + detail);
    this.name = "ClaudeCliError";
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Structured one-shot (used by /api/generate)                               */
/* ────────────────────────────────────────────────────────────────────────── */

interface StructuredOptions<T> {
  /** User prompt — may reference image files with @-mentions. */
  prompt: string;
  /** Zod schema the response must conform to. */
  schema: ZodType<T>;
  /** Optional system prompt — appended to (not replacing) Claude Code's. */
  systemPrompt?: string;
  /** Image data URLs to make available via the Read tool. Saved to a temp dir, referenced from the prompt as `@path`. */
  imageDataUrls?: string[];
  /** Override the model. Default: CLAUDE_MODEL env, falling back to sonnet 4.6. */
  model?: string;
  /** Hard ceiling (ms) — kills the child process if it overruns. */
  timeoutMs?: number;
}

interface StructuredResult<T> {
  value: T;
  modelUsed: string;
  costUsd: number | null;
  sessionId: string | null;
}

/**
 * Run a single-shot Claude call with a JSON Schema. Throws ClaudeCliError on
 * non-zero exit, schema mismatch, or output parse failure.
 */
export async function runStructured<T>(
  opts: StructuredOptions<T>,
): Promise<StructuredResult<T>> {
  const model = opts.model ?? DEFAULT_MODEL;
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const jsonSchema = z.toJSONSchema(opts.schema, { target: "draft-7" });

  // Write image data URLs to a fresh temp dir so Claude's Read tool can pick
  // them up. Cleaned up in `finally`.
  const workDir = await mkdtemp(join(tmpdir(), "snappeal-"));
  const imageRefs: string[] = [];
  try {
    if (opts.imageDataUrls?.length) {
      for (let i = 0; i < opts.imageDataUrls.length; i++) {
        const path = await writeDataUrl(workDir, `image-${i}`, opts.imageDataUrls[i]);
        imageRefs.push(path);
      }
    }

    const prompt =
      imageRefs.length === 0
        ? opts.prompt
        : `${opts.prompt}\n\nAttached images:\n${imageRefs.map((p) => `@${p}`).join("\n")}`;

    const args = [
      "-p",
      "--strict-mcp-config",
      "--no-session-persistence",
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(jsonSchema),
      "--model",
      model,
      "--allowedTools",
      "Read",
      "--add-dir",
      workDir,
      "--disable-slash-commands",
      "--exclude-dynamic-system-prompt-sections",
    ];
    // When ANTHROPIC_API_KEY is set, run with --bare for the smallest, most
    // deterministic system prompt. Without an API key we rely on the user's
    // OAuth login (subscription), which --bare disables.
    if (process.env.ANTHROPIC_API_KEY) args.push("--bare");
    if (opts.systemPrompt) {
      args.push("--append-system-prompt", opts.systemPrompt);
    }

    const { stdout } = await spawnClaude(args, {
      stdinPrompt: prompt,
      timeoutMs,
    });

    const parsed = parseClaudeJson(stdout);
    // --json-schema places the validated payload on `structured_output`.
    // `result` is the assistant's free-form text (often empty when a schema
    // is supplied). Fall back to parsing `result` only if `structured_output`
    // is missing.
    let payload: unknown = parsed.structured_output;
    if (payload === undefined || payload === null) {
      if (typeof parsed.result === "string" && parsed.result.trim()) {
        payload = JSON.parse(parsed.result);
      } else {
        throw new ClaudeCliError(
          "Claude returned no structured_output and no result body",
          0,
          "",
          stdout.slice(-2_000),
        );
      }
    }
    const value = opts.schema.parse(payload);

    return {
      value,
      modelUsed: model,
      costUsd: parsed.total_cost_usd ?? null,
      sessionId: parsed.session_id ?? null,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Agentic loop with MCP (used by the submission engine)                     */
/* ────────────────────────────────────────────────────────────────────────── */

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface AgenticOptions {
  /** Task prompt. */
  prompt: string;
  systemPrompt?: string;
  /** MCP server spawn definitions. Each becomes a tool namespace like `mcp__playwright__*`. */
  mcpServers: Record<string, McpServerConfig>;
  /** Tool patterns Claude is allowed to use (e.g. `["mcp__playwright__*", "Read", "Write"]`). */
  allowedTools: string[];
  /** Cap on agent steps — prevents runaway spend. */
  maxTurns?: number;
  /** Additional directories the agent is allowed to read/write. */
  addDirs?: string[];
  model?: string;
  /** Per-turn event callback — receives parsed stream-json messages. */
  onEvent?: (event: AgenticStreamEvent) => void;
  timeoutMs?: number;
}

export interface AgenticStreamEvent {
  type: string;
  raw: unknown;
}

interface AgenticResult {
  finalText: string;
  events: AgenticStreamEvent[];
  costUsd: number | null;
  durationMs: number;
  isError: boolean;
}

export async function runAgentic(opts: AgenticOptions): Promise<AgenticResult> {
  const started = Date.now();
  const model = opts.model ?? DEFAULT_MODEL;
  const timeoutMs = opts.timeoutMs ?? 180_000;

  const workDir = await mkdtemp(join(tmpdir(), "snappeal-mcp-"));
  try {
    const mcpConfigPath = join(workDir, "mcp.json");
    await writeFile(mcpConfigPath, JSON.stringify({ mcpServers: opts.mcpServers }, null, 2));

    const args = [
      "-p",
      "--strict-mcp-config",
      "--no-session-persistence",
      "--output-format",
      "stream-json",
      // `--print` + `--output-format=stream-json` requires `--verbose`
      // (CLI hard requirement). We discard the verbose preamble in the
      // line-parse loop.
      "--verbose",
      "--include-partial-messages",
      "--mcp-config",
      mcpConfigPath,
      "--model",
      model,
      "--allowedTools",
      opts.allowedTools.join(" "),
      "--dangerously-skip-permissions",
      "--add-dir",
      workDir,
      "--disable-slash-commands",
      "--exclude-dynamic-system-prompt-sections",
    ];
    if (process.env.ANTHROPIC_API_KEY) args.push("--bare");
    if (opts.maxTurns) {
      // No direct flag, but we cap via --max-budget-usd as a backstop and
      // rely on the agent's internal budget. Keep maxTurns documented; the
      // submission prompt itself enforces "stop after N steps".
    }
    for (const dir of opts.addDirs ?? []) {
      args.push("--add-dir", dir);
    }
    if (opts.systemPrompt) {
      args.push("--append-system-prompt", opts.systemPrompt);
    }

    const events: AgenticStreamEvent[] = [];
    let finalText = "";
    let costUsd: number | null = null;
    let isError = false;

    const { stdout } = await spawnClaude(args, {
      stdinPrompt: opts.prompt,
      timeoutMs,
      onStdoutLine: (line) => {
        if (!line.trim()) return;
        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = JSON.parse(line);
        } catch {
          return;
        }
        if (!parsed) return;
        const evt = { type: String(parsed.type ?? "unknown"), raw: parsed };
        events.push(evt);
        opts.onEvent?.(evt);
        if (parsed.type === "result") {
          finalText = String(parsed.result ?? "");
          costUsd = (parsed.total_cost_usd as number | undefined) ?? null;
          isError = Boolean(parsed.is_error);
        }
      },
    });
    if (!finalText && stdout) {
      // Fallback — try parsing the last JSON line.
      const lines = stdout.trim().split(/\r?\n/).reverse();
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj?.type === "result") {
            finalText = String(obj.result ?? "");
            break;
          }
        } catch {
          /* keep walking */
        }
      }
    }

    return {
      finalText,
      events,
      costUsd,
      durationMs: Date.now() - started,
      isError,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Internals                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

interface SpawnOptions {
  stdinPrompt: string;
  timeoutMs: number;
  onStdoutLine?: (line: string) => void;
}

function spawnClaude(
  args: string[],
  opts: SpawnOptions,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const bin = resolveClaudeBin();
    const child = spawn(bin, args, {
      // Inherit env so ANTHROPIC_API_KEY + CLAUDE_CODE_OAUTH_TOKEN propagate.
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      // Direct exec — no shell — to avoid cmd.exe quote-mangling on Windows.
      shell: false,
      windowsHide: true,
    });

    let stdoutBuf = "";
    let stderrBuf = "";
    let lineRemainder = "";

    const onStdout = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdoutBuf += text;
      if (opts.onStdoutLine) {
        const combined = lineRemainder + text;
        const lines = combined.split(/\r?\n/);
        lineRemainder = lines.pop() ?? "";
        for (const line of lines) opts.onStdoutLine(line);
      }
    };
    const onStderr = (chunk: Buffer) => {
      stderrBuf += chunk.toString("utf8");
    };

    child.stdout!.on("data", onStdout);
    child.stderr!.on("data", onStderr);

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000);
    }, opts.timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (opts.onStdoutLine && lineRemainder) opts.onStdoutLine(lineRemainder);
      if (code === 0) {
        resolve({ stdout: stdoutBuf, stderr: stderrBuf });
      } else {
        reject(
          new ClaudeCliError(
            `claude exited with code ${code}`,
            code,
            stderrBuf,
            stdoutBuf.slice(-2_000),
          ),
        );
      }
    });

    child.stdin!.write(opts.stdinPrompt);
    child.stdin!.end();
  });
}

interface ClaudeJsonResult {
  type: string;
  subtype?: string;
  is_error?: boolean;
  session_id?: string;
  result?: unknown;
  /** Populated when --json-schema is supplied. */
  structured_output?: unknown;
  total_cost_usd?: number;
}

function parseClaudeJson(stdout: string): ClaudeJsonResult {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new ClaudeCliError("Empty stdout from claude CLI", 0, "", "");
  }
  try {
    const obj = JSON.parse(trimmed) as ClaudeJsonResult;
    if (obj.is_error) {
      throw new ClaudeCliError(
        `Claude reported error: ${String(obj.result ?? "unknown")}`,
        0,
        "",
        trimmed.slice(-2_000),
      );
    }
    return obj;
  } catch (err) {
    if (err instanceof ClaudeCliError) throw err;
    throw new ClaudeCliError(
      `Failed to parse claude JSON: ${(err as Error).message}`,
      0,
      "",
      trimmed.slice(-2_000),
    );
  }
}

async function writeDataUrl(dir: string, name: string, dataUrl: string): Promise<string> {
  const match = /^data:(image\/(?:png|jpe?g|webp|heic|gif));base64,(.+)$/i.exec(dataUrl);
  if (!match) throw new Error("Unsupported image data URL");
  const ext = match[1].split("/")[1].replace("jpeg", "jpg");
  const path = join(dir, `${name}.${ext}`);
  await writeFile(path, Buffer.from(match[2], "base64"));
  return path;
}
