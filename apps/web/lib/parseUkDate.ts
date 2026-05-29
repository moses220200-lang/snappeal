/**
 * Date parsing for UK-format strings that council portals scrape.
 *
 * Built because portal-scraped fields arrive in `dd/mm/yyyy [HH:MM]`
 * (Imperial / Civica), `dd-mm-yyyy HH:MM:ss` (RingGo / Conduent), or
 * RFC-2822-ish "Tue, 26 May 2026 23:47" forms that `new Date(str)`
 * either rejects (some engines) or, worse, silently US-parses (V8
 * reads `01/02/2026` as February 1 instead of 2 January). Storing
 * the raw string then formatting client-side gave "Invalid Date" in
 * the header — and worse, the prior `Date.UTC`-based fix produced
 * a 1-hour-off ISO that displayed as the WRONG DAY in en-GB for any
 * council-scraped time near midnight (the council portal shows
 * `Tue, 26 May 2026 23:47` BST → we stored `…T23:47Z` → browser in
 * BST rendered `27 May 00:47`).
 *
 * Strategy — UK regex FIRST, native fallback last. We can't trust
 * the native parser for `dd/mm/yyyy` inputs because V8 confidently
 * returns the wrong month for any day ≤ 12. And for any input that
 * carries a wall clock without an explicit timezone, we MUST treat
 * the components as Europe/London (BST or GMT, depending on the
 * date) — never as UTC and never as server-local — so the same
 * council source produces the same ISO regardless of where the
 * Node process is running.
 *
 *   1. dd/mm/yyyy [HH:MM[:ss]]   → date-only: UTC midnight (calendar
 *                                  date is TZ-agnostic).
 *                                → date+time: Europe/London wall.
 *   2. ISO with explicit Z / ±HH:MM offset → trust the offset.
 *   3. ISO 8601 wall clock without TZ      → Europe/London wall.
 *   4. RFC-2822-like ("Tue, 26 May 2026 …" / "26 May 2026 …")
 *                                          → Europe/London wall.
 *   5. Last-resort native parse so we never strictly regress on
 *      something the platform DOES know how to read.
 *
 * Returns null for anything unparseable so callers can drop the
 * field rather than surface a stale or wrong-day date.
 *
 * Pure utility — safe in both server and client bundles.
 */

const DAY_FIRST_NUMERIC =
  /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})(?:[\sT,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

/** ISO 8601 with no timezone designator — wall clock only. */
const ISO_WALL =
  /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Detects an explicit timezone designator anchored at end of string. */
const HAS_EXPLICIT_TZ = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;

/** RFC-2822-ish: optional weekday prefix, day, month NAME, year,
 *  optional clock. Council portals (Westminster's Imperial backend)
 *  emit "Tue, 26 May 2026 23:47" — no TZ, so the native parser falls
 *  back to either server-local or UTC depending on engine + locale. */
const RFC_LIKE =
  /^(?:[A-Za-z]+,?\s+)?(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})(?:[\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** Offset (ms) by which Europe/London leads UTC at the given instant.
 *  +60·60·1000 during BST, 0 during GMT. Derived from `Intl` rather
 *  than a hand-rolled DST table so transitions stay correct without
 *  shipping a calendar — the Node runtime already knows the IANA
 *  rules for Europe/London. */
function londonOffsetMsAt(utcMs: number): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(utcMs))) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  // `Intl` can emit hour=24 for midnight in some locales; normalise.
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  const londonAsIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );
  return londonAsIfUtc - utcMs;
}

/** Treat (year, month0, day, hour, minute, second) as a Europe/London
 *  wall clock and return the corresponding UTC Date. Iterates twice
 *  because the offset at the *guessed* UTC moment can differ from the
 *  offset at the *true* UTC moment when the wall clock falls within
 *  an hour of a DST transition — once we know the corrected instant
 *  we re-read its offset to confirm we landed on the right side of
 *  the transition. */
function londonWallToUtc(
  year: number,
  month0: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  const guess = Date.UTC(year, month0, day, hour, minute, second);
  const offset1 = londonOffsetMsAt(guess);
  const refined = guess - offset1;
  const offset2 = londonOffsetMsAt(refined);
  // If the two offsets agree, we're not near a DST edge — keep refined.
  // If they disagree, we straddled a transition; the second reading is
  // the authoritative one (computed at the true instant).
  return new Date(offset1 === offset2 ? refined : guess - offset2);
}

/**
 * Parse a date string that might be ISO 8601 (with or without TZ),
 * UK numeric `dd/mm/yyyy [HH:MM[:ss]]`, or RFC-2822-like
 * `Tue, 26 May 2026 23:47`. Bare wall-clock inputs are interpreted as
 * Europe/London. Returns a Date or null.
 */
export function parseUkDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. UK day-first numeric. Tried FIRST because V8 will happily
  //    US-parse `02/05/2026` as Feb 5 — we'd never reach a fallback
  //    if native ran first.
  let m = DAY_FIRST_NUMERIC.exec(trimmed);
  if (m) {
    const [, d, mo, y, hh, mm, ss] = m;
    const year = Number(y);
    const month0 = Number(mo) - 1;
    const day = Number(d);
    if (hh != null) {
      return londonWallToUtc(
        year,
        month0,
        day,
        Number(hh),
        Number(mm),
        Number(ss ?? "0"),
      );
    }
    const ms = Date.UTC(year, month0, day);
    if (!Number.isNaN(ms)) return new Date(ms);
  }

  // 2. ISO with explicit timezone designator — the offset is right
  //    there in the string, so trust it. This is the path Claude's
  //    OCR prompt is asked to emit ("2026-05-12T09:14:00+01:00") and
  //    the path our own ISO writes round-trip through.
  if (HAS_EXPLICIT_TZ.test(trimmed)) {
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) return d;
  }

  // 3. ISO 8601 wall clock without TZ. Interpret as London local.
  m = ISO_WALL.exec(trimmed);
  if (m) {
    const [, y, mo, d, hh, mm, ss] = m;
    return londonWallToUtc(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss ?? "0"),
    );
  }

  // 4. RFC-2822-like ("Tue, 26 May 2026 23:47"). This is what the
  //    Imperial-backed council portals (Westminster, Lambeth, etc.)
  //    actually print in their PCN details table. Treat as London
  //    local rather than letting `new Date()` guess.
  m = RFC_LIKE.exec(trimmed);
  if (m) {
    const [, d, monName, y, hh, mm, ss] = m;
    const month0 = MONTH_INDEX[monName.slice(0, 3).toLowerCase()];
    if (month0 != null) {
      const year = Number(y);
      const day = Number(d);
      if (hh != null) {
        return londonWallToUtc(
          year,
          month0,
          day,
          Number(hh),
          Number(mm),
          Number(ss ?? "0"),
        );
      }
      return new Date(Date.UTC(year, month0, day));
    }
  }

  // 5. Last-ditch native parse. Anything that lands here has a TZ
  //    we trust the platform with — date strings the native parser
  //    can read but the regexes above didn't (rare in practice).
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
