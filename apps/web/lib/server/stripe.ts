import Stripe from "stripe";
import { requireEnv } from "./env";

let stripeClient: Stripe | null = null;

/**
 * Lazily-instantiated Stripe SDK client.
 * Throws a helpful error if `STRIPE_SECRET_KEY` isn't set at call time —
 * never at import time, so missing keys don't break the build.
 */
export function stripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
      apiVersion: "2025-09-30.clover" as Stripe.LatestApiVersion,
      typescript: true,
      appInfo: { name: "Snappeal", version: "0.1.0" },
    });
  }
  return stripeClient;
}

export const PRICE_PENCE = 299 as const;
export const CURRENCY = "gbp" as const;
