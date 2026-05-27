import { NextResponse } from "next/server";
import {
  CheckoutRequest,
  CheckoutResponse,
  jsonError,
} from "@/lib/server/contracts";
import { stripe, PRICE_PENCE, CURRENCY } from "@/lib/server/stripe";

export const runtime = "nodejs";

/**
 * POST /api/checkout
 *
 * Creates a Stripe PaymentIntent for £2.99 GBP, returns the client secret
 * so the frontend can mount the Payment Element (Apple Pay / Google Pay /
 * card). The PaymentIntent is anonymous (no Stripe customer record) — the
 * v0.1 product is account-less.
 *
 * The `sessionId` in the request body is stored on the PaymentIntent's
 * metadata so the webhook can correlate the payment back to an appeal
 * once the user confirms.
 */
export async function POST(request: Request) {
  let body: CheckoutRequest;
  try {
    const json = await request.json();
    body = CheckoutRequest.parse(json);
  } catch (err) {
    return NextResponse.json(
      jsonError("BAD_REQUEST", "Invalid checkout request body", String(err)),
      { status: 400 },
    );
  }

  try {
    const paymentIntent = await stripe().paymentIntents.create({
      amount: PRICE_PENCE,
      currency: CURRENCY,
      automatic_payment_methods: { enabled: true },
      description: "ParkingRabbit — automated London PCN appeal",
      statement_descriptor_suffix: "PARKINGRABBIT APPEAL",
      receipt_email: body.email,
      metadata: {
        session_id: body.sessionId,
        product: "parkingrabbit_appeal_v0_1",
      },
    });

    const response: CheckoutResponse = {
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id,
      amountPence: PRICE_PENCE,
      currency: CURRENCY,
    };

    return NextResponse.json(response);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create PaymentIntent";
    return NextResponse.json(
      jsonError("STRIPE_ERROR", message),
      { status: 500 },
    );
  }
}
