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
import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { customAlphabet } from "../id";
import { getDb, schema } from "./db/client";
import type { GeneratedDraft } from "./ai";
import type { Appeal as AppealView } from "../mock-data";
import type {
  KnowledgePackAudit,
  PortalLookupSnapshot,
  ProcessingStatus,
} from "./db/schema";
import type { JobKind } from "./jobs/queue";

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

/** Customer's chosen submission path. Stamped from the ticket-page
 *  recommendation card. NULL means "not yet picked"; the UI surfaces the
 *  recommendation card again in that case so the customer makes an
 *  explicit choice (or an existing appeal from before v0.2.11 reverts to
 *  the original £2.99-only behaviour). */
export type AppealPreferredMethod = "email" | "portal";

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
  portalLookup: PortalLookupSnapshot | null;
  preferredMethod: AppealPreferredMethod | null;
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
  /** Latest queued/running job for this appeal, used by the smart ticket
   *  card to subscribe to live job progress (v0.2.13). Null when the
   *  appeal has no in-flight work. Populated by listAppealsForViewer and
   *  getAppealById; write-paths that bypass those (createAppeal,
   *  attachDraftToAppeal, recordSubmission) leave it null. */
  activeJobId: string | null;
  activeJobKind: JobKind | null;
  /** v0.2.15 — per-step processing status for the smart ticket card's
   *  inline progressive loading rows (OCR / AI analysis). Portal-lookup
   *  status remains on `portalLookup.status`. NULL when no step is in
   *  flight. */
  processing: ProcessingStatus | null;
  /** Uploaded PCN photo URL — drives the image at the top of the card. */
  pcnImageUrl: string | null;
  /** PR 3 — AI strength score 0–100, NULL until the drafter has run. */
  strengthScore: number | null;
  strengthRationale: string | null;
  strengthImprovements: string[] | null;
  knowledgePackUsed: KnowledgePackAudit | null;
}

type CouncilDisplay = { logoUrl: string | null; logoBg: string | null };
type ActiveJob = { id: string; kind: JobKind };

function toRecord(
  row: typeof schema.appeals.$inferSelect,
  council?: CouncilDisplay | null,
  activeJob?: ActiveJob | null,
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
    portalLookup: (row.portalLookup as PortalLookupSnapshot | null) ?? null,
    preferredMethod:
      row.preferredMethod === "email" || row.preferredMethod === "portal"
        ? row.preferredMethod
        : null,
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
    activeJobId: activeJob?.id ?? null,
    activeJobKind: activeJob?.kind ?? null,
    processing: (row.processing as ProcessingStatus | null) ?? null,
    pcnImageUrl: row.pcnImageUrl,
    strengthScore: row.strengthScore,
    strengthRationale: row.strengthRationale,
    strengthImprovements: (row.strengthImprovements as string[] | null) ?? null,
    knowledgePackUsed: (row.knowledgePackUsed as KnowledgePackAudit | null) ?? null,
  };
}

/**
 * Latest queued/running job per appeal — drives the smart ticket card's
 * live SSE subscription. Returns the newest one per appeal so a stale
 * queued-and-superseded job doesn't drag the UI into a stuck "Validating"
 * state.
 */
async function loadActiveJobMap(
  appealIds: string[],
): Promise<Map<string, ActiveJob>> {
  if (appealIds.length === 0) return new Map();
  const rows = await db()
    .select({
      id: schema.jobs.id,
      kind: schema.jobs.kind,
      appealId: schema.jobs.appealId,
      createdAt: schema.jobs.createdAt,
    })
    .from(schema.jobs)
    .where(
      and(
        inArray(schema.jobs.appealId, appealIds),
        or(
          eq(schema.jobs.status, "queued"),
          eq(schema.jobs.status, "running"),
        )!,
      )!,
    )
    .orderBy(desc(schema.jobs.createdAt));
  const map = new Map<string, ActiveJob>();
  for (const r of rows) {
    if (r.appealId && !map.has(r.appealId)) {
      map.set(r.appealId, { id: r.id, kind: r.kind as JobKind });
    }
  }
  return map;
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
  const replyEmail = `${id}@appeals.parkingrabbit.com`;
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
  const [councilMap, jobMap] = await Promise.all([
    loadCouncilDisplayMap([rows[0].councilSlug]),
    loadActiveJobMap([rows[0].id]),
  ]);
  return toRecord(
    rows[0],
    rows[0].councilSlug ? councilMap.get(rows[0].councilSlug) : null,
    jobMap.get(rows[0].id) ?? null,
  );
}

export async function listAppealsForViewer(opts: {
  sessionId: string;
  userId?: string | null;
  /** When set, only appeals updated strictly after this Date are returned —
   *  drives the 15s reconciliation poll on the tickets list. */
  since?: Date | null;
}): Promise<AppealRecord[]> {
  const baseConditions = opts.userId
    ? or(eq(schema.appeals.userId, opts.userId), eq(schema.appeals.sessionId, opts.sessionId))!
    : eq(schema.appeals.sessionId, opts.sessionId);
  const conditions = opts.since
    ? and(baseConditions, gt(schema.appeals.updatedAt, opts.since))!
    : baseConditions;
  const rows = await db()
    .select()
    .from(schema.appeals)
    .where(conditions)
    .orderBy(desc(schema.appeals.createdAt));
  const [councilMap, jobMap] = await Promise.all([
    loadCouncilDisplayMap(rows.map((r) => r.councilSlug)),
    loadActiveJobMap(rows.map((r) => r.id)),
  ]);
  return rows.map((r) =>
    toRecord(
      r,
      r.councilSlug ? councilMap.get(r.councilSlug) : null,
      jobMap.get(r.id) ?? null,
    ),
  );
}

