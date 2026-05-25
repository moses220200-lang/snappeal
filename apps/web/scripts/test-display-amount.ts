/**
 * Regression test for the PCN amount trust invariant.
 *
 *   npm run test:display
 *
 * Guards the rule that the displayed amount (header + every summary
 * surface) must equal the OCR-extracted amount BEFORE council
 * verification — never a status-checker balance or any inferred figure.
 * The original bug: header showed the mock status-checker's £130/£210
 * while the confirm form (and OCR) showed £160. See lib/ticketDisplay.ts.
 */
import assert from "node:assert/strict";
import { resolveDisplayTicket } from "../lib/ticketDisplay";
import type { AppealRecord } from "../lib/server/appeals";
import type { TicketStatusSnapshot } from "../lib/server/connectors/types";

function appeal(partial: Partial<AppealRecord>): AppealRecord {
  return partial as AppealRecord;
}
function snap(currentDuePence: number | null): TicketStatusSnapshot {
  return { currentDuePence } as unknown as TicketStatusSnapshot;
}
type Ticket = AppealRecord["ticket"];
type Portal = AppealRecord["portalLookup"];

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures += 1;
    console.error(`  ✗ ${name}\n    ${(e as Error).message}`);
  }
}

console.log("PCN amount trust invariant\n");

// 1. The reported bug: status-checker says £210, OCR says £160 → £160 wins.
check("pre-verification shows the OCR amount, not the status-checker", () => {
  const d = resolveDisplayTicket(
    appeal({ ticket: { amountPence: 16000 } as Ticket }),
    snap(21000),
  );
  assert.equal(d.amountPence, 16000);
  assert.equal(d.amountSource, "ocr");
  // headerAmount === formAmount === ocrExtractedPCN.amount
  assert.equal(d.amountPence, d.ocrAmountPence);
  assert.equal(d.amountChangedByCouncil, false);
});

// 2. A pending portal lookup is still pre-verification.
check("pending portal lookup still uses the OCR amount", () => {
  const d = resolveDisplayTicket(
    appeal({
      ticket: { amountPence: 16000 } as Ticket,
      portalLookup: { status: "pending" } as Portal,
    }),
    snap(13000),
  );
  assert.equal(d.amountPence, 16000);
  assert.equal(d.amountSource, "ocr");
});

// 3. Overridden (user chose to trust their own scan) → OCR amount.
check("overridden lookup uses the OCR amount, ignoring council metadata", () => {
  const d = resolveDisplayTicket(
    appeal({
      ticket: { amountPence: 16000 } as Ticket,
      portalLookup: {
        status: "overridden",
        metadata: { amountPence: 13000 },
      } as Portal,
    }),
    snap(13000),
  );
  assert.equal(d.amountPence, 16000);
});

// 4. Verified: the council figure takes over AND the change is flagged
//    so the UI can explain it (never silent).
check("verified lookup adopts the council amount and flags the change", () => {
  const d = resolveDisplayTicket(
    appeal({
      ticket: { amountPence: 16000 } as Ticket,
      portalLookup: {
        status: "verified",
        metadata: { amountPence: 13000 },
      } as Portal,
    }),
    snap(13000),
  );
  assert.equal(d.amountPence, 13000);
  assert.equal(d.amountSource, "council_verified");
  assert.equal(d.amountChangedByCouncil, true);
});

// 5. Verified but the council agrees with the scan → not flagged as changed.
check("verified amount equal to the scan is not flagged as changed", () => {
  const d = resolveDisplayTicket(
    appeal({
      ticket: { amountPence: 16000 } as Ticket,
      portalLookup: {
        status: "verified",
        metadata: { amountPence: 16000 },
      } as Portal,
    }),
    snap(16000),
  );
  assert.equal(d.amountPence, 16000);
  assert.equal(d.amountChangedByCouncil, false);
});

// 6. No amount anywhere → null, source "none".
check("missing amount resolves to null / none", () => {
  const d = resolveDisplayTicket(appeal({ ticket: {} as Ticket }), null);
  assert.equal(d.amountPence, null);
  assert.equal(d.amountSource, "none");
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll amount-invariant tests passed");
