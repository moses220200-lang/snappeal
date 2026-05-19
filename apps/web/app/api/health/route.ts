import { NextResponse } from "next/server";
import { env, hasDatabase } from "@/lib/server/env";

export const runtime = "nodejs";
/** Always fresh — never cache the health report. */
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Reports what the current environment has wired up. Useful for:
 *   - CI smoke tests
 *   - Vercel preview deploy sanity check
 *   - The user verifying their .env.local is loaded
 *
 * Never reveals the actual env values — only whether each is set.
 */
export async function GET() {
  const stripeWired = Boolean(
    env.STRIPE_SECRET_KEY && env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  );
  const stripeWebhookWired = Boolean(env.STRIPE_WEBHOOK_SECRET);
  const aiWired = Boolean(env.AI_GATEWAY_API_KEY);
  const dbWired = hasDatabase();

  const allReady = stripeWired && stripeWebhookWired && aiWired && dbWired;

  return NextResponse.json({
    status: allReady ? "ready" : "partial",
    nodeEnv: env.NODE_ENV,
    integrations: {
      stripe: stripeWired ? "ok" : "missing",
      stripeWebhook: stripeWebhookWired ? "ok" : "missing",
      aiGateway: aiWired ? "ok" : "missing",
      database: dbWired ? "ok" : "mock_mode",
    },
    aiModelId: env.AI_MODEL_ID,
    /** Convenience: which features are usable in the current state */
    capabilities: {
      paywall: stripeWired,
      drafting: aiWired,
      persistence: dbWired,
      submission: true, // mock submission always works in v0.1
    },
    timestamp: new Date().toISOString(),
  });
}
