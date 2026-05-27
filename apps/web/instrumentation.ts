/**
 * Next.js instrumentation hook — runs once at server boot. We use it to:
 *   - Log the resolved mode + key settings (one structured line) so
 *     ops can sanity-check what env vars actually took effect.
 *   - Warn on incoherent setting combinations
 *     (production + stopAtReview, etc.) — see logStartupSanityChecks.
 *   - Fire up the in-process job worker so submit_appeal + pcn_lookup
 *     jobs start draining as soon as the API surface is live.
 *
 * Disable the in-process worker with PARKINGRABBIT_DISABLE_WORKER=1 when
 * running the worker out-of-process (e.g. on a dedicated Vercel
 * Function with longer timeouts). All other config is read through
 * `getSettings()` so the single source of truth in `lib/server/settings.ts`
 * stays authoritative — no callsite reads `process.env.PARKINGRABBIT_*`
 * directly outside that file.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // DB env is checked raw here because we haven't loaded `getSettings`
  // yet (it requires the module graph) — and it's a pre-requirement
  // for everything else. Acceptable carve-out for the boot path.
  if (!process.env.DATABASE_URL) return;

  const { getSettings, logStartupSanityChecks } = await import(
    "@/lib/server/settings"
  );
  const settings = getSettings();
  logStartupSanityChecks();

  if (settings.workerDisabled) {
    console.info("[instrumentation] worker disabled (workerDisabled=true)");
    return;
  }
  const { startWorker } = await import("@/lib/server/jobs/worker");
  startWorker();
}
