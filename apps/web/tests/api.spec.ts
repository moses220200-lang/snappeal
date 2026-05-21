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
        claudeCli: expect.stringMatching(/^(ok|missing)$/),
        anthropicApiKey: expect.stringMatching(/^(ok|absent_using_oauth)$/),
        database: expect.stringMatching(/^(ok|mock_mode)$/),
        submissionEngine: expect.stringMatching(/^(live|mock)$/),
      },
      capabilities: {
        paywall: expect.any(Boolean),
        drafting: expect.any(Boolean),
        persistence: expect.any(Boolean),
        submission: true,
        inboundMail: expect.any(Boolean),
      },
      claudeModel: expect.stringContaining("claude"),
    });
    // Must NEVER leak actual secret values
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/sk_test|sk_live|whsec_|vck_|sk-ant-/);
  });

  test("POST /api/appeals creates a draft for the supplied sessionId", async ({
    request,
  }) => {
    const sessionId = `test_${Date.now()}`;
    const res = await request.post("/api/appeals", {
      data: { sessionId },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.appeal).toMatchObject({
      id: expect.stringMatching(/^ap_/),
      sessionId,
      status: "draft",
      step: "photos",
      replyEmail: expect.stringContaining("@appeals.parkingrabbit.com"),
    });
  });

  test("GET /api/appeals lists appeals scoped to the sessionId", async ({
    request,
  }) => {
    const sessionId = `test_${Date.now()}`;
    await request.post("/api/appeals", { data: { sessionId } });
    const res = await request.get(`/api/appeals?sessionId=${sessionId}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.appeals)).toBe(true);
    expect(body.appeals.length).toBeGreaterThanOrEqual(1);
    expect(body.appeals[0].sessionId).toBe(sessionId);
  });

  test("POST /api/checkout — 400 on malformed body", async ({ request }) => {
    const res = await request.post("/api/checkout", { data: {} });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  test("POST /api/submit on a real appeal returns queued + creates a submission row", async ({
    request,
  }) => {
    const sessionId = `test_${Date.now()}`;
    const createRes = await request.post("/api/appeals", { data: { sessionId } });
    const appealId = (await createRes.json()).appeal.id as string;

    const res = await request.post("/api/submit", {
      data: { sessionId, appealId, paymentIntentId: "pi_mock_test" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      submissionId: expect.any(String),
      status: expect.stringMatching(/^(queued|submitted)$/),
      method: expect.stringMatching(/^(portal|email|manual)$/),
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

  test("POST /api/auth/sign-up rejects too-short passwords", async ({ request }) => {
    const res = await request.post("/api/auth/sign-up", {
      data: { email: "x@x.com", password: "short" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toMatch(/BAD_REQUEST|SIGN_UP_FAILED/);
  });

  test("POST /api/auth/sign-in with wrong password returns 401", async ({ request }) => {
    const res = await request.post("/api/auth/sign-in", {
      data: { email: "nobody@example.test", password: "wrongpassword12" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
  });

  test("GET /api/auth/me without cookie returns null user", async ({ request }) => {
    const res = await request.get("/api/auth/me");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.user).toBeNull();
  });

  test("GET /api/jobs/[id] for missing job returns 404", async ({ request }) => {
    const res = await request.get("/api/jobs/job_does_not_exist");
    expect(res.status()).toBe(404);
  });

  test("POST /api/care-plan/waitlist accepts a valid email and is idempotent", async ({ request }) => {
    const email = `wl-${Date.now()}@parkingrabbit.test`;
    const first = await request.post("/api/care-plan/waitlist", {
      data: { email, source: "test" },
    });
    expect(first.status()).toBe(200);
    const second = await request.post("/api/care-plan/waitlist", {
      data: { email, source: "test" },
    });
    expect(second.status()).toBe(200);
  });

  test("GET /api/inbound rejects unknown method (or with wrong webhook secret)", async ({ request }) => {
    const res = await request.post("/api/inbound", { data: {} });
    expect([400, 401]).toContain(res.status());
  });
});
