# Grounds-translation registry

Last refreshed **2026-05-27 (v0.3.10)**.

The grounds registry is the single source of truth for **how our internal canonical ground IDs map to each council portal's specific radio-button text**. It's the thing that lets the submission agent click the right row on a council's challenge form regardless of how that council phrases its statutory grounds.

## The problem the registry solves

A Londoner's quiz selection is a list of friendly card IDs (e.g. `sign-obscured`, `paid-app-correct-bay`, `bb-displayed`). Those roll up to **11 canonical statutory grounds** in `lib/grounds-catalog.ts`:

```
contravention-did-not-occur
signage-unclear
valid-permit
blue-badge
loading-unloading
breakdown
medical-emergency
vehicle-not-mine
penalty-exceeds-amount
procedural-impropriety
traffic-order-invalid
```

When the submission agent reaches the council's challenge portal, it has to **click ONE radio button** out of a council-specific list. Lambeth has 10 rows phrased as e.g. "The Traffic Management Order is invalid"; Westminster phrases its options differently; Camden again differently. The agent can't be told "click signage-unclear" — it has to be told "click the row whose text says 'The Traffic Management Order is invalid'".

Before v0.3.10 this mapping lived inline in each council's submission prompt as a markdown block — and Lambeth's inline block used some pre-canonical slugs (`tmo-invalid`, `broke-down`, `already-paid`) that the customer quiz no longer produces. Drift between the canonical taxonomy and the council-specific prompts was a real cost-of-doing-business bug. P11 (v0.3.10) extracted the mapping into a registry that the prompt now renders from at module load.

## File layout

```
apps/web/lib/server/submission/grounds/
├── types.ts        # CouncilGroundsMapping + ResolvedGroundLabel interfaces
├── registry.ts     # central lookup + rendering helpers
└── lambeth.ts      # Lambeth's concrete mapping (only entry shipped to date)
```

## The `CouncilGroundsMapping` shape

```ts
export interface CouncilGroundsMapping {
  /** Council slug (matches councils.slug column). */
  readonly councilSlug: string;
  /** Display name for log lines + admin UI. */
  readonly councilName: string;
  /** Council's portal-specific radio list, ordered as they appear on screen.
   *  The submission agent uses this list to verify it's seeing the right
   *  page (drift check) before clicking. */
  readonly portalGrounds: readonly string[];
  /** Canonical-ground → portal-radio-label translation. The value MUST
   *  match a string in `portalGrounds` exactly. */
  readonly translate: Partial<Record<CanonicalGroundId, string>>;
  /** Catch-all label used when none of the appeal's canonical grounds has
   *  a per-council entry. Typically the council's "Other reasons" row. */
  readonly fallbackLabel: string;
  /** Optional source-of-truth pointer — file path or URL where the
   *  portal-grounds list was captured. */
  readonly verifiedAgainst?: string;
}
```

## Registry helpers

`apps/web/lib/server/submission/grounds/registry.ts` exposes:

- `getCouncilGroundsMapping(councilSlug)` — returns the mapping or `null` if the council isn't registered. Submission engine consults this before deciding whether to drive a portal challenge.
- `resolveCouncilGroundLabel(councilSlug, canonicalGrounds[])` — pre-resolves the chosen portal row. Tries each canonical ground in array order (first match wins); falls back to `fallbackLabel` when nothing matches. Returns `{ label, source: CanonicalGroundId | null, mapping }`. Returns `null` only when the council itself isn't registered.
- `renderTranslationRule(mapping)` — renders the translate table as a markdown bullet list for embedding inside the submission prompt. The LLM uses this as a deterministic source-of-truth if the pre-resolved label fails (e.g. portal drift renamed a row mid-session).
- `renderPortalGroundsList(mapping)` — renders the council's full radio list as a numbered audit hint. The agent cross-checks row count + text before clicking to verify it's on the right page.
- `listRegisteredCouncils()` — returns the slugs of every registered mapping (for admin UI / drift dashboards).

## Lambeth — the first concrete entry

`apps/web/lib/server/submission/grounds/lambeth.ts` ships the only mapping today. The 10 portal rows + 11-canonical mapping were hand-verified against four real Lambeth portal screenshots on 2026-05-26 (step 1 grounds list, step 2 details textarea, step 3 contact form, step 3 populated with a real test ticket). The `verifiedAgainst:` field carries the provenance pointer.

Notable mapping decisions:

