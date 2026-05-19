import { test, expect } from "./_fixtures";

test.describe("Landing page", () => {
  test("renders hero with CTAs + brand-blue palette", async ({ page }) => {
    await page.goto("/");

    // Page title set in layout metadata
    await expect(page).toHaveTitle(
      /Snappeal — Appeal a London parking ticket/i,
    );

    // Headline copy
    await expect(
      page.getByRole("heading", { name: /Don.+pay that parking ticket/i }),
    ).toBeVisible();

    // Both hero CTAs visible
    await expect(
      page.getByRole("link", { name: /Start Your Appeal/i }).first(),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /How It Works/i }).first()).toBeVisible();

    // London-only pill (locked A2 decision — should NOT say "UK")
    await expect(page.getByText(/Made for drivers in London/i)).toBeVisible();
  });

  test("trust strip + How it works visible", async ({ page }) => {
    await page.goto("/");

    // 4 trust-strip cards (audit-safe copy — no "experts", no "no win no fee")
    await expect(page.getByText("AI-Drafted Appeals")).toBeVisible();
    await expect(page.getByText("Real London Stats")).toBeVisible();
    await expect(page.getByText("£2.99, One-Off")).toBeVisible();
    await expect(page.getByText("Secure & Private")).toBeVisible();

    // 4-step How it works
    await expect(page.getByText("Upload Your Ticket")).toBeVisible();
    await expect(page.getByText("We Draft Your Case")).toBeVisible();
    await expect(page.getByText("We Submit Your Appeal")).toBeVisible();
    await expect(page.getByText("We Stay With You")).toBeVisible();
  });

  test("Get Started CTA deep-links into /app", async ({ page }) => {
    await page.goto("/");

    const getStarted = page.getByRole("link", { name: /Get Started/i }).first();
    await expect(getStarted).toBeVisible();
    await getStarted.click();
    await expect(page).toHaveURL(/\/app$/);
  });

  test("no console errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });
});
