import { NextResponse } from "next/server";
import { SubmitRequest, SubmitResponse, jsonError } from "@/lib/server/contracts";
import { getAppealById, recordSubmission, DatabaseNotConfiguredError } from "@/lib/server/appeals";
import { enqueue } from "@/lib/server/jobs/queue";
import { startWorker } from "@/lib/server/jobs/worker";
import { stripe } from "@/lib/server/stripe";
import { env } from "@/lib/server/env";

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

    if (process.env.SNAPPEAL_SKIP_PAYMENT_CHECK !== "1") {
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
      method: body.preferredMethod ?? "portal",
      channel: body.preferredMethod ?? "portal",
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
      method: body.preferredMethod ?? "portal",
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
