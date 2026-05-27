/**
 * Per-stage Claude cost telemetry.
 *
 * Every Claude invocation (OCR, council-id, lookup, draft, strength,
 * submit, coach, strengthen_notes) writes one row to `ai_calls`. The
 * admin Appeal Tickets list reads via `SUM(cost_usd) GROUP BY stage`
 * to break each ticket's spend down by stage. The legacy
 * `appeals.cost_pence_millis` column is gone — `ai_calls` is now the
 * single source of truth for spend.
 *
 * Why a separate table, not a JSON column on `appeals`?
 *   - Multiple calls per stage (e.g. retries) each get their own row;
 *     a JSON column would clobber.
 *   - Easy aggregation: `SELECT stage, SUM(cost_usd) FROM ai_calls
 *     WHERE appeal_id = $1 GROUP BY stage` — one SQL query, no JSON
 *     reduction in app code.
 *   - Failures are first-class (`ok=false` rows) so we can plot the
 *     error rate per stage in the admin without scanning logs.
 *
 * NOTE on queue vs SDK: this helper records what HAPPENED, regardless
 * of how Claude was invoked. CLI mode reads `total_cost_usd` from the
 * stream-json output; future SDK mode will read `response.usage` and
 * compute cost from token counts. The `mode` column captures which
 * path produced each row. The job queue is orthogonal — both short
 * inline calls (extract/draft) and long queued jobs (lookup/submit)
 * write `ai_calls` rows. The queue isn't about CLI/SDK; it's about
 * tasks too long for a single HTTP request.
 */
import { randomBytes } from "node:crypto";
import { getDb, schema } from "./db/client";
import { getSettings } from "./settings";
import type {
  AiCallErrorKind,
  AiCallStage,
} from "./db/schema";

/** Loose categorisation of how a call ended. Used for admin dashboards
 *  + error-rate plots, NOT for retry logic. */
export type RecordAiCallInput = {
  appealId?: string | null;
  jobId?: string | null;
  stage: AiCallStage;
  model: string;
  /** Optional: overrides `getSettings().claudeMode`. Useful when a
   *  callsite knows it took a specific path:
   *   - 'cli' / 'sdk'      — the Claude execution path
   *   - 'deterministic'    — Playwright recipe ran, no LLM call.
   *     costUsd is always 0 in this case; admin Appeal Tickets list
   *     uses this to spot fast-path vs Claude-fallback rows. */
  mode?: "cli" | "sdk" | "deterministic";
  /** USD reported by the model. NULL when we couldn't parse it (e.g.
   *  the CLI exited mid-stream and we have a partial result). */
  costUsd?: number | null;
  durationMs: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
  ok: boolean;
  errorKind?: AiCallErrorKind | null;
  errorMessage?: string | null;
};

function newAiCallId(): string {
  // ULID-style: 6-byte timestamp + 10-byte random, base32 lowercase.
  // Lex-sortable; no external dep.
  const ts = Date.now().toString(36).padStart(10, "0");
  const rand = randomBytes(8).toString("hex");
  return `ai_${ts}${rand}`;
}

/**
 * Write a single ai_calls row. Best-effort: a DB failure here NEVER
 * blocks the caller (you don't want to fail a successful OCR just
 * because telemetry insert hit a transient DB blip).
 */
