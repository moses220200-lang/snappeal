/**
 * Tickets — cross-user PCN identity + portal-snapshot cache.
 *
 * The `tickets` table (migration 0017) is the canonical record of one
 * physical PCN. Many `appeals` rows from many users can share a
 * `ticket_id` and read the same cached portal snapshot, so the
 * council-portal lookup (~$0.30 / ~60s of Claude + Playwright) runs
 * ONCE per ticket per TTL window instead of once per (appeal × user).
 *
 * This module owns:
 *   - `normalisePcnRef`, `normaliseVehicleReg` — canonical identity
 *     keys. The DB enforces the same via a functional unique index on
 *     `(council_slug, upper(regexp_replace(pcn_ref, '\s+', '', 'g')))`.
 *   - `upsertTicketFromAppeal` — first-touch promotion of an appeal's
 *     OCR'd ticket data into a `tickets` row. Idempotent via
 *     `ON CONFLICT DO UPDATE … RETURNING id`. MUST be called within a
 *     transaction that also writes `appeals.ticket_id` (Plan agent
 *     recommendation #2: never split the upsert and the FK write).
 *   - `getCachedSnapshot` — verdict-aware TTL gate. Returns a
 *     `TicketPortalSnapshot` only when it's still fresh; returns null
 *     when stale, when `verdict === 'unknown'`, or when the snapshot
 *     is missing entirely. NEVER returns per-user lifecycle fields
 *     (status / jobId) because the cached shape doesn't contain them.
 *   - `cacheSnapshot` — sanitised UPSERT from a per-appeal
 *     `PortalLookupSnapshot` into the shared `tickets.portal_snapshot`.
 *     Strips status + jobId at the type boundary (TypeScript enforces
 *     no leak — Plan recommendation #7).
 *   - `propagateSnapshotToSiblings` — when a `pcn_lookup` job lands,
 *     copy the verdict into every OTHER appeal that shares the
 *     ticket_id and is currently `status === 'pending'`. Fixes Plan
 *     agent's concern #5: in-flight dedup'd sibling appeals don't get
 *     stranded on the pending snapshot pointing at the lead appeal's
 *     jobId.
 *   - `logAudit` — append a row to `ticket_normalisation_audit`.
 *
 * Read-only consumers (anything that just wants the cached snapshot)
 * should go through `getCachedSnapshot`. Write paths
 * (persistPortalLookup, the lookup worker) call `cacheSnapshot` and
 * `propagateSnapshotToSiblings`.
 */
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { customAlphabet } from "../id";
import { getDb, schema } from "./db/client";
import type {
  PortalLookupSnapshot,
  PortalLookupVerdict,
  TicketPortalSnapshot,
} from "./db/schema";

/** `t_` + 16 chars of unambiguous alphabet. Mirrors the appeal id shape. */
const newTicketId = customAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyz",
  16,
  "t_",
);
const newAuditId = customAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyz",
  16,
  "tna_",
);

/** Strip whitespace and uppercase. The single rule the DB's functional
 *  unique index relies on (`upper(regexp_replace(pcn_ref, '\s+', ''))`).
 *  Keep these two in lockstep — divergence here = silently inserted
 *  duplicates. */
