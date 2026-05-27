/**
 * Web Push dispatcher.
 *
 * Single source for sending push notifications to a user's stored
 * `notification_prefs.push` subscription. Knows nothing about appeals
 * or jobs — it takes a payload and dispatches via the `web-push` lib.
 * Caller (lib/server/notifications/dispatchAppealEvent.ts) decides
 * when/why to send.
 *
 * Failure handling:
 *   - 410 Gone (subscription revoked / expired) → clear the stored
 *     push sub on the user row so we don't keep retrying a dead
 *     endpoint. Returns `{ ok: false, gone: true }` so the caller can
 *     log + move on.
 *   - 4xx other → log + bail; don't crash the worker.
 *   - 5xx / network → log + bail; the user will get the next event's
 *     push once the endpoint recovers. We don't retry here — the
 *     queue's retry is for job-level work, not telemetry.
 *
 * VAPID keys are pinned at module load. Both env vars MUST be set in
 * production; in dev, missing keys silently no-op (logs a warning
 * once) so a missing-key dev environment doesn't break the appeal
 * flow. The customer just doesn't get a notification.
 */
import webpush from "web-push";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db/client";
import {
  mergePrefs,
  type StoredPushSubscription,
} from "./notifications/types";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT ?? "mailto:hello@parkingrabbit.com";

let vapidConfigured = false;
function configureVapid(): boolean {
  if (vapidConfigured) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn(
      "[push] VAPID keys not set (NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY) — push dispatch is a no-op.",
    );
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  vapidConfigured = true;
  return true;
}

export interface PushPayload {
  /** First line of the system notification. Keep short — iOS truncates
   *  around 60 chars. */
  title: string;
  /** Body line. Keep short — 120 chars is a safe cap across iOS + Chrome. */
  body: string;
  /** Deep link the service worker opens when the notification is tapped.
   *  Relative URLs OK; the SW resolves them against the origin. */
  url: string;
  /** OS-level tag — when a second push arrives for the same appeal,
   *  the OS REPLACES the previous notification instead of stacking.
   *  Pass `appealId` here for natural deduping. */
  tag: string;
}

export interface SendPushResult {
  ok: boolean;
  /** True when the subscription is gone (HTTP 410). The caller's
   *  cleanup of the stored sub is already done by `sendPush` — this
   *  is just informational. */
  gone?: boolean;
  /** When ok=false, a short reason for logs. */
  reason?: string;
}

/**
 * Send a push to one signed-in user. NO-OP for guests (no userId
 * means no stored subscription).
 */
export async function sendPush(
  userId: string,
  payload: PushPayload,
): Promise<SendPushResult> {
  if (!configureVapid()) {
    return { ok: false, reason: "vapid_keys_missing" };
  }
  const db = getDb();
  if (!db) return { ok: false, reason: "db_missing" };

  // Fetch the user's stored push subscription.
  const rows = await db
    .select({ prefs: schema.users.notificationPrefs })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  const prefs = mergePrefs(rows[0]?.prefs);
  if (!prefs.push) return { ok: false, reason: "no_subscription" };

  const sub = prefs.push;
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: sub.keys,
      },
      JSON.stringify(payload),
      // TTL: 24h is the right balance — long enough for a user to come
      // back tomorrow morning, short enough that a stale verdict
      // doesn't ping them a week later.
      { TTL: 60 * 60 * 24 },
    );
    return { ok: true };
  } catch (err) {
    return await handleSendError(userId, sub, err);
  }
}

async function handleSendError(
  userId: string,
  sub: StoredPushSubscription,
  err: unknown,
): Promise<SendPushResult> {
  // `web-push` throws `WebPushError` with `.statusCode` for HTTP failures.
  const statusCode =
    typeof err === "object" && err && "statusCode" in err
      ? (err as { statusCode: number }).statusCode
      : null;

  if (statusCode === 404 || statusCode === 410) {
    // Subscription is permanently gone. Clear it from the user row so
    // we don't keep retrying a dead endpoint on every future event.
    const db = getDb();
    if (db) {
      try {
        const rows = await db
          .select({ prefs: schema.users.notificationPrefs })
          .from(schema.users)
          .where(eq(schema.users.id, userId));
        const prefs = mergePrefs(rows[0]?.prefs);
        prefs.push = null;
        await db
          .update(schema.users)
          .set({ notificationPrefs: prefs })
          .where(eq(schema.users.id, userId));
      } catch (cleanupErr) {
        console.warn(
          `[push] failed to clear gone subscription for ${userId}: ${
            cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
          }`,
        );
      }
    }
    return { ok: false, gone: true, reason: `http_${statusCode}` };
  }

  const message = err instanceof Error ? err.message : String(err);
  console.warn(
    `[push] dispatch to ${sub.endpoint.slice(0, 80)} failed (status=${statusCode ?? "?"}): ${message}`,
  );
  return {
    ok: false,
    reason: statusCode != null ? `http_${statusCode}` : "send_error",
  };
}
