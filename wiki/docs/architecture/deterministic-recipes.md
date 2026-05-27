# Deterministic Playwright recipes

Last refreshed **2026-05-27 (v0.3.10)**. Shipped in **Phase 9** (2026-05-26).

A per-council Playwright walk that does the council-portal lookup with **zero AI cost** and ~10–20 seconds of wall-clock vs ~60–120 seconds + ~$0.30 for the Claude MCP path. Drives the same DOM, returns the same `PortalLookupSnapshot` shape, plugs into the same `runPortalLookup` orchestrator. Falls back to Claude automatically on drift (council portal markup changed) or error.

## Why this exists

The Claude MCP path for a council lookup spends ~$0.30 of Claude budget on what is, mechanically, a fill-form-and-scrape walk. For councils whose portals don't change often (Lambeth's Imperial stack is stable across months), a hand-written Playwright recipe gets the same result at near-zero marginal cost. The recipe approach also runs faster (no LLM token round-trips) which the customer sees as a snappier validate-first card flip.

Drift is the worst case: a council ships a portal redesign and our hard-coded selectors stop matching. Two safety nets handle this:

1. **DOM signature checks** at each recipe step return `{ drift: true }` when the expected element shape isn't there. The runner falls back to the Claude MCP path **automatically** for that one appeal.
2. **The drift baseline audit tool** (planned, see [`drift-baseline-audit.md`](drift-baseline-audit.md)) will let admins re-baseline a recipe against a known-good PCN after a council deploy, so drift handling moves from "wait for a customer to fail" to "proactively verify".

## File layout

```
apps/web/lib/server/submission/recipes/
├── types.ts        # CouncilRecipe + RecipeSuccess | RecipeDrift | RecipeError
├── index.ts        # registry + runDeterministicLookup runner
└── lambeth.ts      # Lambeth's concrete recipe (only entry shipped to date)
```

## The `CouncilRecipe` contract

```ts
interface CouncilRecipe {
  slug: string;
  displayName: string;
  /** Max wall-clock the runner gives the recipe before aborting. */
  timeoutMs: number;
  /** Drive the Playwright page through the lookup and return the result. */
  run(page: Page, input: RecipeInput): Promise<RecipeResult>;
}

type RecipeResult =
  | RecipeSuccess  // { ok: true, verdict, verdictReason, metadata, photoUrls, durationMs }
  | RecipeDrift    // { ok: false, drift: true, reason, step, durationMs }
  | RecipeError;   // { ok: false, drift: false, errorKind, reason, durationMs }
```

The result shape mirrors the Claude MCP path's output so `persistPortalLookup` doesn't care which produced it. The worker writes `mode='deterministic'` + `costUsd=0` on a recipe success and `mode='cli'` + the real cost on a Claude fallback — so the admin Appeal Tickets list shows fast-path vs Claude-fallback rows in the cost breakdown column.

## The runner — `runDeterministicLookup`

`apps/web/lib/server/submission/recipes/index.ts` owns the Chromium lifecycle. Per call:

1. Look up the recipe by `councilSlug` — return `null` if none registered (the caller falls through to Claude MCP).
2. Spin up a **fresh isolated Chromium context** so back-to-back lookups don't share session state, cookies, or local storage.
3. Run `recipe.run(page, input)` under the recipe's `timeoutMs` ceiling (60 s for Lambeth).
4. Tear down the context regardless of outcome.
5. Return the `RecipeResult`.

If the result is `RecipeDrift` or `RecipeError`, the calling code in `lib/server/submission/lookup.ts` (`runPortalLookup`) falls through to the Claude MCP path. The customer sees the same end-state; the worker writes the drift event to `ai_calls.errorKind` for ops to see.

## Lambeth — the first recipe

`apps/web/lib/server/submission/recipes/lambeth.ts` drives `https://pcnevidence.lambeth.gov.uk/pcnonline/challenge.php` directly:

1. Navigate to the portal URL. **Drift check**: two text inputs (PCN ref + VRM) present?
2. Fill the lookup form. **Drift check**: submit button present + clickable?
3. Click Submit, wait for `domcontentloaded`.
4. Scrape the ticket-details page via a **single `browser_evaluate` call** that extracts everything in one shot: verdict (open/paid/closed/not_found/expired), metadata (pcnRef, vehicleReg, contraventionCode, location, issuedAt, amountPence, dueDateAt), challenge-button presence, closed-state signals.
5. **Drift check**: did we get the verdict markers we expected (`not found` / `paid` text, contravention code shape, amount shape)?
6. If the verdict is `open` or `expired`, click "View Images" and scrape the warden-photo URLs into the `photoUrls` array.
7. Return `RecipeSuccess { ok: true, verdict, verdictReason, metadata, photoUrls, durationMs }`.

Wall-clock cost on the test PCN: ~12–18 s end-to-end. Claude path on the same PCN: ~75–110 s. The customer-visible difference is "the verdict landed before I even read the Build-appeal prompt".

## Date normalisation

The recipe's scraped strings come back in the council's native format (Lambeth: `dd/mm/yyyy HH:MM`). These are passed verbatim into the `PortalLookupSnapshot.metadata`. `persistPortalLookup` then runs `normalisePortalSnapshotDates` which delegates to `parseUkDate` from [`date-handling.md`](date-handling.md) — UK-format strings are converted to ISO at the single write boundary, never re-derived downstream.

## Adding a new recipe

The pattern for onboarding the next council (Westminster is the obvious next one — it shares the Imperial Civil Enforcement stack with Lambeth):

1. **Capture portal selectors**. Walk the portal manually; note the CSS selectors for the lookup form inputs, the submit button, the verdict markers on the ticket-details page, and the "View Images" link.
2. **Write `recipes/<slug>.ts`**. Implement `CouncilRecipe`. The Lambeth recipe is the working template:
   - One `browser_evaluate` per scrape step (cheaper than per-field selectors).
   - Drift checks BEFORE each click — return `{ drift: true, reason, step, durationMs }` cleanly instead of throwing.
   - `RecipeError` for transport-level failures (timeouts, navigation errors, page crash).
3. **Register it** in `recipes/index.ts`.
4. **Smoke-test** via `runDeterministicLookup` directly from `scripts/test-dryrun-westminster.ts` (or the equivalent). The test runs the recipe against a known-good PCN and asserts the verdict matches.
5. **Drift baseline** (eventual): once the planned audit tool ships, save the recipe's DOM signatures against a baseline so council redesigns get caught before customers see them.

## Status today

| Council | Submission prompt | Lookup prompt | Recipe | Grounds registry |
|---|---|---|---|---|
| Lambeth | ✅ | ✅ | ✅ | ✅ |
| Westminster | ✅ | ✅ | ❌ | ❌ |
| Camden / RBKC / Islington / TfL / City of London | ❌ | ❌ | ❌ | ❌ |

Westminster is next — submission + lookup prompts already exist (Claude MCP path), so the recipe is the only addition needed to bring it to parity with Lambeth.

## Cross-refs

- The orchestrator that decides recipe-vs-MCP: [`submission-engine.md`](submission-engine.md).
- The shared snapshot shape both paths produce: [`data-model.md`](data-model.md) → `PortalLookupSnapshot`.
- The date normalisation downstream: [`date-handling.md`](date-handling.md).
- The not-yet-shipped drift audit: [`drift-baseline-audit.md`](drift-baseline-audit.md).
- Per-council grounds the recipe ultimately submits against: [`grounds-registry.md`](grounds-registry.md).
