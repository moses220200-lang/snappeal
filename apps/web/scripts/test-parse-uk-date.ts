/**
 * Regression test for the UK-date parser.
 *
 *   npx tsx scripts/test-parse-uk-date.ts
 *
 * Guards the rule that a council-portal wall clock like
 * "Tue, 26 May 2026 23:47" must round-trip through `parseUkDate` →
 * `toISOString` → `toLocaleDateString("en-GB", { timeZone: "Europe/London" })`
 * back to "26 May" REGARDLESS of the server's local timezone.
 *
 * The original bug: `parseUkDate` built dates via `Date.UTC(...)` for
 * UK numeric inputs and let the native parser handle the rest. On a
 * UTC server (Vercel default), a 23:47 BST council scrape was stored
 * as `…T23:47Z`, which a BST browser then rendered as "27 May 00:47"
 * — exactly the off-by-one-day the customer reported.
 *
 * Each case here asserts:
 *   1. The parsed ISO matches the EXPECTED UTC instant (so we know we
 *      interpreted the input as London local, not UTC).
 *   2. Re-formatting that ISO in Europe/London yields the ORIGINAL
 *      wall clock — proving round-trip stability across TZs.
 */
import assert from "node:assert/strict";
import { parseUkDate, parseUkDateToIso } from "../lib/parseUkDate";

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

function londonWall(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

console.log("parseUkDate — London wall-clock interpretation");

// ──────────────────────────────────────────────────────────────────
// BST inputs (May = BST, UTC+1) — the customer's reproduction case.
// 23:47 BST is 22:47Z, NOT 23:47Z. The buggy `Date.UTC`-based parser
// produced 23:47Z, which a BST browser then rendered as 27 May.
// ──────────────────────────────────────────────────────────────────

check("dd/mm/yyyy HH:MM in BST — 26/05/2026 23:47", () => {
  const iso = parseUkDateToIso("26/05/2026 23:47");
  assert.equal(iso, "2026-05-26T22:47:00.000Z");
  assert.ok(londonWall(iso!).startsWith("26 May 2026"));
});

check("RFC-2822-like in BST — 'Tue, 26 May 2026 23:47'", () => {
  const iso = parseUkDateToIso("Tue, 26 May 2026 23:47");
  assert.equal(iso, "2026-05-26T22:47:00.000Z");
  assert.ok(londonWall(iso!).startsWith("26 May 2026"));
});

check("RFC-2822-like in BST without weekday — '26 May 2026 23:47'", () => {
  const iso = parseUkDateToIso("26 May 2026 23:47");
  assert.equal(iso, "2026-05-26T22:47:00.000Z");
});

check("ISO without TZ in BST — '2026-05-26T23:47:00'", () => {
  const iso = parseUkDateToIso("2026-05-26T23:47:00");
  assert.equal(iso, "2026-05-26T22:47:00.000Z");
});

// ──────────────────────────────────────────────────────────────────
// GMT inputs (January = GMT, UTC+0) — verify we don't apply a
// blanket +1h: in winter the offset is zero, so 23:47 GMT stays
// 23:47Z. A naive "subtract 1h" fix would break these.
// ──────────────────────────────────────────────────────────────────

check("dd/mm/yyyy HH:MM in GMT — 15/01/2026 23:47", () => {
  const iso = parseUkDateToIso("15/01/2026 23:47");
  assert.equal(iso, "2026-01-15T23:47:00.000Z");
});

check("RFC-2822-like in GMT — 'Thu, 15 Jan 2026 09:14'", () => {
  const iso = parseUkDateToIso("Thu, 15 Jan 2026 09:14");
  assert.equal(iso, "2026-01-15T09:14:00.000Z");
});

// ──────────────────────────────────────────────────────────────────
// Explicit TZ — trust the offset the source already provided. Our
// OCR prompt asks Claude to emit "+01:00" for BST issuances; we
// must not double-shift those.
// ──────────────────────────────────────────────────────────────────

check("ISO with +01:00 — '2026-05-26T23:47:00+01:00'", () => {
  const iso = parseUkDateToIso("2026-05-26T23:47:00+01:00");
  assert.equal(iso, "2026-05-26T22:47:00.000Z");
});

check("ISO with Z — '2026-05-26T22:47:00Z'", () => {
  const iso = parseUkDateToIso("2026-05-26T22:47:00Z");
  assert.equal(iso, "2026-05-26T22:47:00.000Z");
});

// ──────────────────────────────────────────────────────────────────
// Date-only — calendar date is TZ-agnostic; UTC midnight is fine.
// ──────────────────────────────────────────────────────────────────

check("Date-only dd/mm/yyyy — '11/06/2026'", () => {
  const iso = parseUkDateToIso("11/06/2026");
  assert.equal(iso, "2026-06-11T00:00:00.000Z");
});

check("Date-only '11 Jun 2026'", () => {
  const iso = parseUkDateToIso("11 Jun 2026");
  assert.equal(iso, "2026-06-11T00:00:00.000Z");
});

// ──────────────────────────────────────────────────────────────────
// Day-first disambiguation — V8 would US-parse "02/05/2026" as
// Feb 5; we must read it as 2 May (BST in 2026).
// ──────────────────────────────────────────────────────────────────

check("Day-first ambiguity — '02/05/2026 09:14' is 2 May not 5 Feb", () => {
  const d = parseUkDate("02/05/2026 09:14");
  assert.ok(d != null);
  // 2 May is in BST, so 09:14 wall = 08:14Z.
  assert.equal(d!.toISOString(), "2026-05-02T08:14:00.000Z");
});

// ──────────────────────────────────────────────────────────────────
// Garbage in → null out.
// ──────────────────────────────────────────────────────────────────

check("Unparseable returns null", () => {
  assert.equal(parseUkDate("not a date"), null);
  assert.equal(parseUkDate(""), null);
  assert.equal(parseUkDate(null), null);
});

if (failures > 0) {
  console.error(`\n${failures} failing case(s).`);
  process.exit(1);
}
console.log("\nAll parseUkDate cases pass.");
