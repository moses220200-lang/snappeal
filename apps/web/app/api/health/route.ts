import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { delimiter as PATH_DELIM, join } from "node:path";
import { env, hasDatabase } from "@/lib/server/env";
import { getDb, schema } from "@/lib/server/db/client";
import { getViewer } from "@/lib/server/viewer";
import { eq } from "drizzle-orm";

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
  // Resolved through `getSettings()` so env→mode-default→admin-override
  // layering matches what the submission engine actually does.
  const { getSettings: getSettingsAsync } = await import(
    "@/lib/server/settings"
  );
  const submissionLive = getSettingsAsync().submissionLive;

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
    flags: {
      // Customer preferences — loaded from the signed-in user's
      // `notification_prefs` JSONB. Each is a personal display choice
      // (NOT an admin operational toggle); admins flipping things in
      // /admin/settings does not affect customer behaviour here.
      ...(await loadCustomerFlags()),
      // Mode-aware admin setting surfaced to the client because the
      // PaymentSheet needs to know whether to render the dev fake-pay
      // buttons. Routed through getSettings() so the env→mode-default
      // →admin-override layering matches every other admin knob;
      // replaces the legacy `process.env.NEXT_PUBLIC_PARKINGRABBIT_FAKE_PAYMENT`
      // read in the client component.
      fakePayment: getSettingsAsync().fakePayment,
    },
    timestamp: new Date().toISOString(),
  });
}

/** Read the signed-in viewer's display preferences. Guest viewers get
 *  the defaults. The shape mirrors `lib/client/flags.ts` HealthFlags. */
async function loadCustomerFlags(): Promise<{ showMcpLiveView: boolean }> {
  const defaults = { showMcpLiveView: false };
  const viewer = await getViewer();
  if (!viewer.userId) return defaults;
  const db = getDb();
  if (!db) return defaults;
  try {
    const rows = await db
      .select({ prefs: schema.users.notificationPrefs })
      .from(schema.users)
      .where(eq(schema.users.id, viewer.userId));
    const prefs = rows[0]?.prefs as Record<string, unknown> | null;
    if (!prefs) return defaults;
    return {
      showMcpLiveView: prefs.showMcpLiveView === true,
    };
  } catch {
    return defaults;
  }
}
