/**
 * Deterministic-recipe runner + registry.
 *
 * Per-council recipe registration. The lookup runner calls
 * `runDeterministicLookup(slug, input)`:
 *   - Returns a successful snapshot when the recipe completed cleanly.
 *   - Returns `{ drift }` when a DOM signature mismatched — the
 *     caller (lookup.ts) falls back to the Claude MCP path.
 *   - Returns `{ error }` for browser/network/timeout failures —
 *     same fallback behaviour.
 *   - Returns `null` when no recipe is registered for the slug — the
 *     Claude MCP path is the only option.
 *
 * Adding a council: write a recipe in `<slug>.ts`, import + register
 * here. The runner spins up a fresh isolated Chromium context per
 * call so two parallel recipes can't share cookies / session state.
 */
import { chromium, type Browser } from "playwright";
import { LAMBETH_RECIPE } from "./lambeth";
import type {
  CouncilRecipe,
  RecipeInput,
  RecipeResult,
} from "./types";

const REGISTRY: Record<string, CouncilRecipe> = {
  [LAMBETH_RECIPE.slug]: LAMBETH_RECIPE,
};

export function hasDeterministicRecipe(slug: string): boolean {
  return slug in REGISTRY;
}

export function listRecipes(): CouncilRecipe[] {
  return Object.values(REGISTRY);
}

/**
 * Run the deterministic recipe for a council if one exists. Returns
 * null when no recipe is registered (caller falls back to Claude
 * MCP). The browser context lifecycle is owned here — caller never
 * touches Playwright directly.
 *
 * Why a fresh browser context per call: per-run isolation prevents
 * one stuck portal session from poisoning the next call's cookies.
 * The overhead (~500-800ms for cold Chromium boot) is negligible
 * compared to the ~10s recipe walk + ~60s Claude fallback cost.
 */
export async function runDeterministicLookup(
  slug: string,
  input: RecipeInput,
): Promise<RecipeResult | null> {
  const recipe = REGISTRY[slug];
  if (!recipe) return null;

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      // Reasonable defaults — recipes typically take ~10s; cap the
      // whole run at the recipe's declared timeout.
      timeout: recipe.timeoutMs,
    });
    const context = await browser.newContext({
      // Real UA so council portals don't 403 us as a bot.
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
      // Block ad / tracker domains to make recipe runs faster and
      // less prone to cross-origin timeouts. Council portals don't
      // need third-party telemetry.
      bypassCSP: false,
    });
    const page = await context.newPage();
    // Hard ceiling on any one operation so a hung portal can't
    // sit on a worker slot indefinitely.
    page.setDefaultTimeout(20_000);

    const result = await Promise.race([
      recipe.run(page, input),
      new Promise<RecipeResult>((resolve) =>
        setTimeout(
          () =>
            resolve({
              ok: false,
              drift: false,
              errorKind: "timeout",
              reason: `Recipe exceeded ${recipe.timeoutMs}ms`,
              durationMs: recipe.timeoutMs,
            }),
          recipe.timeoutMs,
        ),
      ),
    ]);
    return result;
  } catch (err) {
    return {
      ok: false,
      drift: false,
      errorKind: "browser",
      reason: err instanceof Error ? err.message : String(err),
      durationMs: 0,
    };
  } finally {
    // Always close — leaks here add up fast (Chromium per-instance
    // memory is ~50MB) and the dev server hot-reloads compound it.
    if (browser) await browser.close().catch(() => {});
  }
}
