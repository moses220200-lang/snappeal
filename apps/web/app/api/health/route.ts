import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { delimiter as PATH_DELIM, join } from "node:path";
import { env, hasDatabase } from "@/lib/server/env";

export const runtime = "nodejs";
/** Always fresh — never cache the health report. */
export const dynamic = "force-dynamic";

function findClaudeBin(): string | null {
  if (process.env.CLAUDE_BIN && existsSync(process.env.CLAUDE_BIN)) return process.env.CLAUDE_BIN;
  const candidates = process.platform === "win32" ? ["claude.exe", "claude.cmd", "claude"] : ["claude"];
  const dirs = (process.env.PATH ?? "").split(PATH_DELIM).filter(Boolean);
  for (const dir of dirs) {
    for (const name of candidates) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * GET /api/health
 *
 * Reports what the current environment has wired up. Useful for CI smoke
 * tests, deploy sanity checks, and the user verifying their .env.local is
 * loaded. Never reveals secret values.
 */
export async function GET() {
  const stripeWired = Boolean(
    env.STRIPE_SECRET_KEY && env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  );
  const stripeWebhookWired = Boolean(env.STRIPE_WEBHOOK_SECRET);
  const claudeBin = findClaudeBin();
  const anthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const dbWired = hasDatabase();
  // Matches lib/server/submission/index.ts: LIVE unless explicitly set to "0".
  // Unset = live in dev/prod; only `=0` opts into the deterministic mock.
  const submissionLive = process.env.SNAPPEAL_SUBMISSION_LIVE !== "0";

  const aiReady = Boolean(claudeBin); // CLI present is enough — OAuth or key auths internally
  const allReady = stripeWired && stripeWebhookWired && aiReady && dbWired;

  return NextResponse.json({
    status: allReady ? "ready" : "partial",
    nodeEnv: env.NODE_ENV,
    integrations: {
      stripe: stripeWired ? "ok" : "missing",
      stripeWebhook: stripeWebhookWired ? "ok" : "missing",
      claudeCli: claudeBin ? "ok" : "missing",
      anthropicApiKey: anthropicKey ? "ok" : "absent_using_oauth",
      database: dbWired ? "ok" : "mock_mode",
      submissionEngine: submissionLive ? "live" : "mock",
    },
    claudeModel: process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6",
    capabilities: {
      paywall: stripeWired,
      drafting: aiReady,
      persistence: dbWired,
      submission: true, // mock or live both work
      inboundMail: dbWired && aiReady,
    },
    timestamp: new Date().toISOString(),
  });
}
