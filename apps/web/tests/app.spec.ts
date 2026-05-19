import { test, expect } from "./_fixtures";

test.describe("In-app /app", () => {
  test("home: greeting + 5-tab bottom nav (Home / Tickets / Camera / Tips / Profile)", async ({
    page,
  }) => {
    await page.goto("/app");
    await expect(
      page.getByRole("heading", { name: /Hello, Alex/i }),
    ).toBeVisible();

    // All five tabs present + accessible by their aria-label / role
    for (const label of ["Home", "Tickets", "Camera", "Tips", "Profile"]) {
      await expect(
        page.getByRole("link", { name: label, exact: true }).first(),
      ).toBeVisible();
    }
  });

  test("Tickets tab navigates to /app/tickets and shows the list", async ({
    page,
  }) => {
    await page.goto("/app");
    await page.getByRole("link", { name: "Tickets", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/tickets$/);
    await expect(
      page.getByRole("heading", { name: "Tickets", exact: true }),
    ).toBeVisible();
  });

  test("Tips tab navigates to /app/tips and shows the featured tip", async ({
    page,
  }) => {
    await page.goto("/app");
    await page.getByRole("link", { name: "Tips", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/tips$/);
    await expect(page.getByText(/Appeal within 14 days/i)).toBeVisible();
  });

  test("Camera tab navigates to /app/capture and shows three methods", async ({
    page,
  }) => {
    await page.goto("/app");
    await page.getByRole("link", { name: "Camera", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/capture$/);
    await expect(page.getByText("Scan Ticket")).toBeVisible();
    await expect(page.getByText("Upload Photos")).toBeVisible();
    await expect(page.getByText("Enter PCN")).toBeVisible();
  });

  test("Profile tab shows anonymous-mode banner + sections", async ({
    page,
  }) => {
    await page.goto("/app/profile");
    await expect(page.getByText(/Anonymous mode/i)).toBeVisible();
    // No "Sign in" button in v0.1 (B4 locked decision)
    await expect(page.getByRole("button", { name: /Sign in/i })).toHaveCount(0);
  });

  test("ticket detail renders timeline + back link works", async ({ page }) => {
    await page.goto("/app/tickets/appeal-001");
    // Header carries the PCN ref
    await expect(
      page.getByRole("heading", { name: /WC12345678/i }),
    ).toBeVisible();
    // Council name appears as a heading inside the ticket summary card
    await expect(
      page.getByText("Westminster City Council").first(),
    ).toBeVisible();
    // Back link returns to list
    await page.getByRole("link", { name: /Back/i }).first().click();
    await expect(page).toHaveURL(/\/app\/tickets$/);
  });

  test("legacy /app/cases 404s (route was renamed)", async ({ page }) => {
    const response = await page.goto("/app/cases");
    expect(response?.status()).toBe(404);
  });
});
