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
    // We don't pin `apiVersion` — letting the SDK use its compiled-in
    // default avoids breakage when the version string is removed from
    // @types/stripe between releases. Stripe accepts an undefined
    // value and falls back to the account's default API version.
    stripeClient = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
      typescript: true,
      appInfo: { name: "ParkingRabbit", version: "0.2.0" },
    });
  }
  return stripeClient;
}

export const PRICE_PENCE = 299 as const;
export const CURRENCY = "gbp" as const;
