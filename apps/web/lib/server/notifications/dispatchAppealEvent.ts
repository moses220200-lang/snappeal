/**
 * Orchestrator: takes an appeal-scoped event, decides whether to send,
 * formats the copy, and dispatches the push.
 *
 * Single funnel for every "tell the customer something happened" path:
 *   - Worker (lookup verdict / submit success / submit failure) calls
 *     `dispatchAppealEvent({ appealId, event: "validation_done", ... })`.
 *   - Inbound mail webhook calls
 *     `dispatchAppealEvent({ appealId, event: "council_replied", ... })`.
 *
 * Skips silently when:
 *   - The appeal has no owner userId (guest — no stored subscription).
 *   - The user has the per-event toggle OFF
 *     (pushOnValidation / pushOnSubmission / pushOnCouncilReply).
 *   - The user has no push subscription stored.
 *   - VAPID keys aren't configured (dev environments without push).
 *
 * Best-effort: dispatch failures are logged but never thrown — the
 * caller's primary work (writing the verdict, recording the
 * submission) MUST NOT fail because telemetry didn't get through.
 */
import { randomBytes } from "node:crypto";
import { getAppealById } from "../appeals";
import { sendPush, type PushPayload } from "../push";
import { COPY, type AppealEvent, type CopyContext } from "./copy";
import { mergePrefs } from "./types";
import { getDb, schema } from "../db/client";
import { eq } from "drizzle-orm";
import type { NotificationDispatchResult } from "../db/schema";

export interface DispatchInput {
  appealId: string;
  event: AppealEvent;
  /** Optional event-specific context. The copy entry decides whether
   *  to use it. */
  councilReference?: string | null;
  amountPence?: number | null;
  daysLeftToAppeal?: number | null;
  classification?: string | null;
}

export interface DispatchResult {
  /** True when a push was successfully sent. */
  sent: boolean;
  /** Short reason when sent=false (for logs / admin diagnostics).
   *  'no_owner' | 'no_user' | 'toggle_off' | 'no_subscription' |
   *  'no_appeal' | 'send_failed' | 'send_gone' | 'no_vapid'. */
  reason?: string;
}

export async function dispatchAppealEvent(
  input: DispatchInput,
): Promise<DispatchResult> {
  const appeal = await getAppealById(input.appealId).catch(() => null);
  if (!appeal) {
    await logDispatch({
      userId: null,
      appealId: input.appealId,
      event: input.event,
      payload: null,
      result: "no_appeal",
      reason: "appeal lookup returned null",
    });
    return { sent: false, reason: "no_appeal" };
  }
  if (!appeal.userId) {
    await logDispatch({
      userId: null,
      appealId: appeal.id,
      event: input.event,
      payload: null,
      result: "no_owner",
      reason: "appeal is anonymous",
    });
    return { sent: false, reason: "no_owner" };
  }

  // Per-event toggle gate. Default is ON (see DEFAULT_NOTIFICATION_PREFS)
  // so a brand-new user who granted push permission gets every event.
  const togglePassed = await isTogglePassed(appeal.userId, input.event);
  if (!togglePassed.ok) {
    await logDispatch({
      userId: appeal.userId,
      appealId: appeal.id,
      event: input.event,
      payload: null,
      result: togglePassed.reason as NotificationDispatchResult,
      reason: togglePassed.reason,
    });
    return { sent: false, reason: togglePassed.reason };
  }

  const ctx: CopyContext = {
    appeal,
    councilReference: input.councilReference ?? null,
    amountPence:
      input.amountPence ??
      appeal.portalLookup?.metadata?.amountPence ??
      appeal.ticket?.amountPence ??
      null,
    daysLeftToAppeal: input.daysLeftToAppeal ?? null,
    classification: input.classification ?? null,
  };
  const payload = COPY[input.event](ctx);

  const result = await sendPush(appeal.userId, payload);

  // Audit row — ONE per dispatch attempt regardless of outcome so the
  // admin can answer "why didn't user X get pinged?" by grepping the
  // log instead of reading server console output.
  const dispatchResult: NotificationDispatchResult = result.ok
    ? "sent"
    : result.gone
      ? "send_gone"
      : (result.reason as NotificationDispatchResult) ?? "send_failed";
  await logDispatch({
    userId: appeal.userId,
    appealId: appeal.id,
    event: input.event,
    payload,
    result: dispatchResult,
    reason: result.reason ?? null,
  });

  if (result.ok) return { sent: true };
  if (result.gone) return { sent: false, reason: "send_gone" };
  return { sent: false, reason: result.reason ?? "send_failed" };
}

/** Insert one row into notification_dispatches. Best-effort: a DB
 *  failure here is logged + swallowed so an audit-write blip doesn't
 *  cascade into the caller's job. */
async function logDispatch(input: {
  userId: string | null;
  appealId: string | null;
  event: AppealEvent | "test";
  payload: PushPayload | null;
  result: NotificationDispatchResult;
  reason: string | null;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.insert(schema.notificationDispatches).values({
      id: newDispatchId(),
      userId: input.userId,
      appealId: input.appealId,
      event: input.event,
      // Always store SOMETHING for payload (NOT NULL column). When the
      // gate skipped before we built the payload, store a stub.
      payload: input.payload ?? { title: "(not built)", body: "", url: "", tag: "" },
      result: input.result,
      reason: input.reason,
    });
  } catch (err) {
    console.warn(
      `[dispatch-log] insert failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

function newDispatchId(): string {
  return `nd_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}

/** Read the user's notification prefs and check the per-event toggle.
 *  Returns `{ ok: true }` if dispatch should proceed; `{ ok: false }`
 *  with a short reason otherwise. */
async function isTogglePassed(
  userId: string,
  event: AppealEvent,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = getDb();
  if (!db) return { ok: false, reason: "db_missing" };
  const rows = await db
    .select({ prefs: schema.users.notificationPrefs })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  const prefs = mergePrefs(rows[0]?.prefs);
  if (!prefs.push) return { ok: false, reason: "no_subscription" };
  switch (event) {
    case "validation_done":
    case "validation_failed":
      return prefs.pushOnValidation
        ? { ok: true }
        : { ok: false, reason: "toggle_off" };
    case "submission_done":
    case "submission_failed":
      return prefs.pushOnSubmission
        ? { ok: true }
        : { ok: false, reason: "toggle_off" };
    case "council_replied":
      return prefs.pushOnCouncilReply
        ? { ok: true }
        : { ok: false, reason: "toggle_off" };
  }
}
