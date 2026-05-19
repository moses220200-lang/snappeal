"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";

/**
 * Singleton Stripe.js loader — `loadStripe` should only run once per page.
 * Returns null when the publishable key isn't set so the paywall can fall
 * back to a "configure Stripe" placeholder instead of crashing.
 */

let cached: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key || key.startsWith("pk_test_REPLACE")) return Promise.resolve(null);
  if (!cached) cached = loadStripe(key);
  return cached;
}
