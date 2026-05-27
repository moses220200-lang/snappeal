/**
 * State-machine walker — proves every CardKind in deriveCardState is
 * reachable via the documented API + server helpers, with no real AI
 * calls. Seeds intermediate state directly via setProcessingStep,
 * persistPortalLookup, etc.
 *
 * If any assertion fails, the trap-prone transition is in the test
 * output verbatim. Run with:
 *
 *   npx tsx --env-file=.env.local scripts/test-state-machine-walk.ts
 *
 * Exit code 0 = every documented transition still produces the
 * expected CardKind.
 *
 * Covers (in order):
 *   1. processing (fresh)  (brand-new appeal — processing branch wins
 *                           because it checks !pcnRef||!vehicleReg, not
 *                           just ocrRunning. The `scanning` fallback is
 *                           effectively dead code in the current state
 *                           machine; the only way to reach it requires
 *                           a statusSnapshot with no ticket data, which
 *                           our connectors never produce.)
 *   2. processing (ocr)    (OCR explicitly running, no ticket data yet)
 *   3. extraction_failed   (OCR failed, no ticket data)
 *   4. image_issue         (OCR done but <=1 critical field)
 *   5. pending_review      (OCR done with full ticket, step!=confirmed)
 *   6. needs_decision      (recommendation flavor, OCR snapshot)
 *   7. validating          (portal pending)
 *   8. council_lookup_failed (portal error)
 *   9. appeal_not_possible (preferredMethod=portal, verdict=paid)
 *  10. gathering_evidence  (preferredMethod=portal, no letter, no evidence)
 *  11. drafting            (preferredMethod=portal, no letter, evidence done)
 *  12. letter_ready        (letterBody set, status=draft)
 *  13. submitting          (status=submitting)
 *  14. submitted           (status=submitted)
 *  15. terminal (paid)     (stage=paid)
 *  16. terminal (cancelled)(status=cancelled)
 *  17. terminal (rejected) (status=rejected)
 *  18. needs_decision (escalated) (stage=charge_certificate_issued)
 */
import { eq } from "drizzle-orm";
import { deriveCardState, EVIDENCE_DONE_STEP, TICKET_CONFIRMED_STEP } from "../lib/deriveCardState";
import { setProcessingStep, type AppealRecord } from "../lib/server/appeals";
import { getDb, schema } from "../lib/server/db/client";
import type { TicketStatusSnapshot } from "../lib/server/connectors/types";

const BASE = process.env.PARKINGRABBIT_BASE ?? "http://127.0.0.1:3001";
const SESSION = `walker_${Date.now()}`;

function headers() {
  return {
    "content-type": "application/json",
    "x-parkingrabbit-session": SESSION,
  };
}

let pass = 0;
let fail = 0;
function assertKind(label: string, got: string, expected: string) {
  if (got === expected) {
    console.info(`✓ ${label.padEnd(28)} kind="${expected}"`);
    pass += 1;
  } else {
    console.error(`✗ ${label.padEnd(28)} expected "${expected}", got "${got}"`);
    fail += 1;
  }
}

async function createAppeal(): Promise<string> {
  const res = await fetch(`${BASE}/api/appeals`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ sessionId: SESSION }),
  });
  if (!res.ok) throw new Error(`create failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { appeal: { id: string } }).appeal.id;
}

async function get(id: string): Promise<AppealRecord> {
  const res = await fetch(`${BASE}/api/appeals/${encodeURIComponent(id)}`, {
    headers: { "x-parkingrabbit-session": SESSION },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GET ${id} failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { appeal: AppealRecord }).appeal;
}

async function patch(id: string, body: Record<string, unknown>): Promise<AppealRecord> {
  const res = await fetch(`${BASE}/api/appeals/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${id} failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { appeal: AppealRecord }).appeal;
}

/** Direct DB writes — for fields the public PATCH endpoint deliberately
 *  doesn't expose (portal lookup snapshot, appeal.status, etc.). */
async function dbUpdate(id: string, patch: Partial<typeof schema.appeals.$inferInsert>) {
  await getDb()!
    .update(schema.appeals)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.appeals.id, id));
}

const FULL_TICKET = {
  issuer: "London Borough of Lambeth",
  councilSlug: "lambeth",
  pcnRef: "LJ39952021",
  vehicleReg: "AB12CDE",
  contraventionCode: "01",
  contraventionDescription: "Parked in a restricted street during prescribed hours",
  issuedAt: "2026-05-20T09:00:00.000Z",
  location: "Brixton Hill",
  amountPence: 13000,
};

