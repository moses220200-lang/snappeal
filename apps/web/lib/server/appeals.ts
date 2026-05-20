/**
 * Appeals service — all read/write of the `appeals` table goes through here.
 *
 * Frontend never talks to Drizzle directly; it goes via /api/appeals/* which
 * thinly wraps these helpers. Two cases:
 *
 *   - guest:     `sessionId` only, `userId` null
 *   - signed-in: both `sessionId` and `userId` set; sessionId is preserved
 *                so guest history doesn't get orphaned across sign-ins.
 *
 * Status flow:
 *   draft  →  ready (after /api/generate)  →  submitting →  submitted
 *           →  under_review  →  decision_pending  →  cancelled | rejected
 */
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { customAlphabet } from "../id";
import { getDb, schema } from "./db/client";
import type { GeneratedDraft } from "./ai";
import type { Appeal as AppealView } from "../mock-data";

const newAppealId = customAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyz",
  16,
  "ap_",
);

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "DATABASE_URL is not set. The real backend requires Postgres — see apps/web/.env.example.",
    );
  }
}

function db() {
  const client = getDb();
  if (!client) throw new DatabaseNotConfiguredError();
  return client;
}

const DEFAULT_TIMELINE = [
  {
    id: "ticket_added",
    label: "Ticket uploaded",
    state: "completed" as const,
    at: null,
  },
  {
    id: "info_collected",
    label: "Information collected",
    state: "pending" as const,
    at: null,
  },
  {
    id: "appeal_written",
    label: "Appeal written",
    state: "pending" as const,
    at: null,
  },
  {
    id: "appeal_submitted",
    label: "Appeal submitted",
    state: "pending" as const,
    at: null,
  },
];

interface CreateAppealInput {
  sessionId: string;
  userId?: string | null;
  notes?: string | null;
}

export interface AppealRecord {
  id: string;
  sessionId: string;
  userId: string | null;
  replyEmail: string | null;
  status: AppealView["status"];
  step: string;
  ticket: AppealView["ticket"] | null;
  grounds: string[];
  notes: string | null;
  letterSubject: string | null;
  letterBody: string | null;
  letterWordCount: number | null;
  letterAddressedTo: string | null;
  timeline: AppealView["timeline"];
  councilSlug: string | null;
  councilLogoUrl: string | null;
  councilLogoBg: string | null;
  modelUsed: string | null;
  costPenceMillis: number | null;
  createdAt: string;
  updatedAt: string;
}

type CouncilDisplay = { logoUrl: string | null; logoBg: string | null };

function toRecord(
  row: typeof schema.appeals.$inferSelect,
  council?: CouncilDisplay | null,
): AppealRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    userId: row.userId,
    replyEmail: row.replyEmail,
    status: row.status as AppealView["status"],
    step: row.step,
    ticket: (row.ticket as AppealView["ticket"]) ?? null,
    grounds: (row.grounds as string[]) ?? [],
    notes: row.notes,
    letterSubject: row.letterSubject,
    letterBody: row.letterBody,
    letterWordCount: row.letterWordCount,
    letterAddressedTo: row.letterAddressedTo,
    timeline: (row.timeline as AppealView["timeline"]) ?? DEFAULT_TIMELINE,
    councilSlug: row.councilSlug,
    councilLogoUrl: council?.logoUrl ?? null,
    councilLogoBg: council?.logoBg ?? null,
    modelUsed: row.modelUsed,
    costPenceMillis: row.costPenceMillis,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadCouncilDisplayMap(
  slugs: (string | null)[],
): Promise<Map<string, CouncilDisplay>> {
  const unique = Array.from(new Set(slugs.filter((s): s is string => !!s)));
  if (unique.length === 0) return new Map();
  const rows = await db()
    .select({
      slug: schema.councils.slug,
      logoUrl: schema.councils.logoUrl,
      logoBg: schema.councils.logoBg,
    })
    .from(schema.councils);
  return new Map(rows.map((r) => [r.slug, { logoUrl: r.logoUrl, logoBg: r.logoBg }]));
}

