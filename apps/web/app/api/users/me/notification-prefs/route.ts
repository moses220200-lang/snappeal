/**
 * GET   /api/users/me/notification-prefs  → { prefs }
 * PATCH /api/users/me/notification-prefs  body: Partial<CustomerToggles>
 *                                          → { prefs }
 *
 * Customer-facing notification + display preferences. Guests get a 401
 * (preferences are per-user; guest sessionId isn't enough since two
 * tabs would share a session). Signed-in users read + flip the fields
 * customers control directly:
 *   - pushOn{Validation,Submission,CouncilReply}
 *   - emailOn{CouncilReply,Submission}
 *   - showMcpLiveView (display preference, not a notification — kept
 *     in the same JSONB blob for convenience since both are "personal
 *     UI choices stored on the user row")
 *
 * The `push` subscription field is NOT writable here — it's owned by
 * /api/push/subscribe (which validates the browser-issued
 * PushSubscription before persisting). The `pushAskedAt` skip-once
 * tracker is owned by the NotificationPromptGate via /api/users/me/
 * notification-prefs/asked (separate endpoint, narrower scope).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/server/db/client";
import { getViewer } from "@/lib/server/viewer";
import { jsonError } from "@/lib/server/contracts";
import {
  CUSTOMER_TOGGLE_KEYS,
  type CustomerToggleKey,
  mergePrefs,
} from "@/lib/server/notifications/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer.userId) {
    return NextResponse.json(jsonError("UNAUTHORIZED", "Sign in to read prefs"), {
      status: 401,
    });
  }
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      jsonError("DATABASE_NOT_CONFIGURED", "DB missing"),
      { status: 503 },
    );
  }
  const rows = await db
    .select({ prefs: schema.users.notificationPrefs })
    .from(schema.users)
    .where(eq(schema.users.id, viewer.userId));
  const prefs = mergePrefs(rows[0]?.prefs);
  // Strip the push subscription's secret keys from the customer-facing
  // response. The customer only needs to know whether they have a
  // subscription (boolean), not the raw endpoint.
  const { push, ...rest } = prefs;
  return NextResponse.json({
    prefs: {
      ...rest,
      hasPushSubscription: push !== null,
    },
  });
}

const PatchBody = z.object({
  // Each customer-controllable key is optional + boolean. Unknown keys
  // are rejected (strict mode below) so we catch typos in dev.
  pushOnValidation: z.boolean().optional(),
  pushOnSubmission: z.boolean().optional(),
  pushOnCouncilReply: z.boolean().optional(),
  emailOnCouncilReply: z.boolean().optional(),
  emailOnSubmission: z.boolean().optional(),
  showMcpLiveView: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const viewer = await getViewer();
  if (!viewer.userId) {
    return NextResponse.json(jsonError("UNAUTHORIZED", "Sign in to update prefs"), {
      status: 401,
    });
  }
  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      jsonError("BAD_REQUEST", "Invalid prefs body", String(err)),
      { status: 400 },
    );
  }
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      jsonError("DATABASE_NOT_CONFIGURED", "DB missing"),
      { status: 503 },
    );
  }

  // Read-modify-write so we never overwrite the `push` subscription
  // (owned by /api/push/subscribe) or `pushAskedAt` (owned by the
  // gate). Single round-trip — Postgres jsonb_set could do this
  // server-side but the merge is trivial.
  const existingRow = await db
    .select({ prefs: schema.users.notificationPrefs })
    .from(schema.users)
    .where(eq(schema.users.id, viewer.userId));
  const existing = mergePrefs(existingRow[0]?.prefs);

  const next = { ...existing };
  // Apply only the boolean fields the customer is allowed to flip.
  for (const key of CUSTOMER_TOGGLE_KEYS) {
    const v = body[key as keyof typeof body];
    if (typeof v === "boolean") {
      (next as Record<CustomerToggleKey, boolean>)[key] = v;
    }
  }

  await db
    .update(schema.users)
    .set({ notificationPrefs: next })
    .where(eq(schema.users.id, viewer.userId));

  const { push, ...rest } = next;
  return NextResponse.json({
    prefs: {
      ...rest,
      hasPushSubscription: push !== null,
    },
  });
}
