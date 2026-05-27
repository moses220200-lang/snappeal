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
import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { customAlphabet } from "../id";
import { getDb, schema } from "./db/client";
import { parseUkDateToIso } from "../parseUkDate";
import type { GeneratedDraft } from "./ai";
import type { Appeal as AppealView } from "../mock-data";
import type {
  KnowledgePackAudit,
  PortalLookupSnapshot,
  ProcessingStatus,
} from "./db/schema";
import type { JobKind } from "./jobs/queue";

/** `metadata` keys whose values are dates we want stored as ISO 8601
 *  strings regardless of what shape the council portal emitted. Add to
 *  this list whenever a new date-typed key joins `PortalLookupSnapshot["metadata"]`. */
const PORTAL_METADATA_DATE_KEYS = [
  "issuedAt",
  "dueDateAt",
  "discountUntil",
  "fullChargeFrom",
  // v0.3.10 — added for paid-PCN snapshots (Imperial/Civica emit
  // `paidAt` in dd/mm/yyyy on the verdict page). Without it the
  // "Paid on …" line in AppealNotPossibleCard rendered the raw
  // scraped string while every other date was normalised.
  "paidAt",
] as const;

/** Normalise the date-typed fields in a portal snapshot's `metadata` bag
 *  to ISO strings. Returns a shallow copy when anything changed; the
 *  original reference otherwise so callers can rely on stable identity. */
function normalisePortalSnapshotDates(
  snapshot: PortalLookupSnapshot,
): PortalLookupSnapshot {
  if (!snapshot.metadata) return snapshot;
  let mutated = false;
  const meta: Record<string, unknown> = { ...snapshot.metadata };
  for (const key of PORTAL_METADATA_DATE_KEYS) {
    const raw = meta[key];
    if (typeof raw !== "string" || raw.length === 0) continue;
    const iso = parseUkDateToIso(raw);
    if (iso && iso !== raw) {
      meta[key] = iso;
      mutated = true;
    }
  }
  if (!mutated) return snapshot;
  return {
    ...snapshot,
    metadata: meta as PortalLookupSnapshot["metadata"],
  };
}

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
  step: "ocr" | "analysis" | "draft",
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
 * Update ONLY the appeal-strength fields — used by the re-score flow when a
 * customer adds more evidence to a weak appeal. The drafted letter is left
 * untouched; only the score / rationale / improvements change.
 */
export async function updateAppealStrength(
  appealId: string,
  strength: { score: number; rationale: string; improvements: string[] },
): Promise<void> {
  await db()
    .update(schema.appeals)
    .set({
      strengthScore: strength.score,
      strengthRationale: strength.rationale,
      strengthImprovements: strength.improvements,
      updatedAt: new Date(),
    })
    .where(eq(schema.appeals.id, appealId));
}

/**
 * Flag an appeal whose draft generation threw so the Letter page can stop
 * polling and show a Retry button instead of looping forever. Uses `step` as
 * the state marker — `attachDraftToAppeal` resets step back to "ready" on
 * the next successful retry, so this self-clears.
 */
export const GENERATION_FAILED_STEP = "generation_failed";