export async function createAppeal(input: CreateAppealInput): Promise<AppealRecord> {
  const id = newAppealId();
  const now = new Date();
  const timeline = DEFAULT_TIMELINE.map((s) =>
    s.id === "ticket_added"
      ? { ...s, at: now.toISOString() }
      : s,
  );
  const replyEmail = `${id}@appeals.snappeal.ai`;
  const [row] = await db()
    .insert(schema.appeals)
    .values({
      id,
      sessionId: input.sessionId,
      userId: input.userId ?? null,
      replyEmail,
      status: "draft",
      step: "photos",
      grounds: [],
      timeline,
      notes: input.notes ?? null,
    })
    .returning();
  return toRecord(row);
}

export async function getAppealById(id: string): Promise<AppealRecord | null> {
  const rows = await db().select().from(schema.appeals).where(eq(schema.appeals.id, id));
  if (!rows[0]) return null;
  const councilMap = await loadCouncilDisplayMap([rows[0].councilSlug]);
  return toRecord(rows[0], rows[0].councilSlug ? councilMap.get(rows[0].councilSlug) : null);
}

export async function listAppealsForViewer(opts: {
  sessionId: string;
  userId?: string | null;
}): Promise<AppealRecord[]> {
  const conditions = opts.userId
    ? or(eq(schema.appeals.userId, opts.userId), eq(schema.appeals.sessionId, opts.sessionId))!
    : eq(schema.appeals.sessionId, opts.sessionId);
  const rows = await db()
    .select()
    .from(schema.appeals)
    .where(conditions)
    .orderBy(desc(schema.appeals.createdAt));
  const councilMap = await loadCouncilDisplayMap(rows.map((r) => r.councilSlug));
  return rows.map((r) =>
    toRecord(r, r.councilSlug ? councilMap.get(r.councilSlug) : null),
  );
}

export async function attachDraftToAppeal(
  appealId: string,
  draft: GeneratedDraft & { modelUsed: string; costUsd: number | null },
): Promise<AppealRecord> {
  const now = new Date();

  // Resolve council_slug against the councils table — Claude sometimes returns
  // a placeholder when the image isn't readable. We only persist the FK when
  // the slug matches a real council row, otherwise null.
  let resolvedSlug: string | null = null;
  const candidate = draft.ticket.councilSlug?.trim().toLowerCase() ?? "";
  if (candidate && /^[a-z0-9-]+$/.test(candidate)) {
    const matches = await db()
      .select({ slug: schema.councils.slug })
      .from(schema.councils)
      .where(eq(schema.councils.slug, candidate));
    resolvedSlug = matches[0]?.slug ?? null;
  }
  // Persist the AI-reported slug on the ticket payload even if it's not in
  // our KB — keeps the raw output for diagnostics.
  const ticketWithSlug = { ...draft.ticket, councilSlug: candidate || draft.ticket.councilSlug };

  const [row] = await db()
    .update(schema.appeals)
    .set({
      status: "ready",
      step: "ready",
      ticket: ticketWithSlug,
      grounds: draft.groundIds,
      councilSlug: resolvedSlug,
      letterSubject: draft.letter.subject,
      letterBody: draft.letter.body,
      letterWordCount: draft.letter.wordCount,
      letterAddressedTo: draft.letter.addressedTo,
      modelUsed: draft.modelUsed,
      costPenceMillis: draft.costUsd != null ? Math.round(draft.costUsd * 100_000) : null,
      timeline: [
        { id: "ticket_added", label: "Ticket uploaded", state: "completed", at: now.toISOString() },
        { id: "info_collected", label: "Information collected", state: "completed", at: now.toISOString() },
        { id: "appeal_written", label: "Appeal written", state: "completed", at: now.toISOString() },
        { id: "appeal_submitted", label: "Appeal submitted", state: "pending", at: null },
      ],
      updatedAt: now,
    })
    .where(eq(schema.appeals.id, appealId))
    .returning();
  if (!row) throw new Error(`Appeal ${appealId} not found`);
  return toRecord(row);
}

