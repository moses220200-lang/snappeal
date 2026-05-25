/**
 * Runtime-mutable settings used across the app.
 *
 * Two layers:
 *
 *   1. **Env vars** are the production default — set in `.env.local` (dev)
 *      or the Vercel dashboard (prod). Read once at module load.
 *   2. **In-memory overrides** let an admin flip behaviour from /admin/settings
 *      without a redeploy. Lost on process restart by design — these are
 *      operational knobs, not config.
 *
 * Pin a value permanently by setting the matching env var; the override layer
 * is only ever applied on top of the env-defined default.
 */

/* ───── runtime override state ───── */

interface BooleanOverrides {
  /** Show the Playwright MCP browser window instead of running it headless.
   *  Useful for watching the agent drive a council portal in real time. */
  mcpHeaded: boolean;
  /** Hard safety brake — when ON, the portal-automation agent drives the
   *  council portal up to the REVIEW page but NEVER clicks the final
   *  submit/Finish button. */
  stopAtReview: boolean;
  /** Override the submission engine. `null` = use SNAPPEAL_SUBMISSION_LIVE env. */
  submissionLiveOverride: boolean | null;
  /** Override the in-process worker. `null` = use SNAPPEAL_DISABLE_WORKER env. */
  workerDisabledOverride: boolean | null;
  /** Override the dev fake-payment buttons. `null` = use env. */
  fakePaymentOverride: boolean | null;
  /** Override the Stripe payment-verification skip. `null` = use env. */
  skipPaymentCheckOverride: boolean | null;
  /** Customer-facing toggle (v0.2.10, repurposed v0.2.13). When ON, the
   *  smart ticket card on `/app/tickets/[id]` opens the "Watch live"
   *  disclosure by default and subscribes to screenshot frames. When OFF
   *  (default), the card stays calm — live MCP screenshots are still
   *  available, just behind one tap. The full-page /app/validating /
   *  /app/submitting routes and the GeneratingOverlay are gone; all live
   *  work happens inline on the card. OCR extraction on /app/capture is
   *  NEVER gated by this flag. */
  showMcpLiveView: boolean;
}

const state: BooleanOverrides = {
  mcpHeaded: process.env.SNAPPEAL_MCP_HEADED === "1",
  stopAtReview: process.env.SNAPPEAL_ALLOW_REAL_SUBMIT !== "1",
  submissionLiveOverride: null,
  workerDisabledOverride: null,
  fakePaymentOverride: null,
  skipPaymentCheckOverride: null,
  // Default ON — customers should see the live agent stream out of the
  // box (matches the experience the team validated in end-to-end runs).
  // Admin can flip OFF via /admin/settings or pin the env to "0" to
  // restore the calm-destination behaviour.
  showMcpLiveView: process.env.NEXT_PUBLIC_SNAPPEAL_SHOW_MCP_LIVE_VIEW !== "0",
};

/* ───── resolved getters — what the rest of the app actually reads ───── */

export interface SnappealSettings {
  mcpHeaded: boolean;
  stopAtReview: boolean;
  /** Effective: env unless override pinned. */
  submissionLive: boolean;
  workerDisabled: boolean;
  fakePayment: boolean;
  skipPaymentCheck: boolean;
  showMcpLiveView: boolean;
}

export function getSettings(): SnappealSettings {
  return {
    mcpHeaded: state.mcpHeaded,
    stopAtReview: state.stopAtReview,
    submissionLive:
      state.submissionLiveOverride ?? process.env.SNAPPEAL_SUBMISSION_LIVE !== "0",
    workerDisabled:
      state.workerDisabledOverride ?? process.env.SNAPPEAL_DISABLE_WORKER === "1",
    fakePayment:
      state.fakePaymentOverride ?? process.env.NEXT_PUBLIC_SNAPPEAL_FAKE_PAYMENT === "1",
    skipPaymentCheck:
      state.skipPaymentCheckOverride ?? process.env.SNAPPEAL_SKIP_PAYMENT_CHECK === "1",
    showMcpLiveView: state.showMcpLiveView,
  };
}

/* ───── setters — bound to the /api/admin/settings route ───── */