export function normalisePcnRef(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function normaliseVehicleReg(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** Verdict-aware cache TTL in milliseconds.
 *
 *  Returns 0 for verdicts/states we never trust to be cached:
 *    - unknown / undefined  — lookup ran but couldn't determine; refetch
 *  Special-cased upstream (NOT here):
 *    - status === 'error'      — refetch
 *    - status === 'skipped'    — never cache
 *    - status === 'pending'    — never cache (still in flight)
 *    - status === 'overridden' — never write to cache; per-user state */
function ttlMsForVerdict(verdict: PortalLookupVerdict | undefined): number {
  switch (verdict) {
    case "paid":
    case "closed":
      // Terminal. Council won't un-pay or un-close a cancelled case.
      return 30 * 24 * 60 * 60 * 1000;
    case "expired":
      // Semi-terminal — could re-open via tribunal escalation.
      return 6 * 60 * 60 * 1000;
    case "open":
      // Live state. Discount window + charge cert move daily.
      return 60 * 60 * 1000;
    case "not_found":
      // Transient portal drop. Could become 'open' once council posts.
      return 30 * 60 * 1000;
    case "unknown":
    default:
      return 0;
  }
}

/** Identity tuple used everywhere we look a ticket up. Returns null
 *  when any required field is missing — caller falls back to legacy
 *  paths. Both pcnRef and vehicleReg are normalised. */
export function appealTicketIdentity(appeal: {
  ticket?: { pcnRef?: unknown; vehicleReg?: unknown } | null;
  councilSlug?: string | null;
}): { councilSlug: string; pcnRef: string; vehicleReg: string } | null {
  const councilSlug = appeal.councilSlug ?? null;
  if (!councilSlug) return null;
  const t = appeal.ticket ?? null;
  const pcnRefRaw = typeof t?.pcnRef === "string" ? t.pcnRef : "";
  const vehicleRegRaw = typeof t?.vehicleReg === "string" ? t.vehicleReg : "";
  const pcnRef = normalisePcnRef(pcnRefRaw);
  const vehicleReg = normaliseVehicleReg(vehicleRegRaw);
  if (!pcnRef || !vehicleReg) return null;
  return { councilSlug, pcnRef, vehicleReg };
}

/** The handle every helper here takes for writes. Drizzle's
 *  `db.transaction(async tx => …)` passes a `tx` with the same surface
 *  as the top-level db, so callers can pass either. Typing it as the
 *  db's own type keeps Drizzle's deeper transaction generics out of
 *  this file. */
type DbOrTx = NonNullable<ReturnType<typeof getDb>>;

/** Transactional UPSERT into `tickets`. Pass the db client directly
 *  for one-shot writes, or pass a `tx` from `db.transaction(async tx
 *  => …)` so this and the appeal UPDATE that sets `ticket_id` land
 *  atomically.
 *
 *  Returns the ticket id (existing or freshly-created). Repeatable for
 *  the same identity — `ON CONFLICT DO UPDATE SET updated_at = now()
 *  RETURNING id` resolves any concurrent first-touch race to the same
 *  row.
 *
 *  Council-record fields (issuer, contravention_*, dates, amount) are
 *  populated on first INSERT from the appeal's OCR'd ticket. On
 *  CONFLICT they're left alone — the portal lookup is the authoritative
 *  source going forward and will UPDATE via `cacheSnapshot`. */
export async function upsertTicketFromAppeal(
  tx: DbOrTx,
  identity: { councilSlug: string; pcnRef: string; vehicleReg: string },
  fields: {
    issuer?: string | null;
    contraventionCode?: string | null;
    contraventionDescription?: string | null;
    issuedAt?: Date | null;
    location?: string | null;
    amountPence?: number | null;
  } = {},
): Promise<string> {
  const newId = newTicketId();
  const rows = await tx
    .insert(schema.tickets)
    .values({
      id: newId,
      councilSlug: identity.councilSlug,
      pcnRef: identity.pcnRef,
      vehicleReg: identity.vehicleReg,
      issuer: fields.issuer ?? null,
      contraventionCode: fields.contraventionCode ?? null,
      contraventionDescription: fields.contraventionDescription ?? null,
      issuedAt: fields.issuedAt ?? null,
      location: fields.location ?? null,
      amountPence: fields.amountPence ?? null,
    })
    .onConflictDoUpdate({
      // Plain UNIQUE on (council_slug, pcn_ref) would conflict here too,
      // but our index is FUNCTIONAL (`upper(regexp_replace(...))`) so
      // Drizzle can't target it by column list. The application
      // pre-normalises (normalisePcnRef) before reaching this call, so
      // raw column equality is sufficient for the conflict target.
      target: [schema.tickets.councilSlug, schema.tickets.pcnRef],
      set: { updatedAt: new Date() },
    })
    .returning({ id: schema.tickets.id });
  return rows[0]!.id;
}

/** Read the cached snapshot for an identity. Returns null when:
 *    - no ticket row exists
 *    - no snapshot has been captured yet (`portal_snapshot IS NULL`)
 *    - snapshot is stale per verdict-aware TTL
 *    - verdict is 'unknown' (didn't determine anything; refetch)
 *
 *  Callers (enqueueLookupIfAutomated) treat null as "go ahead and run
 *  the real lookup".
 *
 *  Important: never returns per-user lifecycle fields. The returned
 *  `TicketPortalSnapshot` is the strict-subset shape — the caller
 *  constructs a fresh `PortalLookupSnapshot` for THIS appeal with
 *  `jobId: null` and `status` derived from `verdict`. */
export async function getCachedSnapshot(
  councilSlug: string,
  pcnRef: string,
): Promise<{
  ticketId: string;
  snapshot: TicketPortalSnapshot;
  ageMs: number;
} | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: schema.tickets.id,
      snapshot: schema.tickets.portalSnapshot,
      at: schema.tickets.portalSnapshotAt,
    })
    .from(schema.tickets)
    .where(
      and(
        eq(schema.tickets.councilSlug, councilSlug),
        eq(schema.tickets.pcnRef, normalisePcnRef(pcnRef)),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!row.snapshot || !row.at) return null;
  const verdict = (row.snapshot as TicketPortalSnapshot).verdict;
  const ttl = ttlMsForVerdict(verdict);
  if (ttl <= 0) return null;
  const ageMs = Date.now() - row.at.getTime();
  if (ageMs > ttl) return null;
  return {
    ticketId: row.id,
    snapshot: row.snapshot as TicketPortalSnapshot,
    ageMs,
  };
}

