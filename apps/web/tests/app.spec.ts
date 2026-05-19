import { test, expect } from "./_fixtures";

test.describe("In-app /app", () => {
  test("home: AppHeader + 5-tab bottom nav (Home / Tickets / Camera / Inbox / Profile)", async ({
    page,
  }) => {
    await page.goto("/app");
    // Header shows the wordmark and the tagline.
    await expect(page.getByText("Snappeal").first()).toBeVisible();
    await expect(
      page.getByText("Challenge your parking ticket in minutes").first(),
    ).toBeVisible();

    // All five tabs present + accessible by their aria-label / role.
    for (const label of ["Home", "Tickets", "Camera", "Inbox", "Profile"]) {
      await expect(
        page.getByRole("link", { name: label, exact: true }).first(),
      ).toBeVisible();
    }
  });

  test("home: three pricing tiers visible (Buy time Free / Full appeal £2.99 / Care Plan £9.99)", async ({
    page,
  }) => {
    await page.goto("/app");
    await expect(page.getByText("Pick your appeal plan", { exact: false })).toBeVisible();
    await expect(page.getByText("Buy time").first()).toBeVisible();
    await expect(page.getByText("Free").first()).toBeVisible();
    await expect(page.getByText("Full appeal").first()).toBeVisible();
    await expect(page.getByText("£2.99").first()).toBeVisible();
    await expect(page.getByText("Care Plan").first()).toBeVisible();
    await expect(page.getByText("£9.99").first()).toBeVisible();
  });

  test("Tickets tab routes to /app/tickets with filter pills", async ({ page }) => {
    await page.goto("/app");
    await page.getByRole("link", { name: "Tickets", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/tickets$/);
    await expect(page.getByRole("heading", { name: "Your Tickets", exact: false })).toBeVisible();
    // Filter pills
    for (const label of ["All", "In Progress", "Awaiting Decision", "Won", "Lost"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
  });

  test("Camera tab routes to /app/capture viewfinder + three method tiles", async ({ page }) => {
    await page.goto("/app");
    await page.getByRole("link", { name: "Camera", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/capture$/);
    await expect(page.getByRole("heading", { name: "Add your parking ticket", exact: false })).toBeVisible();
    await expect(page.getByText("Scan Ticket")).toBeVisible();
    await expect(page.getByText("Upload Photos")).toBeVisible();
    await expect(page.getByText("Enter PCN")).toBeVisible();
  });

  test("Inbox tab routes to /app/inbox", async ({ page }) => {
    await page.goto("/app");
    await page.getByRole("link", { name: "Inbox", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/inbox$/);
    await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
  });

  test("Profile tab shows guest card + sign-in/create CTAs", async ({ page }) => {
    await page.goto("/app/profile");
    await expect(page.getByText("Guest", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Sign in/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Create an account/i }).first()).toBeVisible();
  });

  test("Profile sub-pages all route correctly", async ({ page }) => {
    await page.goto("/app/profile");
    for (const [label, path] of [
      ["Personal details", "/app/profile/personal-details"],
      ["Vehicles", "/app/profile/vehicles"],
      ["Notification preferences", "/app/profile/notifications"],
      ["Payment methods", "/app/profile/payment-methods"],
      ["Help & Support", "/app/profile/help"],
    ] as const) {
      await page.goto("/app/profile");
      await page.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/") + "$"));
    }
  });

  test("Care Plan upsell from Profile goes to /app/profile/care-plan with £9.99 + unlimited copy", async ({
    page,
  }) => {
    await page.goto("/app/profile/care-plan");
    await expect(page.getByText("£9.99")).toBeVisible();
    await expect(page.getByText(/unlimited grounds-based appeals/i)).toBeVisible();
  });

  test("/app/cases (legacy) 404s (route was renamed to /app/tickets)", async ({ page }) => {
    const response = await page.goto("/app/cases");
    expect(response?.status()).toBe(404);
  });

  test("/admin requires sign-in — guests redirect to /sign-in", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
