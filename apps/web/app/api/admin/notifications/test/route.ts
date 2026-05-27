/**
 * POST /api/admin/notifications/test
 *   body: { userId: string; title?: string; body?: string; url?: string }
 *   → { sent: boolean; reason?: string; dispatchId: string }
 *
 * Admin-fired test push. Bypasses the per-event toggle gate (test
 * payloads should ALWAYS reach the user if they have a subscription)
 * but otherwise goes through the same `sendPush` + log path as a
 * real event. Useful for verifying a user's setup, smoke-testing
 * VAPID rotation, etc.
 *
 * Recorded in `notification_dispatches` with `event = 'test'` so the
 * audit log shows admin-initiated pings alongside real ones.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { requireAdminApi } from "@/lib/server/admin";
import { sendPush } from "@/lib/server/push";
import { getDb, schema } from "@/lib/server/db/client";
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  userId: z.string().min(1).max(64),
  title: z.string().min(1).max(80).optional(),
  body: z.string().min(1).max(200).optional(),
  url: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(jsonError("BAD_REQUEST", String(err)), {
      status: 400,
    });
  }

  const payload = {
    title: parsed.title ?? "Test notification",
    body:
      parsed.body ??
      `Admin-initiated test from ${auth.user.email}. This isn't tied to a specific appeal.`,
    url: parsed.url ?? "/app/tickets",
    // No appeal-scoped tag — tests aren't tied to a ticket. Use a
    // timestamp suffix so multiple tests stack visibly.
    tag: `test:${Date.now()}`,
  };

  const result = await sendPush(parsed.userId, payload);

  // Audit row, same shape the dispatchAppealEvent path writes.
  const db = getDb();
  const dispatchId = `nd_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
  if (db) {
    try {
      await db.insert(schema.notificationDispatches).values({
        id: dispatchId,
        userId: parsed.userId,
        appealId: null,
        event: "test",
        payload,
        result: result.ok
          ? "sent"
          : result.gone
            ? "send_gone"
            : (result.reason ?? "send_failed"),
        reason: result.reason ?? null,
      });
    } catch (err) {
      console.warn(
        `[admin/test-push] log insert failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return NextResponse.json({
    sent: result.ok,
    gone: result.gone ?? false,
    reason: result.reason ?? null,
    dispatchId,
  });
}