/**
 * 2026-05-27 — Phase 2 of the ticket-normalisation rollout.
 *
 * Look up the canonical `tickets` row for a given (council, PCN ref)
 * pair. Returns the OCR-derived metadata fields ALWAYS (they don't
 * go stale — they describe the physical PCN) plus the cached portal
 * snapshot with a freshness flag (the snapshot DOES go stale per
 * the verdict-aware TTL ladder).
 *
 * This is the "cross-user canonical reuse" entry point: when User B
 * uploads a photo of a PCN that User A has already canonicalised,
 * /api/extract uses this helper to pre-populate User B's appeal row
 * from the canonical record — issuer / vehicle reg / contravention
 * code / issued date / location / amount — without re-running OCR
 * Pass 2 against the photo (saves ~$0.05 + 8–12s per duplicate
 * upload). The portal snapshot freshness flag drives whether the
 * subsequent `enqueueLookupIfAutomated` call short-circuits via
 * `getCachedSnapshot` too (it already does, but this surfaces the
 * answer to callers that want to know upfront).
 *
 * Differences vs `getCachedSnapshot`:
 *   - Returns even when the portal snapshot is null (the canonical
 *     row exists; OCR fields still useful).
 *   - Returns even when the snapshot is stale (caller may want to
 *     pre-populate metadata while still triggering a fresh lookup).
 *   - Carries the OCR-derived metadata fields the snapshot doesn't.
 *
 * Returns null when no canonical row exists for that (council,
 * pcnRef) pair — caller falls back to running the full OCR + lookup
 * pipeline.
 */
export interface CanonicalTicketView {
  ticketId: string;
  /** OCR-derived metadata, never stale. Any null field means OCR
   *  didn't capture it on the canonical row's first promotion. */
  issuer: string | null;
  vehicleReg: string;
  contraventionCode: string | null;
  contraventionDescription: string | null;
  /** ISO-8601 string for cross-process safety; serialise from the
   *  row's `timestamp with time zone` column. */
  issuedAt: string | null;
  location: string | null;
  amountPence: number | null;
  /** Cached portal lookup result — null when no successful lookup
   *  has landed yet for this ticket. */
  snapshot: TicketPortalSnapshot | null;
  /** When the snapshot is set, true if it's still within its
   *  verdict-aware TTL window (paid/closed=30d, open=1h, etc).
   *  False when stale OR when snapshot is null. */
  snapshotFresh: boolean;
}

