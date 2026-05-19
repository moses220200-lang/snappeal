/**
 * Server-side environment access — never imported by client code.
 *
 * Centralises env var reads so missing values fail loudly with helpful
 * messages instead of producing cryptic SDK errors deep inside Stripe / AI
 * Gateway clients.
 */

export const env = {
  /** Required for /api/checkout + /api/stripe/webhook */
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,

  /** Required for /api/generate */
  AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
  /** Optional override of the default Claude model id used for vision + draft */
  AI_MODEL_ID: process.env.AI_MODEL_ID ?? "anthropic/claude-sonnet-4-6",

  /** Optional — when unset, the app runs in mock-data mode */
  DATABASE_URL: process.env.DATABASE_URL,

  /** Per-environment switch */
  NODE_ENV: process.env.NODE_ENV ?? "development",
} as const;

/**
 * Throws a 500 with a clear, copy-pasteable hint when a required env var is
 * missing. Use inside API route handlers, not at module top level (which
 * would crash builds when env isn't set).
 */
export function requireEnv<K extends keyof typeof env>(key: K): string {
  const value = env[key];
  if (!value) {
    throw new Error(
      `[snappeal] Missing required env var ${key}. ` +
        `Set it in apps/web/.env.local — see apps/web/.env.example for the full list.`,
    );
  }
  return String(value);
}

/** True when the user has wired the optional Postgres backend */
export const hasDatabase = (): boolean => Boolean(env.DATABASE_URL);
