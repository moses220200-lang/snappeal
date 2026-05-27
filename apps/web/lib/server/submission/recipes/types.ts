/**
 * Deterministic Playwright recipes for council-portal lookups.
 *
 * Architecture:
 *   - One recipe per council slug. Each recipe is a small TypeScript
 *     function that drives the council's portal via `playwright` (NOT
 *     the MCP wrapper). Zero Claude cost — just a Chromium run.
 *   - At every step the recipe checks DOM signatures (button text,
 *     form field labels, key element shapes) against a stored
 *     baseline. On mismatch the recipe returns `{ drift: true }` and
 *     the runner falls back to the Claude MCP lookup (today's path).
 *   - On success the recipe returns the same shape Claude would have
 *     produced — verdict, metadata, photo URLs — so the rest of the
 *     pipeline (snapshot persist, push dispatch, card render) is
 *     identical.
 *
 * Why this is the right pattern:
 *   - Council portals don't change often (~once a year for most),
 *     but when they do the deterministic script breaks instantly.
 *     The drift check converts a silent-failure risk into a
 *     loud-fallback signal.
 *   - Cost: a Lambeth Claude lookup is ~$0.30 + 60-120s. A
 *     deterministic recipe is ~$0 + 10-20s. Across thousands of
 *     lookups/day this saves real money.
 *   - The admin sees `ai_calls.mode = 'deterministic'` for the
 *     fast-path rows; drift-fallback rows show `mode = 'cli'` so
 *     a spike in CLI usage signals a portal change.
 *
 * Adding a recipe for a new council: copy `lambeth.ts`, swap the
 * navigation steps + selectors, declare the DOM signatures the
 * recipe relies on at each milestone, register in `registry.ts`.
 */
import type { Page } from "playwright";
import type {
  PortalLookupSnapshot,
  PortalLookupVerdict,
} from "../../db/schema";

/** Input handed to every recipe. */
export interface RecipeInput {
  pcnRef: string;
  vehicleReg: string;
  /** Per-run scratch directory — used for photo downloads when the
   *  council's portal serves warden photos behind a session-cookied
   *  endpoint that Blob's `fetch` can't replay. Optional. */
  workDir?: string;
}

/** Successful recipe outcome — shape matches what Claude would emit
 *  via `runPortalLookup`. Caller wraps this in a full
 *  `PortalLookupSnapshot` (adds jobId + status). */
export interface RecipeSuccess {
  ok: true;
  verdict: PortalLookupVerdict;
  verdictReason: string;
  metadata: NonNullable<PortalLookupSnapshot["metadata"]>;
  photoUrls: string[];
  /** Wall-clock duration in ms. */
  durationMs: number;
}

/** Drift outcome — the recipe found a DOM signature that didn't
 *  match the baseline. The runner falls back to Claude lookup. */
export interface RecipeDrift {
  ok: false;
  drift: true;
  /** Short human-readable explanation: which signature failed where. */
  reason: string;
  /** Which step the drift was detected at (1-indexed). Used by the
   *  admin audit to highlight the breakage. */
  step: number;
  durationMs: number;
}

/** Generic error — recipe didn't complete (browser crashed, timeout,
 *  network blip). Runner falls back to Claude lookup. */
export interface RecipeError {
  ok: false;
  drift: false;
  errorKind: "timeout" | "network" | "browser" | "other";
  reason: string;
  durationMs: number;
}

export type RecipeResult = RecipeSuccess | RecipeDrift | RecipeError;

/** Per-recipe contract. The runner provides a fresh Page; the recipe
 *  drives it and returns the structured result. */
export interface CouncilRecipe {
  /** Stable slug — must match `councils.slug`. */
  readonly slug: string;
  /** Human-readable name for logs + admin audit. */
  readonly displayName: string;
  /** Default execution timeout. Recipes that need to walk multiple
   *  pages can override per-step. */
  readonly timeoutMs: number;
  /** The actual driver. Receives a fresh Chromium Page (already
   *  navigated to about:blank) and the lookup input. */
  run(page: Page, input: RecipeInput): Promise<RecipeResult>;
}

/** Helper used by recipes to fail-with-drift in one line. */
export function drift(
  reason: string,
  step: number,
  startedAt: number,
): RecipeDrift {
  return {
    ok: false,
    drift: true,
    reason,
    step,
    durationMs: Date.now() - startedAt,
  };
}

/** Helper for catch-block recipe errors. */
export function recipeError(
  err: unknown,
  startedAt: number,
  errorKind: RecipeError["errorKind"] = "other",
): RecipeError {
  const message = err instanceof Error ? err.message : String(err);
  return {
    ok: false,
    drift: false,
    errorKind,
    reason: message.slice(0, 200),
    durationMs: Date.now() - startedAt,
  };
}