export async function findCanonicalTicket(
  councilSlug: string,
  pcnRef: string,
): Promise<CanonicalTicketView | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: schema.tickets.id,
      issuer: schema.tickets.issuer,
      vehicleReg: schema.tickets.vehicleReg,
      contraventionCode: schema.tickets.contraventionCode,
      contraventionDescription: schema.tickets.contraventionDescription,
      issuedAt: schema.tickets.issuedAt,
      location: schema.tickets.location,
      amountPence: schema.tickets.amountPence,
      portalSnapshot: schema.tickets.portalSnapshot,
      portalSnapshotAt: schema.tickets.portalSnapshotAt,
    })
    .from(schema.tickets)
    .where(
      and(
        eq(schema.tickets.councilSlug, councilSlug),
        eq(schema.tickets.pcnRef, normalisePcnRef(pcnRef)),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  // Freshness check mirrors getCachedSnapshot's TTL ladder so the two
  // helpers can never disagree about whether a snapshot is still
  // usable. snapshot null → snapshotFresh false (caller falls through
  // to running a real lookup).
  const snapshot = (row.portalSnapshot as TicketPortalSnapshot | null) ?? null;
  let snapshotFresh = false;
  if (snapshot && row.portalSnapshotAt) {
    const ttl = ttlMsForVerdict(snapshot.verdict);
    if (ttl > 0) {
      const ageMs = Date.now() - row.portalSnapshotAt.getTime();
      snapshotFresh = ageMs <= ttl;
    }
  }

  return {
    ticketId: row.id,
    issuer: row.issuer,
    vehicleReg: row.vehicleReg,
    contraventionCode: row.contraventionCode,
    contraventionDescription: row.contraventionDescription,
    issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
    location: row.location,
    amountPence: row.amountPence,
    snapshot,
    snapshotFresh,
  };
}

/** Strip per-user lifecycle from a `PortalLookupSnapshot` and UPSERT
 *  into `tickets.portal_snapshot` for the matching identity.
 *
 *  Refuses to write when the source has `status === 'overridden'` —
 *  that's a per-user gesture, not a council fact. Plan agent concern
 *  #1. Caller's responsibility to NOT call this for skipped /
 *  pending / error states either.
 *
 *  Updates `portal_snapshot_at`, `_source`, `_cost_usd` denormalised
 *  summaries. Full call audit lives on `ai_calls`. */
export async function cacheSnapshot(
  identity: { councilSlug: string; pcnRef: string },
  src: PortalLookupSnapshot,
  source: "deterministic" | "cli",
  costUsd: number | null,
): Promise<{ ticketId: string | null }> {
  const db = getDb();
  if (!db) return { ticketId: null };
  if (src.status === "overridden") return { ticketId: null };
  if (!src.verdict || src.verdict === "unknown") return { ticketId: null };

  const sanitised: TicketPortalSnapshot = {
    verdict: src.verdict,
    verdictReason: src.verdictReason,
    photoUrls: src.photoUrls ?? [],
    metadata: src.metadata,
    fetchedAt: src.fetchedAt,
    source,
  };

  // Find the ticket by identity (caller usually has the appeal's
  // ticket_id but we look up by identity to keep this callable from
  // anywhere — including a future tickets_refresh_open_verdicts job).
  // Pull the existing snapshot alongside so we can run drift detection
  // before the write clobbers it.
  const existing = await db
    .select({
      id: schema.tickets.id,
      snapshot: schema.tickets.portalSnapshot,
      snapshotAt: schema.tickets.portalSnapshotAt,
    })
    .from(schema.tickets)
    .where(
      and(
        eq(schema.tickets.councilSlug, identity.councilSlug),
        eq(schema.tickets.pcnRef, normalisePcnRef(identity.pcnRef)),
      ),
    )
    .limit(1);
  const row = existing[0];
  const ticketId = row?.id ?? null;
  if (!ticketId) {
    // No tickets row to update. This is a soft no-op rather than an
    // error: the appeal that triggered this lookup may not have been
    // promoted to a tickets row yet (e.g. lookup fired directly via
    // legacy code path). The per-appeal `appeals.portal_lookup`
    // jsonb still gets written by `persistPortalLookup`.
    return { ticketId: null };
  }

  // v0.3.12 — Step 2.5: drift detection. If the cache already held a
  // snapshot AND its verdict differs from the incoming one, log a
  // 'snapshot_drift' audit row with both values + the staleness.
  // Powers two things:
  //   - The post-prod-deploy verification window (real lookups landing
  //     against cached values catch TTL-too-long bugs before users see
  //     stale verdicts).
  //   - Operational visibility: if a council reverses a verdict the
  //     audit table tells you when + by how much.
  //
  // The cache-hit-mirror path in enqueueLookupIfAutomated writes the
  // SAME snapshot back, so verdict matches and no drift is logged —
  // that's the desired behaviour (no false positives from our own
  // mirror).
  const prev = row.snapshot as TicketPortalSnapshot | null;
  if (
    prev &&
    prev.verdict &&
    prev.verdict !== sanitised.verdict
  ) {
    const ageMs = row.snapshotAt ? Date.now() - row.snapshotAt.getTime() : null;
    logAudit("snapshot_drift", { ticketId }, {
      previousVerdict: prev.verdict,
      newVerdict: sanitised.verdict,
      previousFetchedAt: prev.fetchedAt,
      newFetchedAt: sanitised.fetchedAt,
      previousSource: prev.source,
      newSource: source,
      ageMs,
      previousAmountPence: prev.metadata?.amountPence ?? null,
      newAmountPence: sanitised.metadata?.amountPence ?? null,
    });
  }

  await db
    .update(schema.tickets)
    .set({
      portalSnapshot: sanitised,
      portalSnapshotAt: new Date(),
      portalSnapshotSource: source,
      portalSnapshotCostUsd: costUsd != null ? String(costUsd) : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.tickets.id, ticketId));

  return { ticketId };
}

/** When a `pcn_lookup` job lands, update `appeals.portal_lookup` for
 *  every OTHER appeal that shares this ticket_id and is still in
 *  `status === 'pending'`. Fixes Plan agent concern #5: in-flight
 *  dedup'd siblings (where appeal B's enqueue was answered with
 *  "in_flight, watching appeal A's job") otherwise stay stuck on the
 *  pending snapshot forever.
 *
 *  Builds a per-appeal `PortalLookupSnapshot` from the shared cache
 *  — fresh `jobId: null`, fresh `status` derived from verdict — and
 *  writes it to every sibling in one UPDATE.
 *
 *  Excludes `excludeAppealId` (the appeal whose job just completed —
 *  the worker's main `persistPortalLookup` path already handled it). */
export async function propagateSnapshotToSiblings(
  ticketId: string,
  excludeAppealId: string,
  cachedShape: TicketPortalSnapshot,
): Promise<{ siblingsUpdated: number }> {
  const db = getDb();
  if (!db) return { siblingsUpdated: 0 };

  const status: PortalLookupSnapshot["status"] =
    cachedShape.verdict === "open" ? "verified" : "invalid";

  const perAppealSnapshot: PortalLookupSnapshot = {
    jobId: null,
    status,
    verdict: cachedShape.verdict,
    verdictReason: cachedShape.verdictReason,
    photoUrls: cachedShape.photoUrls,
    metadata: cachedShape.metadata,
    fetchedAt: cachedShape.fetchedAt,
  };

  // Only update siblings stuck on pending. If a sibling has already
  // landed its own snapshot (verified / overridden / error), leave
  // it alone — that's per-user state we don't trample.
  const updated = await db
    .update(schema.appeals)
    .set({
      portalLookup: perAppealSnapshot,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.appeals.ticketId, ticketId),
        ne(schema.appeals.id, excludeAppealId),
        sql`${schema.appeals.portalLookup}->>'status' = 'pending'`,
      ),
    )
    .returning({ id: schema.appeals.id });

  return { siblingsUpdated: updated.length };
}

