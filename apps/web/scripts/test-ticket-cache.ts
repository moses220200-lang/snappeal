/**
 * Regression test for the v0.3.12 cross-user ticket cache.
 *
 * Asserts the full Step 2 + Step 3 round trip:
 *   - First lookup persists to BOTH appeals.portal_lookup AND
 *     tickets.portal_snapshot (dual-write).
 *   - Second appeal for the same (council, pcn) under a DIFFERENT
 *     sessionId hits the cache — no pcn_lookup job enqueued, snapshot
 *     gets copied with jobId=null and status derived from the verdict.
 *   - status='overridden' is NEVER mirrored to the shared cache.
 *   - Stale snapshot (verdict='open' older than TTL) refetches.
 *   - propagateSnapshotToSiblings updates siblings stuck on pending.
 *
 * Bypasses the real lookup worker — uses persistPortalLookup directly
 * to seed verdicts, then drives enqueueLookupIfAutomated to prove the
 * cache READ branch fires correctly.
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/test-ticket-cache.ts
 *
 * Requires:
 *   - dev server running on PARKINGRABBIT_BASE (default :3001) — for
 *     POST /api/appeals (the only operation we route through HTTP).
 *   - lambeth council already seeded (db:seed).
 */
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb, schema } from "../lib/server/db/client";
import {
  enqueueLookupIfAutomated,
} from "../lib/server/submission/enqueueLookup";
import {
  persistPortalLookup,
  patchAppealDraft,
} from "../lib/server/appeals";
import {
  getCachedSnapshot,
  propagateSnapshotToSiblings,
} from "../lib/server/tickets";

const BASE = process.env.PARKINGRABBIT_BASE ?? "http://127.0.0.1:3001";

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass += 1;
    console.info(`✓ ${msg}`);
  } else {
    fail += 1;
    console.error(`✗ ${msg}`);
  }
}

async function createAppeal(sessionId: string): Promise<string> {
  const res = await fetch(`${BASE}/api/appeals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) throw new Error(`create failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { appeal: { id: string } }).appeal.id;
}

const SAMPLE_TICKET = {
  issuer: "London Borough of Lambeth",
  councilSlug: "lambeth",
  pcnRef: "LX99887766",
  vehicleReg: "TEST1A",
  contraventionCode: "01",
  contraventionDescription: "Parked in a restricted street",
  issuedAt: "2026-05-20T09:00:00.000Z",
  location: "Brixton Hill",
  amountPence: 13000,
};