export async function markAppealFailed(
  appealId: string,
  errorMessage?: string,
): Promise<void> {
  // v0.3.6 — also stash the error message inside `processing.draft.error`
  // so the UI can surface what actually went wrong (the client's
  // fire-and-forget POST never sees the SSE error body). Dev console
  // still gets the full stack via the route's catch logger.
  const existing = await getAppealById(appealId);
  const draftError = errorMessage ?? null;
  const nextProcessing: ProcessingStatus = {
    ...(existing?.processing ?? {}),
    draft: {
      status: "failed",
      error: draftError,
      completedAt: new Date().toISOString(),
    },
  };
  await db()
    .update(schema.appeals)
    .set({
      step: GENERATION_FAILED_STEP,
      processing: nextProcessing,
      updatedAt: new Date(),
    })
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
    // FIELD-LEVEL MERGE — not wholesale replace. The /api/extract
    // two-pass flow PATCHes a partial ticket twice: pass 1 with
    // {councilSlug, issuer}, then pass 2 with the full extract.
    // If pass 2's extract returned `councilSlug:""` (logo occluded on
    // the second look) a wholesale replace would erase pass 1's good
    // value. Each PATCH now overlays: incoming non-empty fields win,
    // incoming empty/null/undefined fields leave the existing value
    // alone. Set explicit empty/null only via persistPortalLookup's
    // backfill path or a future dedicated clear endpoint.
    const incoming = (patch.ticket ?? {}) as Record<string, unknown>;
    const existingRows = await db()
      .select({
        ticket: schema.appeals.ticket,
        processing: schema.appeals.processing,
      })
      .from(schema.appeals)
      .where(eq(schema.appeals.id, appealId));
    const existingTicket = (existingRows[0]?.ticket ?? {}) as Record<
      string,
      unknown
    >;
    const merged: Record<string, unknown> = { ...existingTicket };
    for (const [k, v] of Object.entries(incoming)) {
      const isMeaningful =
        v !== undefined &&
        v !== null &&
        !(typeof v === "string" && v.trim() === "");
      if (isMeaningful) merged[k] = v;
    }
    updates.ticket = merged as AppealView["ticket"];
    // The intake flow (manual entry + OCR) puts the council slug inside
    // the ticket jsonb. Hoist it onto the top-level `council_slug` FK
    // column so downstream code (portal lookup, submission engine) can
    // resolve the council row without first reading + re-parsing the
    // ticket. Only set when the slug points at a real councils row.
    // Read from the MERGED ticket so a pass-2 empty-string councilSlug
    // doesn't drop the hoist that pass 1 already did.
    const candidate = (merged as { councilSlug?: string }).councilSlug;
    if (candidate && /^[a-z0-9-]+$/.test(candidate)) {
      const matches = await db()
        .select({ slug: schema.councils.slug })
        .from(schema.councils)
        .where(eq(schema.councils.slug, candidate));
      if (matches[0]) updates.councilSlug = matches[0].slug;
    }

    // v0.3.11 — manual-entry trap fix.
    //
    // When the user lands on "Reading failed" (processing.ocr.status =
    // 'failed') and recovers via /app/manual-entry, the submit handler
    // PATCHes the merged ticket here. Without this block the failure
    // flag stays set forever and deriveCardState keeps returning
    // extraction_failed even though we now have all the data we need —
    // the user is trapped on the failure card with no forward path.
    //
    // Rule: when the incoming PATCH leaves the merged ticket with both
    // required fields (pcnRef + vehicleReg) AND ocr.status is currently
    // 'failed', flip it to 'done'. We're not lying: the data the OCR
    // step was supposed to deliver is now present, regardless of how it
    // got there. Audit-trail of WHY the OCR errored is preserved in the
    // `error` field; we just clear the gating status.
    const mergedHasRequired =
      typeof merged.pcnRef === "string" && merged.pcnRef.trim().length > 0 &&
      typeof merged.vehicleReg === "string" && merged.vehicleReg.trim().length > 0;
    const existingProcessing = (existingRows[0]?.processing ?? {}) as ProcessingStatus;
    const ocrFailed = existingProcessing.ocr?.status === "failed";
    if (mergedHasRequired && ocrFailed && patch.processing === undefined) {
      updates.processing = {
        ...existingProcessing,
        ocr: {
          ...existingProcessing.ocr,
          status: "done",
          completedAt: new Date().toISOString(),
          // error field preserved from the original failure for audit
        },
      };
    }
  }
  if (patch.serviceTier !== undefined) updates.serviceTier = patch.serviceTier;
  if (patch.grounds !== undefined) updates.grounds = patch.grounds;
  await db().update(schema.appeals).set(updates).where(eq(schema.appeals.id, appealId));
  return getAppealById(appealId);
}

/**
 * Merge a freshly-OCR'd draft INTO an older draft that the same viewer
 * already owns for the same PCN reference + vehicle registration. The
 * client can't dedupe up-front — `uploadPcn` creates the row at photo-
 * upload time before OCR resolves the PCN ref — so duplicates appear
 * naturally when a customer (or test) re-uploads the same ticket. This
 * collapses them at the first moment the dedup key is known.
 *
 * Eligibility (all must hold):
 *   - `appealId` is still status='draft' and step != 'ticket_confirmed'
 *     (post-confirm the appeal is committed to its journey and we never
 *     touch it from here).
 *   - Its ticket has both `pcnRef` and `vehicleReg`.
 *   - An OLDER draft with the same (pcnRef, normalised vehicleReg)
 *     exists, owned by either the same signed-in user OR the same guest
 *     sessionId. The OLDER one is the keep-target — preserves whatever
 *     timeline progress that row has accumulated.
 *
 * Effect: in one transaction, the older draft is updated with the
 * fresh photo + any not-yet-set ticket fields + hoisted councilSlug,
 * the duplicate's non-cascading child rows are swept (jobs has NO FK
 * at all — orphans would survive a plain DELETE; payments has
 * `ON DELETE no action` — would throw FK violation; notification_dispatches
 * is `ON DELETE SET NULL` — swept here for tidiness), and finally the
 * duplicate row itself is deleted. The remaining child tables
 * (appeal_photos, submissions, inbound_messages, ai_calls) DO cascade,
 * so they self-clear with the row.
 *
 * Returns `{ mergedInto: <olderId> }` when a merge happened so the
 * caller can hand the client the surviving appeal id. Returns null when
 * no merge applies — the appeal stays on its own.
 *
 * Idempotent: safe to call multiple times for the same id.
 */
