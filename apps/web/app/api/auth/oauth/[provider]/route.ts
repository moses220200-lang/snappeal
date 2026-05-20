import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OAuth entry point — `/api/auth/oauth/<provider>?next=<path>`.
 *
 * Real OAuth flows (Apple, Google) plug in here once their client IDs +
 * secrets land in env. Until then this endpoint short-circuits with a
 * helpful 503 so the UI's branded buttons render but the user is told
 * exactly which env var is missing.
 *
 * Wire format on success (future): 302 → provider authorize URL.
 * Wire format on failure (now):    503 + JSON error payload.
 */
const PROVIDER_ENV: Record<string, string[]> = {
  apple: ["APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_CLIENT_SECRET"],
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { provider } = await ctx.params;
  const required = PROVIDER_ENV[provider];
  if (!required) {
    return NextResponse.json(jsonError("UNKNOWN_PROVIDER", `Unknown OAuth provider: ${provider}`), {
      status: 400,
    });
  }
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    return NextResponse.json(
      jsonError(
        "OAUTH_NOT_CONFIGURED",
        `${provider} OAuth isn't configured yet. Set ${missing.join(", ")} in apps/web/.env.local to enable it.`,
      ),
      { status: 503 },
    );
  }
  // TODO: build provider-specific authorize URL and 302 there. Holding
  // the real implementation until we pick an OAuth library (most likely
  // Auth.js v5 — see wiki/docs/architecture/auth.md).
  return NextResponse.json(
    jsonError(
      "OAUTH_NOT_IMPLEMENTED",
      `${provider} env is configured but the handler is not yet wired. See wiki/docs/architecture/auth.md.`,
    ),
    { status: 501 },
  );
}
