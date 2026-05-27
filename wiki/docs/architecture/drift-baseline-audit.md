# Drift-baseline admin audit

Last refreshed **2026-05-27 (v0.3.10)**.

!!! warning "Planned, not yet shipped"
    This page documents a P9 follow-up. The tool described here doesn't exist in the codebase yet. It's planned in `handoff.md` under "Pickup-here items" and surfaced here so the gap is visible.

## The problem

[Deterministic recipes](deterministic-recipes.md) catch portal markup drift via per-step DOM signature checks and fall back to Claude MCP cleanly. That solves the per-customer experience — they still get a verdict — but it leaves two ops problems:

1. **No proactive signal.** We only discover a council has redesigned their portal when a customer's recipe falls back to Claude. The cost on that one lookup balloons from $0 to ~$0.30; the wall-clock from ~15 s to ~90 s. Multiply by every customer hitting the council during the window between the deploy and our fix and the unit economics shift.
2. **No structured baseline to repair from.** When we DO repair the recipe, we re-derive the new selectors from a fresh manual portal walk — slow, error-prone, no audit trail of "what the portal looked like before".

The drift-baseline audit tool closes both gaps.

## What it will do

A new admin page at `/admin/councils/[slug]/audit`:

- **Run the registered recipe** against an admin-supplied known-good PCN + reg.
- **Capture the DOM signatures** the recipe observed at each step (input count, button labels, expected verdict markers, scraped metadata shapes).
- **Diff against the stored baseline** for that council — surface anything that changed.
- **Let admins "promote"** the captured signatures as the new baseline when they've reviewed the change and decided the recipe is healthy.
- **Show drift counter** vs canonical (already wired into the MCP automation editor at `/admin/councils/[slug]/automation`).

## Data model (sketch)

A new column on `councils` or a new `council_recipe_baselines` table:

```sql
CREATE TABLE council_recipe_baselines (
  id text PRIMARY KEY,
  council_slug text NOT NULL REFERENCES councils(slug),
  recipe_version text NOT NULL,    -- git sha of recipes/<slug>.ts at capture
  captured_at timestamptz NOT NULL DEFAULT now(),
  captured_by text NOT NULL,       -- admin user id
  signatures jsonb NOT NULL,       -- { step1: { inputCount, ... }, step2: { ... } }
  test_pcn_ref text,               -- the PCN used as the fixture
  test_vehicle_reg text,
  notes text                       -- "verified after Lambeth 2026-08 portal redesign"
);
CREATE INDEX ON council_recipe_baselines (council_slug, captured_at DESC);
```

A recipe run's `RecipeResult` then optionally carries a `signatures` payload alongside `verdict` + `metadata`. The runner writes one row to this table per admin-initiated audit (NOT per customer lookup — that would flood the table).

## Workflow

1. **Council portal redeploys.** A customer's recipe hits drift and falls back to Claude. The admin sees the drift event in the appeal-tickets list (`mode='cli'` + the `errorKind` from `ai_calls`).
2. **Admin investigates.** Opens `/admin/councils/<slug>/audit` and clicks "Run audit against fixture PCN".
3. **The tool re-runs the recipe.** Drift now visible structurally — the report shows "step 2 button label changed from 'Continue' to 'Next'" with both signatures side by side.
4. **Admin fixes the recipe.** Edits `recipes/<slug>.ts` to handle the new label. Re-runs the audit; passes clean.
5. **Admin promotes the new baseline.** Click "Promote signatures" — the captured DOM shapes become the new reference for the drift counter shown on `/admin/councils/<slug>/automation`.

## Open design questions

- **Where do fixture PCNs come from?** Per-council `dry-run` test data lives in `lib/server/submission/automation.ts` (`DRY_RUN_FIXTURES`). The audit tool can reuse it.
- **What if a drift event fires after office hours?** The fallback to Claude handles customer experience; the admin tool is for repair-on-next-business-day, not real-time mitigation.
- **Should we automate baseline capture on every recipe deploy?** Probably. A pre-deploy hook that runs the audit against the staging council portal would catch drift introduced by our own code changes before customers see them.

## Until this ships

Operationally the gap is bridged by:

- **The drift counter on `/admin/councils/[slug]/automation`** which already shows how many fields the live council page diverges from the canonical recipe expectations.
- **The `ai_calls` cost telemetry** which makes Claude-fallback runs visible (mode=`cli` + costUsd > 0) vs successful recipe runs (mode=`deterministic` + costUsd=0). Ops greps for an uptick in `mode='cli'` for a previously-deterministic council.
- **Manual recipe verification** via `scripts/audit-lambeth-lookup.ts` (and similar per-council scripts) — the file-system way to do what this UI will eventually do.

## Cross-refs

- The recipes the audit will baseline: [`deterministic-recipes.md`](deterministic-recipes.md).
- The admin MCP automation editor that already shows the drift counter: [`admin.md`](admin.md).
- The orchestrator that decides recipe vs Claude: [`submission-engine.md`](submission-engine.md).
- The "Pickup-here items" tracker for when this gets prioritised: [`handoff.md`](../handoff.md).
