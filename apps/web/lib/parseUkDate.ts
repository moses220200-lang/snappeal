/**
 * Date parsing for UK-format strings that council portals scrape.
 *
 * Built because portal-scraped fields arrive in `dd/mm/yyyy [HH:MM]`
 * (Imperial / Civica) or `dd-mm-yyyy HH:MM:ss` (RingGo / Conduent)
 * forms that `new Date(str)` either rejects (some engines) or, worse,
 * silently US-parses (V8 reads `01/02/2026` as February 1 instead of
 * 2 January). Storing the raw string then formatting client-side gave
 * "Invalid Date" in the header.
 *
 * Strategy — UK regex FIRST, native fallback second. We can't trust
 * the native parser for `dd/mm/yyyy` inputs because V8 confidently
 * returns the wrong month for any day ≤ 12. So:
 *   1. If the input matches dd/mm/yyyy (slash/dash/dot separators,
 *      optional clock), decode it as UK day-first.
 *   2. Otherwise (ISO 8601, RFC2822, "30 Apr 2026", anything else),
 *      defer to `new Date()` — unambiguous and well-formed.
 *
 * The UK branch builds dates via `Date.UTC` so the same input always
 * round-trips to the same ISO regardless of the server's timezone —
 * "30/04/2026" is treated as a calendar date, not a local-time wall
 * clock. Without this, BST/UTC servers would emit different ISO
 * strings for the same council source.
 *
 * Returns null for anything unparseable so callers can drop the field
 * rather than surface a stale or wrong-month date.
 *
 * Pure utility — safe in both server and client bundles.
 */

const DAY_FIRST_NUMERIC =
  /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})(?:[\sT,](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * Parse a date string that might be ISO 8601 or UK-format
 * `dd/mm/yyyy [HH:MM[:ss]]` (also accepts `-` and `.` as separators).
 * Returns a Date or null.
 */
export function parseUkDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. UK day-first numeric. Tried FIRST because V8 will happily
  //    US-parse `02/05/2026` as Feb 5 — we'd never reach a fallback
  //    if native ran first. Dates are constructed in UTC so the same
  //    string always yields the same ISO regardless of TZ.
  const m = DAY_FIRST_NUMERIC.exec(trimmed);
  if (m) {
    const [, d, mo, y, hh = "0", mm = "0", ss = "0"] = m;
    const ms = Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss),
    );
    if (!Number.isNaN(ms)) return new Date(ms);
  }

  // 2. Anything else (ISO 8601, "30 Apr 2026", RFC2822, etc.) goes
  //    through the native parser — its disambiguations are correct
  //    for inputs that don't have the dd/mm/yyyy ambiguity.
  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) return direct;

  return null;
}

/**
 * Same as `parseUkDate` but returns an ISO 8601 string or null. Used at
 * the lookup-write boundary so persisted dates are always machine-
 * readable, regardless of which council portal produced them.
 */
export function parseUkDateToIso(raw: string | null | undefined): string | null {
  const d = parseUkDate(raw);
  return d ? d.toISOString() : null;
}
