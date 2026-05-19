import { test, expect } from "@playwright/test";

test.describe("API routes", () => {
  test("GET /api/health reports status without leaking secrets", async ({
    request,
  }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toMatchObject({
      status: expect.stringMatching(/^(ready|partial)$/),
      integrations: {
        stripe: expect.stringMatching(/^(ok|missing)$/),
        stripeWebhook: expect.stringMatching(/^(ok|missing)$/),
        aiGateway: expect.stringMatching(/^(ok|missing)$/),
        database: expect.stringMatching(/^(ok|mock_mode)$/),
      },
      capabilities: {
        paywall: expect.any(Boolean),
        drafting: expect.any(Boolean),
        persistence: expect.any(Boolean),
        submission: true, // mock submission always works
      },
      aiModelId: expect.stringContaining("/"),
    });
    // Must NEVER leak actual secret values
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/sk_test|sk_live|whsec_|vck_/);
  });

  test("POST /api/checkout — 400 on malformed body", async ({ request }) => {
    const res = await request.post("/api/checkout", { data: {} });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  test("POST /api/submit — returns mock confirmation in v0.1", async ({
    request,
  }) => {
    const res = await request.post("/api/submit", {
      data: {
        sessionId: "test-session",
        appealId: "appeal-001",
        paymentIntentId: "pi_mock_test",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "submitted",
      method: "portal",
      councilReference: expect.stringMatching(/^MOCK-REF-/),
      submittedAt: expect.any(String),
    });
  });

  test("POST /api/generate — 400 on malformed body", async ({ request }) => {
    const res = await request.post("/api/generate", { data: { foo: "bar" } });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  test("POST /api/stripe/webhook — 400 without signature", async ({
    request,
  }) => {
    const res = await request.post("/api/stripe/webhook", { data: {} });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("MISSING_SIGNATURE");
  });
});
