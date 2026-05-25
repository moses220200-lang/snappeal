import { test, expect } from "./_fixtures";

test.describe("In-app /app", () => {
  test("home: AppHeader + 5-tab bottom nav (Home / Tickets / Scan / Inbox / Profile)", async ({
    page,
  }) => {
    await page.goto("/app");
    // Header shows the wordmark + tagline.
    await expect(page.getByText("ParkingRabbit").first()).toBeVisible();
    await expect(
      page.getByText("Manage parking tickets quickly").first(),
    ).toBeVisible();

    // Five tabs present + reachable by their accessible name.
    for (const label of ["Home", "Tickets", "Scan", "Inbox", "Profile"]) {
      await expect(
        page.getByRole("link", { name: label, exact: true }).first(),
      ).toBeVisible();
    }
  });

  test("home: three action heroes (Deal with / Challenge / Pay) visible", async ({
    page,
  }) => {
    await page.goto("/app");
    // Each hero card surfaces its title + CTA.
    await expect(page.getByRole("heading", { name: /Deal with/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Challenge a ticket/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Pay a ticket/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Start now/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Start appeal/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Pay now/i }).first()).toBeVisible();
  });

  test("Tickets tab routes to /app/tickets with current filter pills", async ({
    page,
  }) => {
    await page.goto("/app");
    await page.getByRole("link", { name: "Tickets", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/tickets$/);
    // Filter pills are the primary landmark — there's no page-title CTA.
    // Reviewing rolled into Challenging (one customer journey) post-audit
    // 2026-05-21. Names use `exact: false` because filter chips embed a
    // count badge (e.g. "All 4") when appeals exist.
    for (const label of ["All", "To Pay", "Challenging", "Resolved"]) {
      await expect(
        page.getByRole("button", { name: label, exact: false }),
      ).toBeVisible();
    }
  });

  test("Scan tab routes to /app/capture viewfinder + three method tiles", async ({
    page,
  }) => {
    await page.goto("/app");
    await page.getByRole("link", { name: "Scan", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/capture$/);
    await expect(
      page.getByRole("heading", { name: "Add your parking ticket", exact: false }),
    ).toBeVisible();
    await expect(page.getByText("Scan Ticket")).toBeVisible();
    await expect(page.getByText("Upload Photos")).toBeVisible();
    await expect(page.getByText("Enter PCN")).toBeVisible();
  });

  test("Support tab routes to /app/support", async ({ page }) => {
    await page.goto("/app");
    await page.getByRole("link", { name: "Support", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/support$/);
    await expect(
      page.getByRole("heading", { name: "Support", exact: true }),
    ).toBeVisible();
  });

  test("Profile tab shows guest card + sign-in/create CTAs", async ({ page }) => {
    await page.goto("/app/profile");
    await expect(page.getByText("Guest", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Sign in/i }).first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Create an account/i }).first(),
    ).toBeVisible();
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

  test("Care Plan upsell from Profile shows £9.99 + unlimited appeals copy", async ({
    page,
  }) => {
    await page.goto("/app/profile/care-plan");
    await expect(page.getByText("£9.99").first()).toBeVisible();
    await expect(page.getByText(/Unlimited appeals/i).first()).toBeVisible();
  });

  test("/app/cases (legacy) 404s (route was renamed to /app/tickets)", async ({
    page,
  }) => {
    const response = await page.goto("/app/cases");
    expect(response?.status()).toBe(404);
  });

  test("/admin requires sign-in — guests redirect to /sign-in", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