const OCR_SNAPSHOT: TicketStatusSnapshot = {
  stage: "appeal_open",
  status: "open",
  canAppeal: true,
  canPay: true,
  paidAt: null,
  paymentUrl: null,
  rawVerdict: "ocr:default",
  fetchedAt: new Date().toISOString(),
  currentDuePence: 13000,
  discountedDuePence: 6500,
  discountUntil: "2026-06-03T23:59:59.000Z",
  payByDate: "2026-06-17T23:59:59.000Z",
  daysLeftToAppeal: 28,
};

async function main() {
  console.info(`▶ session=${SESSION} base=${BASE}\n`);

  // ---------- 1. processing (fresh appeal, no OCR running yet) ----------
  // The processing branch fires for any pre-lookup appeal that's
  // missing pcnRef OR vehicleReg, not just when ocr.status='running'.
  // Caption renders as "Reading your PCN…" — fine UX, just earlier
  // than the dead `scanning` fallback would suggest.
  const id = await createAppeal();
  let a = await get(id);
  assertKind("1. processing (fresh)", deriveCardState(a, null, null).kind, "processing");

  // ---------- 2. processing (OCR running) ----------
  await setProcessingStep(id, "ocr", "running");
  a = await get(id);
  assertKind("2. processing (ocr)", deriveCardState(a, null, null).kind, "processing");

  // ---------- 3. extraction_failed ----------
  await setProcessingStep(id, "ocr", "failed", "Simulated OCR fail");
  a = await get(id);
  assertKind("3. extraction_failed", deriveCardState(a, null, null).kind, "extraction_failed");

  // ---------- 4. image_issue (OCR done, only one critical field) ----------
  await setProcessingStep(id, "ocr", "done");
  await patch(id, { ticket: { issuer: "Some Council" } });
  a = await get(id);
  assertKind("4. image_issue", deriveCardState(a, null, null).kind, "image_issue");

  // ---------- 4b. image_unclear (OCR done, 2+ critical fields BUT no pcnRef) ----------
  // v0.3.11 regression guard. The Lambeth invoice photo in real life
  // produced this exact state (issuer + vehicleReg + amount visible,
  // pcnRef missed) and the previous code stranded the user on
  // "Reading PCN…" forever. The fix routes through image_unclear so
  // FailureActions renders the Retake / Manual buttons.
  await patch(id, { ticket: { issuer: "Lambeth Council", vehicleReg: "PN65LBU", amountPence: 13000 } });
  a = await get(id);
  assertKind("4b. image_unclear", deriveCardState(a, null, null).kind, "image_unclear");

  // ---------- 5. pending_review (full ticket, step != confirmed) ----------
  await patch(id, { ticket: FULL_TICKET });
  a = await get(id);
  assertKind("5. pending_review", deriveCardState(a, null, null).kind, "pending_review");

  // ---------- 6. needs_decision (recommendation, post-confirm + OCR snapshot) ----------
  await patch(id, { step: TICKET_CONFIRMED_STEP });
  a = await get(id);
  assertKind(
    "6. needs_decision (rec)",
    deriveCardState(a, OCR_SNAPSHOT, null).kind,
    "needs_decision",
  );

  // ---------- 7. validating (portal pending) ----------
  await dbUpdate(id, {
    portalLookup: {
      status: "pending",
      fetchedAt: new Date().toISOString(),
      verdict: "unknown",
      verdictReason: "fired but not yet returned",
      metadata: {},
      photos: [],
      sourceUrl: "https://pcnevidence.lambeth.gov.uk/pcnonline/challenge.php",
    } as unknown as typeof schema.appeals.portalLookup,
  });
  a = await get(id);
  assertKind("7. validating", deriveCardState(a, null, null).kind, "validating");

  // ---------- 8. council_lookup_failed (portal error) ----------
  await dbUpdate(id, {
    portalLookup: {
      status: "error",
      fetchedAt: new Date().toISOString(),
      verdict: "unknown",
      verdictReason: "Portal returned 500",
      metadata: {},
      photos: [],
      sourceUrl: "https://pcnevidence.lambeth.gov.uk/pcnonline/challenge.php",
    } as unknown as typeof schema.appeals.portalLookup,
  });
  a = await get(id);
  assertKind("8. council_lookup_failed", deriveCardState(a, null, null).kind, "council_lookup_failed");

  // ---------- 9. appeal_not_possible (preferredMethod=portal, verdict=paid) ----------
  await patch(id, { preferredMethod: "portal" });
  await dbUpdate(id, {
    portalLookup: {
      status: "verified",
      fetchedAt: new Date().toISOString(),
      verdict: "paid",
      verdictReason: "Already paid in full",
      metadata: { paidAt: "2026-05-25T12:00:00.000Z" },
      photos: [],
      sourceUrl: "https://pcnevidence.lambeth.gov.uk/pcnonline/challenge.php",
    } as unknown as typeof schema.appeals.portalLookup,
  });
  a = await get(id);
  assertKind("9. appeal_not_possible", deriveCardState(a, null, null).kind, "appeal_not_possible");

  // ---------- 10. gathering_evidence (verdict=open, no letter, no evidence) ----------
  await dbUpdate(id, {
    portalLookup: {
      status: "verified",
      fetchedAt: new Date().toISOString(),
      verdict: "open",
      verdictReason: "Open and challengeable",
      metadata: {},
      photos: [],
      sourceUrl: "https://pcnevidence.lambeth.gov.uk/pcnonline/challenge.php",
    } as unknown as typeof schema.appeals.portalLookup,
    step: TICKET_CONFIRMED_STEP, // not yet EVIDENCE_DONE_STEP
  });
  a = await get(id);
  assertKind("10. gathering_evidence", deriveCardState(a, null, null).kind, "gathering_evidence");

  // ---------- 11. drafting (evidence done, no letter yet) ----------
  await dbUpdate(id, { step: EVIDENCE_DONE_STEP });
  a = await get(id);
  assertKind("11. drafting", deriveCardState(a, null, null).kind, "drafting");

  // ---------- 12. letter_ready (letterBody set, status=draft) ----------
  await dbUpdate(id, {
    letterBody: "Dear Lambeth Council,\n\nI write to challenge PCN LJ39952021…",
    letterSubject: "Challenge to PCN LJ39952021",
    letterWordCount: 12,
    letterAddressedTo: "Lambeth Parking Services",
  });
  a = await get(id);
  assertKind("12. letter_ready", deriveCardState(a, null, null).kind, "letter_ready");

  // ---------- 13. submitting (status=submitting) ----------
  await dbUpdate(id, { status: "submitting" });
  a = await get(id);
  assertKind("13. submitting", deriveCardState(a, null, null).kind, "submitting");

  // ---------- 14. submitted (status=submitted) ----------
  await dbUpdate(id, { status: "submitted" });
  a = await get(id);
  assertKind("14. submitted", deriveCardState(a, null, null).kind, "submitted");

  // ---------- 15. terminal (paid) ----------
  // Need a separate appeal for terminal states so we don't tangle status.
  const paidId = await createAppeal();
  await patch(paidId, { ticket: FULL_TICKET });
  await setProcessingStep(paidId, "ocr", "done");
  await dbUpdate(paidId, {
    portalLookup: {
      status: "verified",
      fetchedAt: new Date().toISOString(),
      verdict: "paid",
      verdictReason: "Paid",
      metadata: {},
      photos: [],
      sourceUrl: "https://pcnevidence.lambeth.gov.uk/pcnonline/challenge.php",
    } as unknown as typeof schema.appeals.portalLookup,
  });
  a = await get(paidId);
  const paidSnap: TicketStatusSnapshot = { ...OCR_SNAPSHOT, stage: "paid", canAppeal: false, canPay: false };
  assertKind("15. terminal (paid)", deriveCardState(a, paidSnap, null).kind, "terminal");

  // ---------- 16. terminal (cancelled) ----------
  const cancelledId = await createAppeal();
  await dbUpdate(cancelledId, { status: "cancelled" });
  a = await get(cancelledId);
  assertKind("16. terminal (cancelled)", deriveCardState(a, null, null).kind, "terminal");

  // ---------- 17. terminal (rejected) ----------
  const rejectedId = await createAppeal();
  await dbUpdate(rejectedId, { status: "rejected" });
  a = await get(rejectedId);
  assertKind("17. terminal (rejected)", deriveCardState(a, null, null).kind, "terminal");

  // ---------- 18. needs_decision (escalated) ----------
  const escalatedId = await createAppeal();
  await patch(escalatedId, { ticket: FULL_TICKET, step: TICKET_CONFIRMED_STEP });
  await setProcessingStep(escalatedId, "ocr", "done");
  a = await get(escalatedId);
  const escSnap: TicketStatusSnapshot = {
    ...OCR_SNAPSHOT,
    stage: "charge_certificate_issued",
    canAppeal: false,
  };
  const escState = deriveCardState(a, escSnap, null);
  assertKind("18. needs_decision (esc)", escState.kind, "needs_decision");
  if (escState.flavor !== "escalated") {
    console.error(`✗ 18. escalated flavor expected "escalated", got "${escState.flavor}"`);
    fail += 1;
  } else {
    console.info(`✓ 18. needs_decision (esc) flavor="escalated"`);
    pass += 1;
  }

  console.info(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\n✗ walker crashed:", err);
  process.exit(1);
});