- `signage-unclear` → "The Traffic Management Order is invalid". Imperial Civil Enforcement portals collapse signage issues under TMO validity — an unreadable sign means the TMO can't be enforced.
- `valid-permit` / `blue-badge` / `loading-unloading` / `breakdown` / `medical-emergency` → all collapse to the council's "I wish to challenge this PCN for other reasons" fallback row. These are circumstance-based grounds without a dedicated statutory radio; the actual argument lives in the step-2 textarea (the letter body).

## How it's consumed

The Lambeth submission prompt (`lib/server/submission/prompts/lambeth.ts`) imports from the registry and composes the TRANSLATION RULE + portal audit blocks **at module load**:

```ts
import { renderTranslationRule, renderPortalGroundsList } from "../grounds/registry";
import { LAMBETH_GROUNDS } from "../grounds/lambeth";

const TRANSLATION_RULE_BLOCK = renderTranslationRule(LAMBETH_GROUNDS);
const PORTAL_GROUNDS_AUDIT_LIST = renderPortalGroundsList(LAMBETH_GROUNDS);

export const LAMBETH_AGENT_PROMPT = `…
${PORTAL_GROUNDS_AUDIT_LIST}
…
${TRANSLATION_RULE_BLOCK}
…`;
```

`LAMBETH_FIELD_HINTS.groundsRadioOptions` references `LAMBETH_GROUNDS.portalGrounds` directly. The admin MCP editor at `/admin/councils/lambeth/automation` shows the rendered prompt — edit the registry, not the prompt, to change the mapping.

## Onboarding a new council

When a council's portal screenshots arrive (Westminster / Camden / RBKC / Islington / TfL / City of London are the queue):

1. **Capture screenshots** of the council's challenge wizard — at minimum the grounds-list step. Step 2 (details) + step 3 (contact) are useful for the submission prompt itself.
2. **Create `grounds/<slug>.ts`** with the `CouncilGroundsMapping` shape filled in:
   - `councilSlug` matches `councils.slug` in the DB.
   - `portalGrounds`: every radio row, verbatim, in display order.
   - `translate`: pick the closest portal row for each of the 11 `CanonicalGroundId`s. Use the council's "Other reasons" row as the fallback for circumstance-based grounds without a dedicated statutory row.
   - `fallbackLabel`: the same "Other reasons" row.
   - `verifiedAgainst`: pointer to the screenshot batch (e.g. `"Portal screenshots 2026-05-26 (step 1 grounds page)"`).
3. **Register it** in `grounds/registry.ts`:
   ```ts
   import { CAMDEN_GROUNDS } from "./camden";
   const REGISTRY: Record<string, CouncilGroundsMapping> = {
     [LAMBETH_GROUNDS.councilSlug]: LAMBETH_GROUNDS,
     [CAMDEN_GROUNDS.councilSlug]: CAMDEN_GROUNDS,
   };
   ```
4. **Wire the council's submission prompt** to import + render from the registry — copy the Lambeth prompt's `renderTranslationRule(…)` / `renderPortalGroundsList(…)` pattern.
5. **Dry-run** via `/admin/councils/<slug>/automation` against a known-good PCN + reg before promoting the council from `manual` → `automated_beta`.

## Pre-resolution vs LLM fallback

The submission engine has TWO ways to use the registry:

1. **Pre-resolved label as a hint in the prompt.** `resolveCouncilGroundLabel(slug, appeal.grounds)` returns the exact portal-row text the agent should click. The prompt can embed this as a "we resolved this to: <label>" hint at the top. **Deterministic, no LLM cost.**
2. **Embedded table as a fallback for drift.** The prompt also embeds the full translate table via `renderTranslationRule(mapping)`. If the pre-resolved label has been renamed by the council mid-session (drift), the LLM can fall back to the table and pick the closest semantic match itself.

Today the Lambeth prompt relies on the rendered table (mode 2). The pre-resolution hook (`resolveCouncilGroundLabel`) is implemented and available for the submission orchestrator to consume when we want deterministic clicks — useful when paired with a deterministic Playwright recipe (Phase 9).

## Cross-refs

- The 11 `CanonicalGroundId`s + the 75-card customer quiz that maps to them: [`legal/grounds-quiz-reference.md`](../legal/grounds-quiz-reference.md).
- The submission engine that consumes the registry: [`architecture/submission-engine.md`](submission-engine.md).
- The deterministic-recipe pattern that pairs naturally with pre-resolution: [`architecture/deterministic-recipes.md`](deterministic-recipes.md).
- The admin grounds-mapping CRUD that doesn't ship yet (deferred until 3+ councils are mapped from screenshots): see "Pickup-here items" in [`handoff.md`](../handoff.md).