export async function mergeDuplicateDraftIfAny(
  appealId: string,
): Promise<{ mergedInto: string } | null> {
  const fresh = await getAppealById(appealId);
  if (!fresh) return null;
  if (fresh.status !== "draft") return null;
  // step sentinel — kept as a literal here so we don't drag the
  // client-only deriveCardState module into this server file. Mirror in
  // `lib/deriveCardState.ts` as `TICKET_CONFIRMED_STEP`.
  if (fresh.step === "ticket_confirmed") return null;

  const pcnRef = fresh.ticket?.pcnRef?.trim();
  const vehicleReg = fresh.ticket?.vehicleReg?.trim().replace(/\s+/g, "");
  if (!pcnRef || !vehicleReg) return null;

  // Ownership scope — either the same signed-in user, or the same guest
  // session. Mirrors `listAppealsForViewer`'s identity model.
  const ownerCondition = fresh.userId
    ? or(
        eq(schema.appeals.userId, fresh.userId),
        eq(schema.appeals.sessionId, fresh.sessionId),
      )!
    : eq(schema.appeals.sessionId, fresh.sessionId);

  // Match on pcnRef + whitespace-stripped vehicleReg via JSONB ops so we
  // catch "PN65 LBU" duplicating "PN65LBU". CRITICAL — only collapse
  // INTO a STRICTLY OLDER row. Without this guard, two concurrent
  // uploads whose OCR completes in reverse order would merge twice in
  // opposite directions and leave the user with zero appeals. The
  // older sibling's run is a no-op; the younger sibling's run is the
  // one that does the merge.
  const freshCreatedAt = new Date(fresh.createdAt);
  const candidates = await db()
    .select()
    .from(schema.appeals)
    .where(
      and(
        ne(schema.appeals.id, appealId),
        eq(schema.appeals.status, "draft"),
        ownerCondition,
        sql`${schema.appeals.ticket}->>'pcnRef' = ${pcnRef}`,
        sql`REPLACE(COALESCE(${schema.appeals.ticket}->>'vehicleReg', ''), ' ', '') = ${vehicleReg}`,
        lt(schema.appeals.createdAt, freshCreatedAt),
      ),
    )
    .orderBy(asc(schema.appeals.createdAt))
    .limit(1);

  const older = candidates[0];
  if (!older) return null;

  // Merge: older's ticket wins for fields it already has; the fresh
  // OCR fills in anything still empty (council_id pass may have stamped
  // issuer on `fresh` but not `older` if older predates the v0.3.6
  // two-pass OCR rollout).
  //
  // The "empty" check treats 0 as empty because amountPence is the
  // only numeric field today and 0 means "unknown" by convention.
  // FUTURE NOTE: if another numeric field is added where 0 is a real
  // observed value (e.g. wardenObservationSeconds, daysOverdue), this
  // gate will silently clobber that 0. Carry an explicit per-field
  // allowlist when that happens — same caveat applies to the
  // persistPortalLookup backfill below.
  const olderTicket = (older.ticket ?? {}) as Record<string, unknown>;
  const freshTicket = (fresh.ticket ?? {}) as Record<string, unknown>;
  const mergedTicket: Record<string, unknown> = { ...olderTicket };
  for (const [k, v] of Object.entries(freshTicket)) {
    if (v === undefined || v === null) continue;
    const current = mergedTicket[k];
    const isEmpty =
      current === undefined ||
      current === null ||
      current === "" ||
      (typeof current === "number" && current === 0);
    if (isEmpty) mergedTicket[k] = v;
  }

  // Hoist councilSlug to the top-level FK column if the merged ticket
  // has one and the older row was missing it. Pass-1 of /api/extract
  // stamped it on the duplicate but the merge above only writes the
  // jsonb — without this the FK column stays null and downstream code
  // (deriveCardState, payment URL, council picker) acts as if no
  // council is set.
  const mergedSlug = (mergedTicket as { councilSlug?: string }).councilSlug;
  let resolvedCouncilSlug: string | null = older.councilSlug ?? null;
  if (!resolvedCouncilSlug && mergedSlug && /^[a-z0-9-]+$/.test(mergedSlug)) {
    const matches = await db()
      .select({ slug: schema.councils.slug })
      .from(schema.councils)
      .where(eq(schema.councils.slug, mergedSlug));
    if (matches[0]) resolvedCouncilSlug = matches[0].slug;
  }

  // Atomic merge: explicitly clear the FK-less / no-cascade child
  // rows on the DUPLICATE row, then UPDATE older and DELETE duplicate
  // in one transaction. The docstring at the top of this function used
  // to claim FK cascades for everything; in reality:
  //   - `jobs.appeal_id` has NO FK at all (just a btree index) — orphan
  //     rows would survive and the worker would pick them up and burn
  //     retries on a missing appeal.
  //   - `payments.appeal_id` has `ON DELETE no action` — the DELETE
  //     below would throw an FK violation and the extract route's
  //     try/catch would swallow it, leaving the older row already
  //     mutated and the duplicate still alive.
  //   - `notification_dispatches.appeal_id` is `ON DELETE SET NULL` —
  //     correct but we still clear inside the txn so an admin querying
  //     by appealId after the merge sees the right state.
  // Wrapping in db().transaction makes the UPDATE + cleanup + DELETE
  // either all succeed or all roll back.
  await db().transaction(async (tx) => {
    await tx
      .update(schema.appeals)
      .set({
        // Prefer the older photo (the user's first capture) but fall
        // back to the duplicate's photo when the older row never got
        // one.
        pcnImageUrl: older.pcnImageUrl ?? fresh.pcnImageUrl ?? null,
        ticket: mergedTicket as AppealView["ticket"],
        councilSlug: resolvedCouncilSlug,
        // Bump updatedAt so the reconciliation poll picks the merged
        // row up on its next tick and the client's local list state
        // refreshes.
        updatedAt: new Date(),
      })
      .where(eq(schema.appeals.id, older.id));

    // Sweep child rows that don't cascade so the appeal DELETE below
    // never trips an FK and the worker never sees an orphaned job.
    await tx.delete(schema.jobs).where(eq(schema.jobs.appealId, appealId));
    await tx
      .delete(schema.payments)
      .where(eq(schema.payments.appealId, appealId));
    await tx
      .delete(schema.notificationDispatches)
      .where(eq(schema.notificationDispatches.appealId, appealId));

    await tx.delete(schema.appeals).where(eq(schema.appeals.id, appealId));
  });

  return { mergedInto: older.id };
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
  // v0.3.7 — read existing FIRST so we can both backfill the ticket
  // AND preserve `status: "overridden"`. The override is a customer-
  // initiated gesture (tapping "I disagree — let me appeal anyway" on
  // the appeal_not_possible card); the agent's final end-of-job
  // persist must not undo it. Without this guard, if the user
  // overrides the verdict while the lookup job is still capturing
  // warden photos, the trailing wholesale-replace at worker.ts:265
  // clobbers status="overridden" back to "invalid", refreshes the
  // card back to appeal_not_possible, and the draft-kickoff effect
  // refuses to fire (verdict=paid/closed/not_found AND status!==
  // overridden). Customer is stuck on the verdict-refusal screen
  // with no signal.
  const existing = await getAppealById(input.appealId);
  // Normalise portal-scraped date strings to ISO BEFORE anything reads
  // them downstream — the recipe / Claude MCP path emits dd/mm/yyyy
  // because that's how Imperial / Civica portals render dates, and JS
  // Date can't parse them. We collapse to ISO at this single write
  // boundary so every reader sees a parseable timestamp.
  const normalisedIncoming = normalisePortalSnapshotDates(input.snapshot);
  const snapshot: PortalLookupSnapshot =
    existing?.portalLookup?.status === "overridden"
      ? { ...normalisedIncoming, status: "overridden" }
      : normalisedIncoming;
  const updates: Partial<typeof schema.appeals.$inferInsert> = {
    portalLookup: snapshot,
    updatedAt: new Date(),
  };
  // v0.3.6 — BACKFILL only, never overwrite. Before this change the
  // merge let council metadata win over the user/OCR'd ticket value,
  // which silently rewrote what the user typed (e.g. user types £160
  // at the Agree gate, council says £80, ticket.amountPence flips to
  // 8000). That made the council-vs-user discrepancy detector
  // (`getTicketDiscrepancies`) a no-op because by the time it ran
  // ticket and metadata were the same value.
  //
  // New semantics: the council's record stays in
  // `portalLookup.metadata` (authoritative for display via
  // `resolveDisplayTicket`); the ticket jsonb keeps what the user
  // actually captured. The two are compared field-by-field to surface
  // mismatches in the CouncilCheckChip. We still backfill metadata
  // into ticket fields the user left empty (OCR couldn't read them /
  // user didn't type them), but a non-empty user value is never
  // overwritten.
  if (normalisedIncoming.metadata) {
    // existing was already read above for the overridden-status preservation.
    // Backfill from the normalised metadata so dates land on `ticket` as
    // ISO too — keeps display formatters honest.
    const merged: Record<string, unknown> = { ...(existing?.ticket ?? {}) };
    for (const [k, v] of Object.entries(normalisedIncoming.metadata)) {
      if (v === undefined || v === null) continue;
      const current = merged[k];
      const isEmpty =
        current === undefined ||
        current === null ||
        current === "" ||
        (typeof current === "number" && current === 0);
      if (isEmpty) merged[k] = v;
    }
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
