import { NextResponse } from "next/server";
import { SubmitRequest, SubmitResponse, jsonError } from "@/lib/server/contracts";
import { getAppealById, recordSubmission, DatabaseNotConfiguredError } from "@/lib/server/appeals";
import { enqueue } from "@/lib/server/jobs/queue";
import { startWorker } from "@/lib/server/jobs/worker";
import { stripe } from "@/lib/server/stripe";
import { env } from "@/lib/server/env";
import { canViewAppeal, getRequestSessionId, getViewer } from "@/lib/server/viewer";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/submit
 *
 * Verifies the payment, then enqueues a `submit_appeal` job and returns
 * immediately with `status: queued`. A worker pool picks up the job and
 * runs the per-council submission engine (portal automation via Claude +
 * Playwright MCP, or email fallback). The frontend polls
 * `/api/appeals/[id]` to see the submission row land.
 *
 * Why a queue: portal automation can take minutes per appeal. Without a
 * queue, N concurrent users would spawn N Playwright browsers; with a
 * queue, we cap concurrency, retry on transient failures, and survive a
 * server restart mid-submission.
 */
export async function POST(request: Request) {
  let body: SubmitRequest;
  try {
    body = SubmitRequest.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      jsonError("BAD_REQUEST", "Invalid submit request body", String(err)),
      { status: 400 },
    );
  }

  try {
    const appeal = await getAppealById(body.appealId);
    if (!appeal) {
      return NextResponse.json(jsonError("NOT_FOUND", `Appeal ${body.appealId} not found`), {
        status: 404,
      });
    }

    const viewer = await getViewer();
    const sessionId = getRequestSessionId(request);
    if (!canViewAppeal(viewer, appeal, sessionId)) {
      return NextResponse.json(
        jsonError("FORBIDDEN", `Appeal ${body.appealId} cannot be submitted by this viewer`),
        { status: 403 },
      );
    }

    // Council-portal gate: refuse to spend the user's £2.99 (and a worker
    // slot) on a PCN the council says is already paid / closed / not on
    // record. The verdict-popup override flips status to "overridden",
    // which is the only way past this check.
    const lookup = appeal.portalLookup;
    if (
      lookup &&
      lookup.status !== "overridden" &&
      (lookup.verdict === "paid" ||
        lookup.verdict === "closed" ||
        lookup.verdict === "not_found")
    ) {
      return NextResponse.json(
        jsonError(
          "PCN_NOT_APPEALABLE",
          `Council portal reports this PCN as ${lookup.verdict}; no appeal is possible.`,
        ),
        { status: 409 },
      );
    }

    // v0.2.12 — the customer no longer chooses email vs portal at
    // submit time. The paid AI appeal workflow IS the product; the only
    // public submission path is the £2.99 portal/MCP flow. Email is
    // still reachable inside `runSubmission` as a portal-fallback for
    // unautomated councils, but not as a customer-facing free path.
    // (The earlier v0.2.11 free-email branch is removed.)
    if (process.env.SNAPPEAL_SKIP_PAYMENT_CHECK !== "1") {
      if (!body.paymentIntentId) {
        return NextResponse.json(
          jsonError("BAD_REQUEST", "paymentIntentId required for £2.99 portal submission"),
          { status: 400 },
        );
      }
      if (!env.STRIPE_SECRET_KEY) {
        return NextResponse.json(
          jsonError("STRIPE_NOT_CONFIGURED", "Stripe is not configured"),
          { status: 503 },
        );
      }
      const intent = await stripe().paymentIntents.retrieve(body.paymentIntentId);
      if (intent.status !== "succeeded") {
        return NextResponse.json(
          jsonError("PAYMENT_NOT_SUCCEEDED", `PaymentIntent status: ${intent.status}`),
          { status: 402 },
        );
      }
    }

    // Stamp the appeal as 'submitting' immediately so the UI reflects state.
    await recordSubmission({
      appealId: appeal.id,
      method: "portal",
      channel: "portal",
      status: "queued",
      councilReference: null,
      submittedAt: null,
    });

    startWorker();
    const job = await enqueue({
      kind: "submit_appeal",
      appealId: appeal.id,
      payload: { appealId: appeal.id, paymentIntentId: body.paymentIntentId },
    });

    const response: SubmitResponse = {
      submissionId: job.id,
      status: "queued",
      method: "portal",
      councilReference: null,
      submittedAt: null,
    };
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof DatabaseNotConfiguredError) {
      return NextResponse.json(jsonError("DATABASE_NOT_CONFIGURED", err.message), { status: 503 });
    }
    return NextResponse.json(
      jsonError("INTERNAL", err instanceof Error ? err.message : "Submission failed"),
      { status: 500 },
    );
  }
}
