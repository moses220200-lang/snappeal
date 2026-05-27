/**
 * Regression test for the v0.3.11 "Reading failed" manual-entry trap.
 *
 * The trap: OCR fails (processing.ocr.status='failed') → user taps
 * "Enter details manually" → fills the form → submits → /app/manual-entry
 * PATCHes the ticket → BUT the card stays on "Reading failed" forever
 * because nothing cleared processing.ocr.status.
 *
 * Two fixes guard against it:
 *   - Fix A (server)  : patchAppealDraft in lib/server/appeals.ts now
 *     flips processing.ocr.status to 'done' when an incoming PATCH
 *     supplies a ticket with both pcnRef + vehicleReg and the row is
 *     currently in the failed state.
 *   - Fix B (client)  : deriveCardState now requires BOTH ocrFailed AND
 *     missing required ticket fields before returning extraction_failed.
 *     Belt-and-braces against any future caller that writes ticket data
 *     without clearing the status flag.
 *
 * This test exercises both fixes against the real dev server.
 *
 * Run with:   npx tsx --env-file=.env.local scripts/test-manual-entry-trap.ts
 *             (set PARKINGRABBIT_BASE if your dev server isn't on :3001)
 *
 * Exit code 0 = both fixes verified. Non-zero = regression.
 */
import { deriveCardState } from "../lib/deriveCardState";
import { setProcessingStep, type AppealRecord } from "../lib/server/appeals";

const BASE = process.env.PARKINGRABBIT_BASE ?? "http://127.0.0.1:3001";
const SESSION = `trap_${Date.now()}`;

function headers() {
  return {
    "content-type": "application/json",
    "x-parkingrabbit-session": SESSION,
  };
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.info(`✓ ${msg}`);
}

async function patch(id: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/appeals/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`PATCH ${id} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { appeal: AppealRecord };
}

async function get(id: string) {
  const res = await fetch(`${BASE}/api/appeals/${encodeURIComponent(id)}`, {
    headers: { "x-parkingrabbit-session": SESSION },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`GET ${id} failed: ${res.status} ${await res.text()}`);
  }
  return ((await res.json()) as { appeal: AppealRecord }).appeal;
}

async function main() {
  console.info(`▶ session=${SESSION} base=${BASE}\n`);

  // ── 1. Create draft appeal ─────────────────────────────────────────
  const createRes = await fetch(`${BASE}/api/appeals`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ sessionId: SESSION }),
  });
  if (!createRes.ok) {
    throw new Error(`create failed: ${createRes.status} ${await createRes.text()}`);
  }
  const created = (await createRes.json()) as { appeal: { id: string } };
  const id = created.appeal.id;
  console.info(`▶ created appeal ${id}\n`);

  // ── 2. Simulate OCR failure exactly the way /api/extract's catch
  //       block does — via setProcessingStep, the canonical server
  //       helper. The PATCH API deliberately rejects raw `processing`
  //       payloads from clients (Zod schema in app/api/appeals/[id]/
  //       route.ts omits it) so we go in-process here. ──
  await setProcessingStep(id, "ocr", "failed", "Simulated OCR failure for regression test");
  let appeal = await get(id);
  assert(
    appeal.processing?.ocr?.status === "failed",
    "step 1: appeal seeded with processing.ocr.status='failed'",
  );
  assert(
    !appeal.ticket?.pcnRef && !appeal.ticket?.vehicleReg,
    "step 1: no ticket data yet",
  );

  // ── 2a. Pre-fix-B baseline: deriveCardState SHOULD return
  //        extraction_failed at this point — we have OCR failure AND
  //        no data. This proves the trap state is reachable. ──
  let state = deriveCardState(appeal, null, null);
  assert(
    state.kind === "extraction_failed",
    `step 2a: deriveCardState returns "extraction_failed" with no ticket data (got "${state.kind}")`,
  );

  // ── 3. User taps "Enter details manually" and submits — same PATCH
  //       shape /app/manual-entry/page.tsx sends on success. ──
  await patch(id, {
    ticket: {
      issuer: "London Borough of Lambeth",
      councilSlug: "lambeth",
      pcnRef: "LB12345678",
      vehicleReg: "AB12CDE",
      contraventionCode: "",
      contraventionDescription: "",
      issuedAt: "",
      location: "",
      amountPence: 13000,
    },
  });
  appeal = await get(id);

  // ── 4. Fix A assertion: processing.ocr.status was auto-cleared to "done". ──
  assert(
    appeal.ticket?.pcnRef === "LB12345678",
    "step 3: pcnRef persisted from manual entry",
  );
  assert(
    appeal.ticket?.vehicleReg === "AB12CDE",
    "step 3: vehicleReg persisted from manual entry",
  );
  assert(
    appeal.councilSlug === "lambeth",
    "step 3: councilSlug hoisted onto FK column",
  );
  assert(
    appeal.processing?.ocr?.status === "done",
    `Fix A: patchAppealDraft auto-cleared ocr.status from 'failed' to 'done' (got "${appeal.processing?.ocr?.status}")`,
  );
  assert(
    appeal.processing?.ocr?.error?.includes("Simulated OCR failure") === true,
    "Fix A: original OCR error message preserved for audit",
  );

  // ── 5. deriveCardState should now move OFF extraction_failed and
  //       into pending_review (data present, awaiting user confirm). ──
  state = deriveCardState(appeal, null, null);
  assert(
    state.kind === "pending_review",
    `step 5: deriveCardState returns "pending_review" after manual entry (got "${state.kind}")`,
  );

  // ── 6. Fix B independent check: simulate the failure mode where some
  //       OTHER code path wrote ticket data without clearing ocr.status.
  //       This is the belt-and-braces case — the client-side guard alone
  //       should still keep the user out of the trap. Same helper as
  //       step 2 — bypasses the PATCH Zod schema that protects this
  //       field. ──
  await setProcessingStep(id, "ocr", "failed", "Force-restored failure to exercise Fix B");
  appeal = await get(id);
  assert(
    appeal.processing?.ocr?.status === "failed",
    "step 6: ocr.status force-restored to 'failed' (ticket data still present)",
  );
  state = deriveCardState(appeal, null, null);
  assert(
    state.kind !== "extraction_failed",
    `Fix B: deriveCardState skips extraction_failed when ticket has pcnRef+vehicleReg (got "${state.kind}")`,
  );

  console.info("\n✓ all assertions passed — manual-entry trap stays fixed");
}

main().catch((err) => {
  console.error("\n✗ test failed:", err);
  process.exit(1);
});