export function setMcpHeaded(value: boolean): void {
  state.mcpHeaded = value;
}
export function setStopAtReview(value: boolean): void {
  state.stopAtReview = value;
}
export function setSubmissionLive(value: boolean | null): void {
  state.submissionLiveOverride = value;
}
export function setWorkerDisabled(value: boolean | null): void {
  state.workerDisabledOverride = value;
}
export function setFakePayment(value: boolean | null): void {
  state.fakePaymentOverride = value;
}
export function setSkipPaymentCheck(value: boolean | null): void {
  state.skipPaymentCheckOverride = value;
}
export function setShowMcpLiveView(value: boolean): void {
  state.showMcpLiveView = value;
}

/** Convenience for the submission engine: returns the `--headless` flag
 *  array unless the admin has toggled headed mode on. Spread this into the
 *  `@playwright/mcp` argv so the toggle takes effect immediately on the
 *  next submission. */
export function mcpHeadlessFlag(): string[] {
  return state.mcpHeaded ? [] : ["--headless"];
}

/* ───── env-key inventory — surfaced in the admin settings UI ─────
 *
 *  Each entry maps an env var to a human-readable category + sensitivity.
 *  The /admin/settings page renders the inventory along with whether each
 *  key is currently set (without ever revealing the value of a secret). */

export type EnvSensitivity = "secret" | "public" | "config";

export interface EnvKeyDescriptor {
  name: string;
  category:
    | "Auth"
    | "Database"
    | "Claude / AI"
    | "Stripe"
    | "Submission engine"
    | "Inbound mail"
    | "Web Push"
    | "OAuth"
    | "Wiki"
    | "Address autocomplete"
    | "Misc";
  sensitivity: EnvSensitivity;
  required?: boolean;
  description?: string;
}

