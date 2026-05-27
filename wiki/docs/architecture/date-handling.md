# Date handling

Last refreshed **2026-05-27 (v0.3.10)**. Codified in v0.3.10 after a hunt for "Invalid Date" and silently-wrong dates rendering on the ticket card.

Council portals emit dates in UK day-first formats — Imperial / Civica use `dd/mm/yyyy HH:MM`, RingGo / Conduent sometimes use `dd-mm-yyyy HH:MM:ss`. JavaScript's native `Date` parser is hostile to these strings in two specific ways:

1. **V8 silently mis-parses `dd/mm/yyyy` as US dates** whenever the day is ≤ 12. `new Date("12/05/2026")` returns Dec 5 2026, not 12 May 2026. No warning, no error, just a confidently wrong answer.
2. **Native `Date(y, m-1, d, …)` constructs in LOCAL time.** On a server set to Europe/London during BST, `new Date(2026, 3, 30, 0, 0, 0).toISOString()` returns `2026-04-29T23:00:00.000Z` — one calendar day before the date the council said. The same code on a UTC server returns `2026-04-30T00:00:00.000Z`. Same input, different ISO depending on server TZ — quietly broken.

The wiki for [Vercel deployment](deployment.md) doesn't fix server TZ, so we treat the date pipeline as TZ-agnostic and normalise UK-format strings to UTC ISO at the single write boundary.

## The library — `lib/parseUkDate.ts`

```ts
parseUkDate(raw: string | null | undefined): Date | null
parseUkDateToIso(raw: string | null | undefined): string | null
```

Pure utility — safe in both server and client bundles. The parsing strategy:

1. **UK regex tried FIRST.** `DAY_FIRST_NUMERIC` matches `dd[/-.]mm[/-.]yyyy` with optional `HH:MM[:ss]` (separators: `/`, `-`, `.`, time separators: space, `T`, `,`). If it matches, build the Date with `Date.UTC(y, m-1, d, hh, mm, ss)` so the same string always yields the same ISO regardless of server TZ.
2. **Native parser as fallback** for ISO 8601, RFC 2822, long-form English (`"30 Apr 2026"`), and anything else without the `dd/mm/yyyy` ambiguity.
3. **Return `null` on failure** so callers can drop the field rather than surface a wrong-month date or a "Invalid Date" string.

The order matters: `parseUkDate("12/05/2026")` returns Date for **12 May 2026** (UK), not Dec 5. `parseUkDate("2026-04-30T12:00:00+01:00")` returns Date for the ISO instant. `parseUkDate("garbled-input")` returns `null`.

`parseUkDateToIso(raw)` is `parseUkDate(raw)?.toISOString() ?? null`. ISO output, machine-readable, TZ-deterministic.

## The display formatter — `lib/format.ts`

`formatShortDate(iso)` returns the "30 Apr" style short date used in the ticket card header + lifecycle timeline. v0.3.10 collapsed it onto `parseUkDate` so the UK-first / native-fallback order matches what's persisted server-side:

```ts
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const parsed = parseUkDate(iso);
  if (!parsed) return "";
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
```

Returns the empty string on unparseable inputs — the UI then renders nothing rather than `"Invalid Date"`.

## The write boundary — `persistPortalLookup`

`apps/web/lib/server/appeals.ts` has a private helper `normalisePortalSnapshotDates(snapshot)` that walks every date-typed key in `metadata` and coerces it via `parseUkDateToIso`. This is called inside `persistPortalLookup` before any DB write — single boundary, every reader downstream sees ISO regardless of what the council portal emitted.

The list of date-typed `metadata` keys is in a module constant:

```ts
const PORTAL_METADATA_DATE_KEYS = [
  "issuedAt",
  "dueDateAt",
  "discountUntil",
  "fullChargeFrom",
  "paidAt",
] as const;
```

`paidAt` was added in v0.3.10 — it was originally omitted, so paid-PCN snapshots had raw `dd/mm/yyyy` strings in `metadata.paidAt` while every other date was ISO. Add to this list whenever a new date-typed key joins `PortalLookupSnapshot["metadata"]`.

The same normalisation logic also runs on the `ticket` backfill inside `persistPortalLookup` — when the council overrides an empty ticket field, the council's value lands as ISO on `appeals.ticket.<field>` too.

## The backfill — `scripts/normalize-portal-dates.ts`

One-shot script for legacy rows that pre-date the normalisation boundary. Walks every appeal with a `portal_lookup` snapshot, runs `parseUkDateToIso` on each date-typed key in both `portal_lookup.metadata` and `ticket`, writes back any that changed.

```
cd apps/web && npx tsx --env-file=.env.local scripts/normalize-portal-dates.ts
```

Idempotent: rows already in ISO are skipped. Run once after deploying the normalisation boundary; subsequent rows are normalised at write time and never need this script.

## Why a write-side normaliser AND a read-side fallback

The read-side fallback (`formatShortDate` delegating to `parseUkDate`) catches anything that slipped through the write boundary — legacy rows the backfill hasn't been run against, or any future code path that writes a raw council date by mistake. The write-side normaliser keeps the DB clean for the future. Defence in depth.

## Things this code does NOT do

- **No timezone conversion of times.** A council that emits `"30/04/2026 12:00"` is interpreted as UTC midnight + 12 hours = 12:00 UTC. If the council means 12:00 local UK time, that's a calendar-display issue we accept (council UIs nationally show times without TZ qualifiers and we don't try to second-guess them).
- **No US-date support.** We deliberately refuse to disambiguate dates that could be `mm/dd/yyyy` — UK council portals don't emit those, and a confidently wrong answer is worse than no answer.
- **No locale fancy work.** `toLocaleDateString("en-GB", {...})` is the only locale touch, and it's fixed at en-GB.

## Cross-refs

- The submission engine that emits these strings: [`submission-engine.md`](submission-engine.md).
- The recipe path that scrapes them: [`deterministic-recipes.md`](deterministic-recipes.md).
- The schema field on `PortalLookupSnapshot`: [`data-model.md`](data-model.md).
- The display formatter: `apps/web/lib/format.ts:formatShortDate`.
- The parser: `apps/web/lib/parseUkDate.ts`.
- The write normaliser: `apps/web/lib/server/appeals.ts:normalisePortalSnapshotDates`.
- The backfill script: `apps/web/scripts/normalize-portal-dates.ts`.