export async function attachDraftToAppeal(
  appealId: string,
  draft: GeneratedDraft & { modelUsed: string; costUsd: number | null },
  /** Audit trail of the KB pack the drafter saw — written verbatim onto
   *  the appeal row for debugging "why was this letter framed this way".
   *  Optional; omitted when KB retrieval failed or returned empty. */
  knowledgePack?: KnowledgePackAudit | null,
): Promise<AppealRecord> {
  const now = new Date();

  // Defence in depth: the Letter schema already requires body.length >= 80,
  // but anything bypassing the schema (a future caller, a JSON edit in the
  // CLI output, a partial cleanup of whitespace) must NOT flip the appeal
  // to status=ready with a blank body — the UI's LetterPreview returns
  // null for empty bodies, leaving the customer staring at a "Submit"
  // button with no letter above it. Throw so the generate-stream catch
  // calls markAppealFailed and the card offers a Retry surface instead.
  if (!draft.letter.body || draft.letter.body.trim().length < 80) {
    throw new Error(
      `Refusing to persist draft for ${appealId}: letter body is empty or too short (${
        draft.letter.body?.trim().length ?? 0
      } chars).`,
    );
  }

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
      strengthScore: draft.strength.score,
      strengthRationale: draft.strength.rationale,
      strengthImprovements: draft.strength.improvements,
      knowledgePackUsed: knowledgePack ?? null,
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

/**
 * Merge a single processing step's status into the appeal's `processing`
 * jsonb without clobbering other in-flight steps. v0.2.15 — used by the
 * OCR pipeline and the AI-analysis pipeline so each can report its own
 * lifecycle independently.
 */
export async function setProcessingStep(
  appealId: string,
  step: "ocr" | "analysis",
  status: "pending" | "running" | "done" | "failed",
  error?: string | null,
): Promise<void> {
  const existing = await db()
    .select({ processing: schema.appeals.processing })
    .from(schema.appeals)
    .where(eq(schema.appeals.id, appealId));
  const current = (existing[0]?.processing as ProcessingStatus | null) ?? {};
  const next: ProcessingStatus = {
    ...current,
    [step]: {
      status,
      error: error ?? undefined,
      completedAt: status === "done" || status === "failed" ? new Date().toISOString() : undefined,
    },
  };
  await db()
    .update(schema.appeals)
    .set({ processing: next, updatedAt: new Date() })
    .where(eq(schema.appeals.id, appealId));
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
    grounds?: string[];
    preferredMethod?: AppealPreferredMethod | null;
    /** v0.2.15 — progressive processing status per step. */
    processing?: ProcessingStatus | null;
    /** v0.2.15 — uploaded PCN photo URL (Blob). */
    pcnImageUrl?: string | null;
    /** v0.2.16 — workflow step sentinel (e.g. EVIDENCE_DONE_STEP). */
    step?: string;
  },
): Promise<AppealRecord | null> {
  const updates: Partial<typeof schema.appeals.$inferInsert> = { updatedAt: new Date() };
  if (patch.notes !== undefined) updates.notes = patch.notes;
  if (patch.preferredMethod !== undefined) updates.preferredMethod = patch.preferredMethod;
  if (patch.processing !== undefined) updates.processing = patch.processing;
  if (patch.pcnImageUrl !== undefined) updates.pcnImageUrl = patch.pcnImageUrl;
  if (patch.step !== undefined) updates.step = patch.step;
  if (patch.ticket !== undefined) {
    updates.ticket = patch.ticket as AppealView["ticket"];
    // The intake flow (manual entry + OCR) puts the council slug inside
    // the ticket jsonb. Hoist it onto the top-level `council_slug` FK
    // column so downstream code (portal lookup, submission engine) can
    // resolve the council row without first reading + re-parsing the
    // ticket. Only set when the slug points at a real councils row.
    const candidate = (patch.ticket as { councilSlug?: string } | null)?.councilSlug;
    if (candidate && /^[a-z0-9-]+$/.test(candidate)) {
      const matches = await db()
        .select({ slug: schema.councils.slug })
        .from(schema.councils)
        .where(eq(schema.councils.slug, candidate));
      if (matches[0]) updates.councilSlug = matches[0].slug;
    }
  }
  if (patch.serviceTier !== undefined) updates.serviceTier = patch.serviceTier;
  if (patch.grounds !== undefined) updates.grounds = patch.grounds;
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

/**
 * Persist a council-portal lookup snapshot onto the appeal. When the
 * portal returned canonical ticket fields, merge them into `appeals.ticket`
 * so the downstream letter draft + portal submission use the council's
 * own record rather than the OCR's guess. Photos uploaded to Blob arrive
 * here pre-resolved as URLs and are written verbatim into the snapshot.
 */
export async function persistPortalLookup(input: {
  appealId: string;
  snapshot: PortalLookupSnapshot;
}): Promise<AppealRecord | null> {
  const updates: Partial<typeof schema.appeals.$inferInsert> = {
    portalLookup: input.snapshot,
    updatedAt: new Date(),
  };
  // Merge portal-confirmed fields onto the existing OCR'd ticket — the
  // portal is more authoritative than OCR. We only patch fields the portal
  // actually returned; missing fields stay as the OCR guess.
  if (input.snapshot.metadata) {
    const existing = await getAppealById(input.appealId);
    const merged = {
      ...(existing?.ticket ?? {}),
      ...Object.fromEntries(
        Object.entries(input.snapshot.metadata).filter(
          ([, v]) => v !== undefined && v !== null,
        ),
      ),
    };
    updates.ticket = merged as AppealView["ticket"];
  }
  await db()
    .update(schema.appeals)
    .set(updates)
    .where(eq(schema.appeals.id, input.appealId));
  return getAppealById(input.appealId);
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