async function main() {
  const db = getDb();
  if (!db) {
    console.error("no db");
    process.exit(1);
  }
  console.info(`▶ base=${BASE}\n`);

  // ── 1. First user A — primes the cache ─────────────────────────────
  const sessionA = `cache_a_${Date.now()}`;
  const appealAId = await createAppeal(sessionA);
  await patchAppealDraft(appealAId, { ticket: SAMPLE_TICKET });

  // Simulate the worker landing a real verdict.
  await persistPortalLookup({
    appealId: appealAId,
    snapshot: {
      jobId: "job_test_seed_a",
      status: "verified",
      verdict: "open",
      verdictReason: "Open and challengeable",
      photoUrls: ["https://example.com/warden-a-1.png"],
      metadata: {
        dueDateAt: "2026-06-17T23:59:59.000Z",
        amountPence: 13000,
      },
      fetchedAt: new Date().toISOString(),
    },
  });

  // Step 3 (dual-write): tickets.portal_snapshot should now exist.
  const cachedA = await getCachedSnapshot("lambeth", "LX99887766");
  assert(!!cachedA, "Step 3: persistPortalLookup wrote to tickets.portal_snapshot");
  assert(
    cachedA?.snapshot.verdict === "open",
    `Step 3: cache verdict='open' (got "${cachedA?.snapshot.verdict}")`,
  );
  assert(
    cachedA?.snapshot.photoUrls.includes("https://example.com/warden-a-1.png") === true,
    "Step 3: warden photos round-tripped through cache",
  );
  // Sanitisation — the cached shape MUST NOT contain status or jobId.
  assert(
    !("status" in (cachedA?.snapshot ?? {})),
    "Step 3: sanitisation — cached snapshot has no `status` field",
  );
  assert(
    !("jobId" in (cachedA?.snapshot ?? {})),
    "Step 3: sanitisation — cached snapshot has no `jobId` field",
  );

  // ── 2. Second user B — must hit cache, no new job ──────────────────
  const sessionB = `cache_b_${Date.now()}`;
  const appealBId = await createAppeal(sessionB);
  await patchAppealDraft(appealBId, { ticket: SAMPLE_TICKET });

  const beforeJobs = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.kind, "pcn_lookup"),
        eq(schema.jobs.appealId, appealBId),
      ),
    );
  assert(beforeJobs.length === 0, "Step 2: appeal B has no pcn_lookup job before enqueue");

  const result = await enqueueLookupIfAutomated(appealBId);
  assert(
    result.outcome === "cached",
    `Step 2: enqueueLookup outcome='cached' for B (got "${result.outcome}")`,
  );

  const afterJobs = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.kind, "pcn_lookup"),
        eq(schema.jobs.appealId, appealBId),
      ),
    );
  assert(
    afterJobs.length === 0,
    "Step 2: cache hit did NOT enqueue a job for B (no cost burnt)",
  );

  // Read B's freshly-stamped portal_lookup.
  const appealBRows = await db
    .select({ portalLookup: schema.appeals.portalLookup })
    .from(schema.appeals)
    .where(eq(schema.appeals.id, appealBId));
  const bSnapshot = appealBRows[0]?.portalLookup;
  assert(
    bSnapshot?.status === "verified",
    `Step 2: B got status='verified' from cache (got "${bSnapshot?.status}")`,
  );
  assert(
    bSnapshot?.jobId === null,
    `Step 2: B's jobId is null (no leak from A) (got ${JSON.stringify(bSnapshot?.jobId)})`,
  );
  assert(
    bSnapshot?.verdict === "open",
    `Step 2: B inherits verdict='open' from cache (got "${bSnapshot?.verdict}")`,
  );

  // ── 3. status='overridden' must NOT leak to cache ──────────────────
  // Seed a third appeal C with the same ticket; persist a snapshot
  // with status='overridden' on it. Verify the cache still reflects A's
  // original verdict — overridden is per-user and must never write.
  const sessionC = `cache_c_${Date.now()}`;
  const appealCId = await createAppeal(sessionC);
  await patchAppealDraft(appealCId, { ticket: SAMPLE_TICKET });
  await persistPortalLookup({
    appealId: appealCId,
    snapshot: {
      jobId: null,
      status: "overridden",
      verdict: "open",
      verdictReason: "User overrode verdict",
      photoUrls: [],
      fetchedAt: new Date().toISOString(),
    },
  });
  // Cache must not have been overwritten with the overridden snapshot —
  // verdict 'open' would be the same, so we check the verdictReason
  // (which would differ if it had leaked).
  const cachedAfterOverride = await getCachedSnapshot("lambeth", "LX99887766");
  assert(
    cachedAfterOverride?.snapshot.verdictReason === "Open and challengeable",
    `Step 3: cache UNCHANGED after appeal C set status='overridden' (got "${cachedAfterOverride?.snapshot.verdictReason}")`,
  );

  // ── 4. Sibling propagation ─────────────────────────────────────────
  // Create appeal D, leave its portal_lookup pending (simulate the
  // cross-ticket dedup having stamped that). Fire
  // propagateSnapshotToSiblings — D should be updated.
  const sessionD = `cache_d_${Date.now()}`;
  const appealDId = await createAppeal(sessionD);
  await patchAppealDraft(appealDId, { ticket: SAMPLE_TICKET });

  // Manually stamp D's portal_lookup as pending pointing at a fake job
  // (mimics what cross-ticket-in-flight dedup would do).
  await db
    .update(schema.appeals)
    .set({
      portalLookup: {
        jobId: "job_test_sibling_pending",
        status: "pending",
        photoUrls: [],
        fetchedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(eq(schema.appeals.id, appealDId));

  // D must also have the ticket_id set so propagate finds it.
  // patchAppealDraft above didn't promote yet (promotion lives in
  // Step 4 / enqueueLookup); set it manually here for the test.
  const ticketRow = await db
    .select({ id: schema.tickets.id })
    .from(schema.tickets)
    .where(
      and(
        eq(schema.tickets.councilSlug, "lambeth"),
        eq(schema.tickets.pcnRef, "LX99887766"),
      ),
    )
    .limit(1);
  const ticketId = ticketRow[0]!.id;
  await db
    .update(schema.appeals)
    .set({ ticketId })
    .where(eq(schema.appeals.id, appealDId));

  const propagateResult = await propagateSnapshotToSiblings(
    ticketId,
    "some_other_appeal_id", // exclude id (not D, so D gets updated)
    cachedA!.snapshot,
  );
  assert(
    propagateResult.siblingsUpdated >= 1,
    `Step 3: propagateSnapshotToSiblings updated >=1 sibling (got ${propagateResult.siblingsUpdated})`,
  );

  const dAfter = await db
    .select({ portalLookup: schema.appeals.portalLookup })
    .from(schema.appeals)
    .where(eq(schema.appeals.id, appealDId));
  const dSnapshot = dAfter[0]?.portalLookup;
  assert(
    dSnapshot?.status === "verified",
    `Step 3: D's pending snapshot was overwritten to 'verified' (got "${dSnapshot?.status}")`,
  );
  assert(
    dSnapshot?.jobId === null,
    `Step 3: D's jobId cleared after propagation (got ${JSON.stringify(dSnapshot?.jobId)})`,
  );

  // ── 5. TTL boundary — stale 'open' snapshot must miss the cache ───
  // Force the tickets row's portal_snapshot_at backwards past the
  // 1-hour TTL for 'open' and confirm getCachedSnapshot returns null.
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await db
    .update(schema.tickets)
    .set({ portalSnapshotAt: twoHoursAgo })
    .where(eq(schema.tickets.id, ticketId));
  const cachedStale = await getCachedSnapshot("lambeth", "LX99887766");
  assert(
    cachedStale === null,
    `Step 3: stale 'open' snapshot (2h old, TTL 1h) returns null from cache (got ${cachedStale ? "non-null" : "null"})`,
  );

  // ── 6. Audit table populated ──────────────────────────────────────
  const auditRows = await db
    .select({ event: schema.ticketNormalisationAudit.event })
    .from(schema.ticketNormalisationAudit)
    .where(
      and(
        gt(schema.ticketNormalisationAudit.createdAt, new Date(Date.now() - 5 * 60_000)),
        sql`${schema.ticketNormalisationAudit.event} IN ('promoted', 'cache_hit')`,
      ),
    );
  const events = auditRows.map((r) => r.event);
  assert(
    events.includes("promoted"),
    `audit: at least one 'promoted' event logged (events: ${JSON.stringify(events)})`,
  );
  assert(
    events.includes("cache_hit"),
    `audit: at least one 'cache_hit' event logged (events: ${JSON.stringify(events)})`,
  );

  console.info(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\n✗ test crashed:", err);
  process.exit(1);
});
