/**
 * GET   /api/admin/settings  → { settings, envStatus }
 * PATCH /api/admin/settings  body: { key, value } → { settings }
 *
 * The runtime-mutable toggles. Env-derived secrets are NEVER returned via
 * this endpoint — only the names and the configured/missing status.
 *
 * Two value shapes accepted by PATCH:
 *   - Boolean toggles (`mcpHeaded`, `stopAtReview`, etc.):
 *       `value: boolean`  → pin override
 *       `value: null`     → revert to env/mode default
 *   - Enum toggles (`claudeMode`):
 *       `value: "cli" | "sdk"` → pin override
 *       `value: null`          → revert to env/mode default
 *
 * Customer display preferences (e.g. "show MCP live view to me") are
 * NOT here — those live on `users.notification_prefs` and are written
 * via /api/users/me/notification-prefs. This endpoint is admin-only.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/server/admin";
import {
  getSettings,
  inventoryStatus,
  setClaudeMode,
  setFakePayment,
  setMcpCaptureScreenshots,
  setMcpHeaded,
  setSkipPaymentCheck,
  setStopAtReview,
  setSubmissionLive,
  setWorkerDisabled,
} from "@/lib/server/settings";
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    settings: getSettings(),
    envStatus: inventoryStatus(),
  });
}

/** Discriminated union: per-key value validation. Each variant lists
 *  the keys it applies to + the allowed value shape. */
const PatchBody = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("bool"),
    key: z.enum([
      "mcpHeaded",
      "stopAtReview",
      "submissionLive",
      "workerDisabled",
      "fakePayment",
      "skipPaymentCheck",
      "mcpCaptureScreenshots",
    ]),
    value: z.union([z.boolean(), z.null()]),
  }),
  z.object({
    kind: z.literal("claudeMode"),
    key: z.literal("claudeMode"),
    value: z.union([z.enum(["cli", "sdk"]), z.null()]),
  }),
]);

/** Older clients (notably the existing SettingsToggles UI) send
 *  `{ key, value }` without the `kind` discriminator. Promote them
 *  to the discriminated shape based on the key so backwards
 *  compatibility is one-line, not a v2 endpoint. */
function normaliseBody(raw: unknown): z.infer<typeof PatchBody> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { kind?: string; key?: unknown; value?: unknown };
  if (r.kind === "bool" || r.kind === "claudeMode") {
    const parsed = PatchBody.safeParse(r);
    return parsed.success ? parsed.data : null;
  }
  // Infer the kind from the key.
  if (r.key === "claudeMode") {
    const parsed = PatchBody.safeParse({ kind: "claudeMode", key: r.key, value: r.value });
    return parsed.success ? parsed.data : null;
  }
  const parsed = PatchBody.safeParse({ kind: "bool", key: r.key, value: r.value });
  return parsed.success ? parsed.data : null;
}

export async function PATCH(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch (err) {
    return NextResponse.json(
      jsonError("BAD_REQUEST", "Invalid JSON body", String(err)),
      { status: 400 },
    );
  }
  const body = normaliseBody(raw);
  if (!body) {
    return NextResponse.json(
      jsonError("BAD_REQUEST", "Body shape didn't match { key, value }"),
      { status: 400 },
    );
  }

  if (body.kind === "claudeMode") {
    setClaudeMode(body.value);
  } else {
    // Boolean toggle. The Zod schema already guarantees value is
    // boolean|null and key is one of the listed boolean toggles.
    const v = body.value;
    switch (body.key) {
      case "mcpHeaded":
        setMcpHeaded(v);
        break;
      case "stopAtReview":
        setStopAtReview(v);
        break;
      case "submissionLive":
        setSubmissionLive(v);
        break;
      case "workerDisabled":
        setWorkerDisabled(v);
        break;
      case "fakePayment":
        setFakePayment(v);
        break;
      case "skipPaymentCheck":
        setSkipPaymentCheck(v);
        break;
      case "mcpCaptureScreenshots":
        setMcpCaptureScreenshots(v);
        break;
    }
  }

  return NextResponse.json({ settings: getSettings() });
}
