import { defineConfig, devices } from "@playwright/test";

/**
 * Snappeal E2E test suite — runs against the local Next.js dev server.
 *
 * In CI, the dev server is started by Playwright (`webServer.command`).
 * Locally, if a dev server is already running on :3001 we reuse it
 * (`reuseExistingServer`) so iteration is fast.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // serialise — we hit the live dev server
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