/** Append-only audit log helper. Fire-and-forget — caller doesn't
 *  await; failures swallow because the audit table failing must
 *  never break the user-facing cache hit. */
export function logAudit(
  event:
    | "created"
    | "promoted"
    | "cache_hit"
    | "snapshot_drift"
    | "created_collision_loser"
    | "merge_ticket_id_conflict",
  refs: { ticketId?: string | null; appealId?: string | null },
  details?: Record<string, unknown>,
): void {
  const db = getDb();
  if (!db) return;
  void db
    .insert(schema.ticketNormalisationAudit)
    .values({
      id: newAuditId(),
      event,
      ticketId: refs.ticketId ?? null,
      appealId: refs.appealId ?? null,
      details: details ?? null,
    })
    .catch(() => {
      /* never let audit failure break a user-facing path */
    });
}

/** Test-only helper: read recent audit rows for a ticket/appeal.
 *  Used by scripts/test-ticket-cache.ts to assert cache_hit etc.
 *  fired as expected. */
export async function readRecentAudit(
  filter: { appealId?: string; ticketId?: string; event?: string },
  limit = 20,
): Promise<
  Array<{
    event: string;
    ticketId: string | null;
    appealId: string | null;
    details: unknown;
    createdAt: Date;
  }>
> {
  const db = getDb();
  if (!db) return [];
  const wheres = [];
  if (filter.appealId) wheres.push(eq(schema.ticketNormalisationAudit.appealId, filter.appealId));
  if (filter.ticketId) wheres.push(eq(schema.ticketNormalisationAudit.ticketId, filter.ticketId));
  if (filter.event) wheres.push(eq(schema.ticketNormalisationAudit.event, filter.event));
  const rows = await db
    .select()
    .from(schema.ticketNormalisationAudit)
    .where(wheres.length ? and(...wheres) : undefined)
    .orderBy(schema.ticketNormalisationAudit.createdAt)
    .limit(limit);
  return rows.map((r) => ({
    event: r.event,
    ticketId: r.ticketId,
    appealId: r.appealId,
    details: r.details,
    createdAt: r.createdAt,
  }));
}

// Re-export the unused-import warning suppressor for the
// `isNull` import we keep for completeness in future helpers.
void isNull;