export async function recordAiCall(input: RecordAiCallInput): Promise<void> {
  const db = getDb();
  if (!db) return; // mock/no-DB dev mode — telemetry no-op
  const mode = input.mode ?? getSettings().claudeMode;
  try {
    await db.insert(schema.aiCalls).values({
      id: newAiCallId(),
      appealId: input.appealId ?? null,
      jobId: input.jobId ?? null,
      stage: input.stage,
      model: input.model,
      mode,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      cacheReadTokens: input.cacheReadTokens ?? null,
      cacheWriteTokens: input.cacheWriteTokens ?? null,
      costUsd:
        input.costUsd != null && Number.isFinite(input.costUsd)
          ? input.costUsd.toFixed(6)
          : null,
      durationMs: input.durationMs,
      ok: input.ok,
      errorKind: input.errorKind ?? null,
      errorMessage: input.errorMessage ?? null,
    });
  } catch (err) {
    // Telemetry must never break the caller. Log + swallow.
    console.warn(
      `[ai_calls] insert failed for stage=${input.stage}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/**
 * Map a thrown Error to a coarse `AiCallErrorKind`. Call from a `catch`
 * block when wiring `recordAiCall` failure paths. Best-effort
 * classification; defaults to "other".
 */
export function classifyAiError(err: unknown): AiCallErrorKind {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.toLowerCase();
  if (m.includes("timeout") || m.includes("etimedout")) return "timeout";
  if (m.includes("rate") && m.includes("limit")) return "rate_limit";
  if (m.includes("429")) return "rate_limit";
  if (m.includes("parse") || m.includes("unexpected json")) return "parse";
  if (m.includes("mcp") || m.includes("playwright")) return "mcp";
  return "other";
}

/* ───── aggregation helpers — admin Appeal Tickets list ───── */

export type AppealCostBreakdown = {
  appealId: string;
  totalUsd: number;
  /** Per-stage USD totals. Missing stages mean zero spend. */
  byStage: Partial<Record<AiCallStage, number>>;
  /** Per-stage call counts including failures. */
  callsByStage: Partial<Record<AiCallStage, number>>;
  /** Latest call timestamp (ISO). NULL when there are no rows. */
  latestAt: string | null;
};

/**
 * Compute cost breakdowns for many appeals in one round-trip. Used by
 * the admin Appeal Tickets list to avoid an N+1 query.
 */
export async function getCostBreakdowns(
  appealIds: string[],
): Promise<Map<string, AppealCostBreakdown>> {
  const out = new Map<string, AppealCostBreakdown>();
  if (appealIds.length === 0) return out;
  const db = getDb();
  if (!db) return out;
  const rows = await db
    .select({
      appealId: schema.aiCalls.appealId,
      stage: schema.aiCalls.stage,
      costUsd: schema.aiCalls.costUsd,
      createdAt: schema.aiCalls.createdAt,
    })
    .from(schema.aiCalls)
    // NOTE: `inArray` lookup intentionally not used — the caller passes
    // a smallish set (typically the current page of appeals). We fetch
    // all matching rows and bucket client-side; that's cheaper than a
    // GROUP BY for the typical 50-row page.
    .where(
      // Drizzle's `inArray` is the right primitive here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (await import("drizzle-orm")).inArray(schema.aiCalls.appealId, appealIds),
    );
  for (const r of rows) {
    if (!r.appealId) continue;
    let agg = out.get(r.appealId);
    if (!agg) {
      agg = {
        appealId: r.appealId,
        totalUsd: 0,
        byStage: {},
        callsByStage: {},
        latestAt: null,
      };
      out.set(r.appealId, agg);
    }
    const cost = r.costUsd != null ? Number(r.costUsd) : 0;
    agg.totalUsd += cost;
    const stage = r.stage as AiCallStage;
    agg.byStage[stage] = (agg.byStage[stage] ?? 0) + cost;
    agg.callsByStage[stage] = (agg.callsByStage[stage] ?? 0) + 1;
    const at = r.createdAt.toISOString();
    if (!agg.latestAt || at > agg.latestAt) agg.latestAt = at;
  }
  return out;
}

/** Convert a USD cost to pence (1 USD ≈ 79 pence at 2026 rates — but
 *  the admin renders in the source USD and shows pence as a hint).
 *  Centralised so we change the FX rate in one place. */
const USD_TO_PENCE = 79; // approximate; admin-only display, not billing
export function usdToPence(usd: number): number {
  return usd * USD_TO_PENCE;
}

/** Approximate cost of the click-Finish step we skip when
 *  `stopAtReview` is on. Used by the admin UI to project a "full
 *  submission" cost from a dev/CLI-mode dev run.
 *
 *  Derivation: the final agent turn that clicks Submit is roughly
 *  one `mcp__playwright__browser_click` tool_use + one closing
 *  assistant turn. Observed averages: ~1,500 input tokens (the
 *  accumulated conversation context) + ~80 output tokens (the final
 *  status message), at claude-sonnet-4-6's $3/MTok input + $15/MTok
 *  output → ~$0.0057. We round up for a 2× safety margin.
 *
 *  When we move to production (`stopAtReview=false`) this constant
 *  becomes vestigial — the measured `submit` cost includes the
 *  Finish click. Keep it as documentation. */
export const ESTIMATED_FINISH_CLICK_USD = 0.012;

/** Given a measured `submit` cost from a dev/stop-at-review run,
 *  project the cost a real production submission would have incurred.
 *  No-op when stopAtReview is false. */
export function projectSubmissionCost(
  measured: number | null,
  stoppedAtReview: boolean,
): number | null {
  if (measured == null) return null;
  if (!stoppedAtReview) return measured;
  return measured + ESTIMATED_FINISH_CLICK_USD;
}

/** Render a cost as a short admin-friendly string. */
export function formatCostUsd(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  if (usd === 0) return "$0";
  if (usd < 0.001) return "<$0.001";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}
