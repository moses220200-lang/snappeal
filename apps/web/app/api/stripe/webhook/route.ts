import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/server/stripe";
import { requireEnv } from "@/lib/server/env";

export const runtime = "nodejs";
/** Stripe webhooks must always be processed; never skip on warm-up. */
export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/webhook
 *
 * Verifies the Stripe signature, then dispatches by event type. We care
 * about three events for v0.1:
 *   - payment_intent.succeeded   → unlock /api/generate for that session
 *   - payment_intent.payment_failed → notify the client to retry
 *   - charge.refunded            → mark the appeal as refunded
 *
 * Persistence: when DATABASE_URL is set we write to Postgres. Until then
 * the handler still verifies + acks the webhook so Stripe stops retrying.
 */
export async function POST(request: Request) {
  const headerList = await headers();
  const sig = headerList.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: { code: "MISSING_SIGNATURE", message: "stripe-signature header required" } },
      { status: 400 },
    );
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(
      rawBody,
      sig,
      requireEnv("STRIPE_WEBHOOK_SECRET"),
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_SIGNATURE",
          message: err instanceof Error ? err.message : "Bad signature",
        },
      },
      { status: 400 },
    );
  }

  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      // TODO (v0.2): update `payments` row in Postgres + flag the matching
      // appeal as `paid`. v0.1 logs only; the frontend already knows the
      // PaymentIntent succeeded from `stripe.confirmPayment` directly.
      console.info("[stripe] payment succeeded", {
        paymentIntentId: pi.id,
        sessionId: pi.metadata.session_id,
        amountPence: pi.amount,
      });
      break;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      console.warn("[stripe] payment failed", {
        paymentIntentId: pi.id,
        reason: pi.last_payment_error?.message,
      });
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      console.info("[stripe] refunded", {
        chargeId: charge.id,
        paymentIntentId:
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id,
        amountRefundedPence: charge.amount_refunded,
      });
      break;
    }
    default:
      // Ignore non-relevant events — Stripe expects 2xx anyway.
      break;
  }

  return NextResponse.json({ received: true });
}
