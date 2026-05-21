import { test as base, expect } from "@playwright/test";

/**
 * ParkingRabbit test fixtures.
 *
 * Pre-seeds `sessionStorage` and `localStorage` so:
 *   - The 3-second splash animation never runs (flag set to "1").
 *   - The install banner is treated as already-dismissed (recent).
 *
 * Without these, every test would either wait 3s for the splash to clear
 * or risk clicking through to the install banner's overlay.
 *
 * Use `import { test, expect } from "./_fixtures";` in spec files.
 */
// Playwright's fixture API takes a callback called `use` — same name as
// React's reserved hook. The lint rule for hooks fires a false positive
// here. Suppress at the function boundary; this file is test-only.
/* eslint-disable react-hooks/rules-of-hooks */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem("snappeal.splashShown", "1");
        // Set dismissedAt to "now" — banner sleeps for 7 days
        localStorage.setItem(
          "snappeal.installBanner.dismissedAt",
          String(Date.now()),
        );
        // First-launch wizard pre-completed so it doesn't intercept clicks.
        localStorage.setItem("snappeal.wizardDone", "1");
      } catch {
        /* ignore — quota or privacy mode */
      }
    });
    await use(page);
  },
});
/* eslint-enable react-hooks/rules-of-hooks */

export { expect };