export const ENV_INVENTORY: EnvKeyDescriptor[] = [
  // Auth
  { name: "AUTH_SECRET", category: "Auth", sensitivity: "secret", required: true, description: "32+ chars. JWT signing key for snappeal.token cookie." },
  { name: "NEXT_PUBLIC_SITE_URL", category: "Auth", sensitivity: "public", description: "Public site URL for metadataBase + share cards." },
  { name: "NEXT_PUBLIC_APP_URL", category: "Auth", sensitivity: "public", description: "Public app URL for Stripe redirect callbacks." },
  // Database
  { name: "DATABASE_URL", category: "Database", sensitivity: "secret", required: true, description: "Postgres connection string." },
  // Claude / AI
  { name: "ANTHROPIC_API_KEY", category: "Claude / AI", sensitivity: "secret", description: "Anthropic key for Claude CLI in headless server mode." },
  { name: "CLAUDE_MODEL", category: "Claude / AI", sensitivity: "config", description: "Override the Claude model (default: claude-sonnet-4-6)." },
  { name: "CLAUDE_BIN", category: "Claude / AI", sensitivity: "config", description: "Override the claude binary path (default: claude on PATH)." },
  { name: "AI_GATEWAY_API_KEY", category: "Claude / AI", sensitivity: "secret", description: "Optional Vercel AI Gateway key (fallback path)." },
  { name: "AI_MODEL_ID", category: "Claude / AI", sensitivity: "config" },
  { name: "OPENAI_API_KEY", category: "Claude / AI", sensitivity: "secret", description: "Voice-note transcription." },
  { name: "TRANSCRIBE_API_KEY", category: "Claude / AI", sensitivity: "secret" },
  { name: "TRANSCRIBE_BASE_URL", category: "Claude / AI", sensitivity: "config" },
  { name: "TRANSCRIBE_MODEL", category: "Claude / AI", sensitivity: "config" },
  { name: "SNAPPEAL_GENERATE_CONCURRENCY", category: "Claude / AI", sensitivity: "config", description: "Max concurrent /api/generate calls (default 4)." },
  // Stripe
  { name: "STRIPE_SECRET_KEY", category: "Stripe", sensitivity: "secret", description: "sk_test_* in dev / sk_live_* in prod." },
  { name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", category: "Stripe", sensitivity: "public" },
  { name: "STRIPE_WEBHOOK_SECRET", category: "Stripe", sensitivity: "secret" },
  { name: "STRIPE_CARE_PLAN_PRICE_ID", category: "Stripe", sensitivity: "config", description: "Care Plan Stripe Price ID." },
  // Submission engine
  { name: "SNAPPEAL_SUBMISSION_LIVE", category: "Submission engine", sensitivity: "config", description: "Anything-but-\"0\" = LIVE Playwright MCP; \"0\" = deterministic mock." },
  { name: "SNAPPEAL_ALLOW_REAL_SUBMIT", category: "Submission engine", sensitivity: "config", description: "Safety brake — only when ON does the agent click Finish." },
  { name: "SNAPPEAL_MCP_HEADED", category: "Submission engine", sensitivity: "config", description: "Run Chromium headed so you can watch the agent drive." },
  { name: "SNAPPEAL_DISABLE_WORKER", category: "Submission engine", sensitivity: "config", description: "Skip the in-process worker (use when running it on a separate box)." },
  { name: "SNAPPEAL_SKIP_PAYMENT_CHECK", category: "Submission engine", sensitivity: "config" },
  { name: "NEXT_PUBLIC_SNAPPEAL_FAKE_PAYMENT", category: "Submission engine", sensitivity: "public", description: "Render the dev fake-payment buttons inside the £2.99 submit PaymentSheet." },
  { name: "NEXT_PUBLIC_SNAPPEAL_SHOW_MCP_LIVE_VIEW", category: "Submission engine", sensitivity: "public", description: "When ON, the customer routes into the full MCP live views for validation / drafting / submission. When OFF (default), those run in the background and emit notifications on done. Overridable at runtime via /admin/settings." },
  // Inbound mail
  { name: "INBOUND_WEBHOOK_SECRET", category: "Inbound mail", sensitivity: "secret", description: "REQUIRED in production. Shared secret on /api/inbound." },
  { name: "EMAIL_PROVIDER", category: "Inbound mail", sensitivity: "config" },
  { name: "RESEND_API_KEY", category: "Inbound mail", sensitivity: "secret" },
  // Web Push
  { name: "NEXT_PUBLIC_VAPID_PUBLIC_KEY", category: "Web Push", sensitivity: "public" },
  { name: "VAPID_PRIVATE_KEY", category: "Web Push", sensitivity: "secret" },
  // OAuth
  { name: "APPLE_CLIENT_ID", category: "OAuth", sensitivity: "config" },
  { name: "APPLE_TEAM_ID", category: "OAuth", sensitivity: "config" },
  { name: "APPLE_KEY_ID", category: "OAuth", sensitivity: "config" },
  { name: "APPLE_CLIENT_SECRET", category: "OAuth", sensitivity: "secret" },
  { name: "GOOGLE_CLIENT_ID", category: "OAuth", sensitivity: "config" },
  { name: "GOOGLE_CLIENT_SECRET", category: "OAuth", sensitivity: "secret" },
  // Wiki
  { name: "NEXT_PUBLIC_WIKI_URL", category: "Wiki", sensitivity: "public", description: "MkDocs URL embedded into /admin/wiki." },
  // Address autocomplete
  { name: "NEXT_PUBLIC_GETADDRESS_API_KEY", category: "Address autocomplete", sensitivity: "secret", description: "Optional — postcodes.io is used when unset." },
];

export interface EnvKeyStatus extends EnvKeyDescriptor {
  /** Whether the env var is set in the current process. NEVER includes the value. */
  set: boolean;
  /** For non-secret config + public vars, the actual value (truncated). For
   *  secrets always `null`. */
  value: string | null;
}

export function inventoryStatus(): EnvKeyStatus[] {
  return ENV_INVENTORY.map((e) => {
    const raw = process.env[e.name];
    const set = typeof raw === "string" && raw.length > 0;
    const value =
      set && e.sensitivity !== "secret"
        ? (raw as string).length > 60
          ? (raw as string).slice(0, 57) + "…"
          : (raw as string)
        : null;
    return { ...e, set, value };
  });
}
