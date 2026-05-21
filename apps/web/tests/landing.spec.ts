import { test, expect } from "./_fixtures";

test.describe("Landing page", () => {
  test("renders ParkingRabbit hero + CTAs", async ({ page }) => {
    await page.goto("/");

    // Title set in layout metadata.
    await expect(page).toHaveTitle(/ParkingRabbit/i);

    // Locked decision: London-only.
    await expect(page.getByText(/Made for drivers in London/i)).toBeVisible();

    // Both hero CTAs visible.
    await expect(
      page.getByRole("link", { name: /Free Appeal/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /See How It Works/i }).first(),
    ).toBeVisible();

    // Header CTA into the app.
    await expect(
      page.getByRole("link", { name: /Get Started/i }).first(),
    ).toBeVisible();
  });

  test("Get Started CTA deep-links into /app", async ({ page }) => {
    await page.goto("/");

    const getStarted = page
      .getByRole("link", { name: /Get Started/i })
      .first();
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