export async function markAppealNotes(appealId: string, notes: string | null): Promise<void> {
  await db()
    .update(schema.appeals)
    .set({ notes, updatedAt: new Date() })
    .where(eq(schema.appeals.id, appealId));
}

/**
 * Flag an appeal whose draft generation threw so the Letter page can stop
 * polling and show a Retry button instead of looping forever. Uses `step` as
 * the state marker — `attachDraftToAppeal` resets step back to "ready" on
 * the next successful retry, so this self-clears.
 */
export const GENERATION_FAILED_STEP = "generation_failed";

export async function markAppealFailed(appealId: string): Promise<void> {
  await db()
    .update(schema.appeals)
    .set({ step: GENERATION_FAILED_STEP, updatedAt: new Date() })
    .where(eq(schema.appeals.id, appealId));
}

/**
 * Partial update used by the capture/notes flow to keep DB authoritative for
 * everything the user types — ticket fields from the confirm UI, service
 * tier from the wizard, notes from /app/notes.
 */
export async function patchAppealDraft(
  appealId: string,
  patch: {
    notes?: string | null;
    ticket?: Partial<AppealView["ticket"]> | null;
    serviceTier?: "buy_time" | "grounds" | "care_plan";
    evidenceCount?: number;
  },
): Promise<AppealRecord | null> {
  const updates: Partial<typeof schema.appeals.$inferInsert> = { updatedAt: new Date() };
  if (patch.notes !== undefined) updates.notes = patch.notes;
  if (patch.ticket !== undefined) updates.ticket = patch.ticket as AppealView["ticket"];
  if (patch.serviceTier !== undefined) updates.serviceTier = patch.serviceTier;
  await db().update(schema.appeals).set(updates).where(eq(schema.appeals.id, appealId));
  return getAppealById(appealId);
}

/**
 * Claim all guest appeals for a sessionId onto a signed-in userId.
 * Idempotent — only updates rows where userId IS NULL.
 */
export async function claimGuestAppealsForUser(opts: {
  sessionId: string;
  userId: string;
}): Promise<number> {
  const rows = await db()
    .update(schema.appeals)
    .set({ userId: opts.userId, updatedAt: new Date() })
    .where(
      and(eq(schema.appeals.sessionId, opts.sessionId), isNull(schema.appeals.userId)),
    )
    .returning({ id: schema.appeals.id });
  return rows.length;
}

export async function recordSubmission(input: {
  appealId: string;
  method: "portal" | "email" | "manual";
  channel: string;
  status: "queued" | "submitting" | "submitted" | "failed";
  councilReference?: string | null;
  messageId?: string | null;
  screenshotUrl?: string | null;
  lastError?: string | null;
  submittedAt?: Date | null;
}): Promise<typeof schema.submissions.$inferSelect> {
  const id = `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const [row] = await db()
    .insert(schema.submissions)
    .values({
      id,
      appealId: input.appealId,
      method: input.method,
      channel: input.channel,
      status: input.status,
      councilReference: input.councilReference ?? null,
      messageId: input.messageId ?? null,
      screenshotUrl: input.screenshotUrl ?? null,
      lastError: input.lastError ?? null,
      submittedAt: input.submittedAt ?? null,
    })
    .returning();
  // Reflect submission state on the appeal.
  const now = new Date();
  await db()
    .update(schema.appeals)
    .set({
      status:
        input.status === "submitted"
          ? "submitted"
          : input.status === "failed"
            ? "ready"
            : "submitting",
      step: input.status === "submitted" ? "submitted" : "submitting",
      timeline: [
        { id: "ticket_added", label: "Ticket uploaded", state: "completed", at: now.toISOString() },
        { id: "info_collected", label: "Information collected", state: "completed", at: now.toISOString() },
        { id: "appeal_written", label: "Appeal written", state: "completed", at: now.toISOString() },
        {
          id: "appeal_submitted",
          label: "Appeal submitted",
          state: input.status === "submitted" ? "completed" : "in_progress",
          at: input.submittedAt?.toISOString() ?? null,
        },
      ],
      updatedAt: now,
    })
    .where(eq(schema.appeals.id, input.appealId));
  return row;
}
