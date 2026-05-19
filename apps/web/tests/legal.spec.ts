import { test, expect } from "@playwright/test";

test.describe("Legal pages", () => {
  test("/privacy renders with required sections", async ({ page }) => {
    await page.goto("/privacy");
    await expect(
      page.getByRole("heading", { name: /Privacy policy/i }),
    ).toBeVisible();
    await expect(page.getByText(/What we collect/i)).toBeVisible();
    await expect(page.getByText(/UK GDPR/i)).toBeVisible();
    await expect(page.getByText(/90 days/i)).toBeVisible();
  });

  test("/terms renders with required sections", async ({ page }) => {
    await page.goto("/terms");
    await expect(
      page.getByRole("heading", { name: /Terms of service/i }),
    ).toBeVisible();
    await expect(page.getByText(/£2\.99/i)).toBeVisible();
    await expect(page.getByText(/non-refundable/i).first()).toBeVisible();
    await expect(page.getByText(/England and Wales/i)).toBeVisible();
  });

  test("footer links to privacy + terms work from landing", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Privacy", exact: true }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await page.goBack();
    await page.getByRole("link", { name: "Terms", exact: true }).click();
    await expect(page).toHaveURL(/\/terms$/);
  });
});
