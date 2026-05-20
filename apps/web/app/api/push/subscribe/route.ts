/**
 * POST /api/push/subscribe — stash a Web Push subscription against the
 * current user. The body is the PushSubscription.toJSON() shape; we save
 * the whole blob so we can later POST notifications via web-push.
 *
 * Anonymous browsers (no signed-in user) get a 401 — push without an
 * account isn't supported (subscriptions would orphan with no way to
 * notify).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/server/auth";
import { getDb, schema } from "@/lib/server/db/client";
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json(jsonError("UNAUTHENTICATED", "Sign in first"), { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(jsonError("BAD_REQUEST", "Invalid push subscription", String(err)), {
      status: 400,
    });
  }

  const db = getDb();
  if (!db) return NextResponse.json(jsonError("DATABASE_NOT_CONFIGURED", "DB missing"), { status: 503 });

  // Store the subscription on the user's notificationPrefs jsonb until we
  // add a dedicated push_subscriptions table. Merge against existing prefs
  // so the user's email/push toggles aren't wiped each time the service
  // worker re-subscribes.
  const existingRow = await db
    .select({ notificationPrefs: schema.users.notificationPrefs })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1);
  const existing = (existingRow[0]?.notificationPrefs ?? {}) as Record<string, unknown>;

  await db
    .update(schema.users)
    .set({
      notificationPrefs: {
        ...existing,
        push: { endpoint: body.endpoint, keys: body.keys, subscribedAt: new Date().toISOString() },
      },
    })
    .where(eq(schema.users.id, user.id));

  return NextResponse.json({ ok: true });
}
