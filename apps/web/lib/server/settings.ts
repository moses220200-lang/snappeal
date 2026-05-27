/**
 * Runtime-mutable settings used across the app.
 *
 * Three layers (innermost wins):
 *
 *   1. **Mode-derived defaults.** `getMode()` resolves "dev" or
 *      "production" from `PARKINGRABBIT_MODE` (explicit) or falls back to
 *      `NODE_ENV`. Each setting has a sensible per-mode default — e.g.
 *      `stopAtReview` is ON in dev, OFF in production; `claudeMode`
 *      is 'cli' in dev, 'sdk' in production; `fakePayment` is ON in
 *      dev, OFF in production.
 *
 *   2. **Env-var pins.** A specific env var (`PARKINGRABBIT_MCP_HEADED=1`)
 *      overrides the mode default. Set in `.env.local` (dev) or the
 *      Vercel dashboard (prod).
 *
 *   3. **In-memory overrides.** Admin toggles `/admin/settings` flip
 *      the live process without a restart. Lost on reboot by design —
 *      pin a value permanently via env var. NULL on an override means
 *      "follow env / mode default".
 *
 * **Important**: NO consumer reads `process.env.PARKINGRABBIT_*` directly
 * outside this file. Every callsite goes through `getSettings()` so
 * the three-layer resolution stays in one place. The settings audit
 * (2026-05-26) found three files violating that rule; they're being
 * migrated in P4 of the consolidation.
 */

/* ───── mode ─────
 *
 * Coarse-grained dev vs production switch. Most toggles take their
 * sensible default from this. Setting `PARKINGRABBIT_MODE` explicitly is
 * the cleanest way to pin behaviour for staging environments where
 * NODE_ENV would lie.
 */
export type ParkingRabbitMode = "dev" | "production";

export function getMode(): ParkingRabbitMode {
  const explicit = process.env.PARKINGRABBIT_MODE;
  if (explicit === "production") return "production";
  if (explicit === "dev") return "dev";
  return process.env.NODE_ENV === "production" ? "production" : "dev";
}

/** Mode-derived defaults for every toggle. Centralised so the
 *  resolution table is grokable in one glance. */
function modeDefaults(mode: ParkingRabbitMode) {
  const isDev = mode === "dev";
  return {
    /** Headless Chromium (production-like). Dev can flip headed on. */
    mcpHeaded: false,
    /** Safety brake: in dev, agents stop at the review page and never
     *  click Finish. Production allows real submissions. */
    stopAtReview: isDev,
    /** Live Playwright MCP engine. Same default in both modes; only
     *  flipped off explicitly to use the mock submission path. */
    submissionLive: true,
    /** In-process job queue worker. Always on by default; production
     *  deployments with an external worker box flip it off. */
    workerDisabled: false,
    /** Fake-payment buttons on /app/paywall. Dev only. */
    fakePayment: isDev,
    /** Skip Stripe verification on /api/submit + /api/generate. Dev only. */
    skipPaymentCheck: isDev,
    /** Lookup + dry-run agents take milestone screenshots. Default OFF
     *  in both modes (HTML-scrape is ~3× faster). Admins flip ON for
     *  audit / debugging a portal that's broken. */
    mcpCaptureScreenshots: false,
    /** Claude execution mode. `'cli'` spawns the claude CLI subprocess
     *  (current path; rich CLI features, stable). `'sdk'` uses
     *  @anthropic-ai/sdk directly (faster cold start, native streaming,
     *  real usage objects — but MCP support is stub'd today). Dev keeps
     *  cli to model costs predictably; production will switch to sdk
     *  once the full migration is done. */
    claudeMode: (isDev ? "cli" : "sdk") as "cli" | "sdk",
  } as const;
}

/* ───── runtime override state ─────
 *
 * Each override is independent — `null` means "follow the env-or-mode
 * default", a concrete value pins it.
 */

interface Overrides {
  mcpHeaded: boolean | null;
  stopAtReview: boolean | null;
  submissionLive: boolean | null;
  workerDisabled: boolean | null;
  fakePayment: boolean | null;
  skipPaymentCheck: boolean | null;
  mcpCaptureScreenshots: boolean | null;
  claudeMode: "cli" | "sdk" | null;
}

const overrides: Overrides = {
  mcpHeaded: null,
  stopAtReview: null,
  submissionLive: null,
  workerDisabled: null,
  fakePayment: null,
  skipPaymentCheck: null,
  mcpCaptureScreenshots: null,
  claudeMode: null,
};

/** Read a boolean env var with explicit "1"/"0" semantics. */
function envBool(name: string): boolean | null {
  const v = process.env[name];
  if (v === "1") return true;
  if (v === "0") return false;
  return null;
}

/* ───── resolved getter — what the rest of the app reads ───── */

export interface ParkingRabbitSettings {
  mode: ParkingRabbitMode;
  mcpHeaded: boolean;
  stopAtReview: boolean;
  submissionLive: boolean;
  workerDisabled: boolean;
  fakePayment: boolean;
  skipPaymentCheck: boolean;
  mcpCaptureScreenshots: boolean;
  /** 'cli' = Claude CLI subprocess (current). 'sdk' = direct Anthropic
   *  SDK (planned for production; MCP paths stub'd today). */
  claudeMode: "cli" | "sdk";
}

export function getSettings(): ParkingRabbitSettings {
  const mode = getMode();
  const def = modeDefaults(mode);
  // Resolution order per toggle: override → env pin → mode default.
  const pick = <K extends keyof Overrides>(
    key: K,
    envName: string,
  ): Overrides[K] extends infer V ? NonNullable<V> : never => {
    const o = overrides[key];
    if (o !== null) return o as never;
    const env = envBool(envName);
    if (env !== null) return env as never;
    return def[key as keyof typeof def] as never;
  };
  // claudeMode is a string, not boolean — handle separately.
  const claudeModeEnv =
    process.env.PARKINGRABBIT_CLAUDE_MODE === "cli"
      ? "cli"
      : process.env.PARKINGRABBIT_CLAUDE_MODE === "sdk"
        ? "sdk"
        : null;
  const claudeMode: "cli" | "sdk" =
    overrides.claudeMode ?? claudeModeEnv ?? def.claudeMode;
  return {
    mode,
    mcpHeaded: pick("mcpHeaded", "PARKINGRABBIT_MCP_HEADED"),
    // `PARKINGRABBIT_ALLOW_REAL_SUBMIT=1` is the legacy env: ALLOW means
    // stopAtReview=false. Translate it here so the rest of the app
    // talks in the positive sense ("stopAtReview").
    stopAtReview: (() => {
      if (overrides.stopAtReview !== null) return overrides.stopAtReview;
      const allow = envBool("PARKINGRABBIT_ALLOW_REAL_SUBMIT");
      if (allow !== null) return !allow; // ALLOW=1 → stopAtReview=false
      return def.stopAtReview;
    })(),
    submissionLive: (() => {
      if (overrides.submissionLive !== null) return overrides.submissionLive;
      // Legacy semantics: SUBMISSION_LIVE=0 means OFF; any other value
      // (including unset) means follow the mode default.
      const v = process.env.PARKINGRABBIT_SUBMISSION_LIVE;
      if (v === "0") return false;
      if (v === "1") return true;
      return def.submissionLive;
    })(),
    workerDisabled: pick("workerDisabled", "PARKINGRABBIT_DISABLE_WORKER"),
    fakePayment: pick("fakePayment", "NEXT_PUBLIC_PARKINGRABBIT_FAKE_PAYMENT"),
    skipPaymentCheck: pick("skipPaymentCheck", "PARKINGRABBIT_SKIP_PAYMENT_CHECK"),
    mcpCaptureScreenshots: pick(
      "mcpCaptureScreenshots",
      "PARKINGRABBIT_MCP_SCREENSHOTS",
    ),
    claudeMode,
  };
}

/* ───── setters — bound to the /api/admin/settings route ─────
 *
 * Each setter takes `boolean | null` (or the analogous union for
 * `claudeMode`). NULL reverts to env / mode default — same surface
 * as before. Signature parity means SettingsToggles keeps working.
 */

export function setMcpHeaded(value: boolean | null): void {
  overrides.mcpHeaded = value;
}
export function setStopAtReview(value: boolean | null): void {
  overrides.stopAtReview = value;
}
export function setSubmissionLive(value: boolean | null): void {
  overrides.submissionLive = value;
}
export function setWorkerDisabled(value: boolean | null): void {
  overrides.workerDisabled = value;
}
export function setFakePayment(value: boolean | null): void {
  overrides.fakePayment = value;
}
export function setSkipPaymentCheck(value: boolean | null): void {
  overrides.skipPaymentCheck = value;
}
export function setMcpCaptureScreenshots(value: boolean | null): void {
  overrides.mcpCaptureScreenshots = value;
}
export function setClaudeMode(value: "cli" | "sdk" | null): void {
  overrides.claudeMode = value;
}

/** Convenience for the submission engine: returns the `--headless` flag
 *  array unless headed mode is on. Spread into the `@playwright/mcp`
 *  argv so the toggle takes effect on the next run. */
export function mcpHeadlessFlag(): string[] {
  return getSettings().mcpHeaded ? [] : ["--headless"];
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
    | "Storage"
    | "Misc";
  sensitivity: EnvSensitivity;
  required?: boolean;
  description?: string;
}

export const ENV_INVENTORY: EnvKeyDescriptor[] = [
  // Auth
  { name: "AUTH_SECRET", category: "Auth", sensitivity: "secret", required: true, description: "32+ chars. JWT signing key for parkingrabbit.token cookie." },
  { name: "NEXT_PUBLIC_SITE_URL", category: "Auth", sensitivity: "public", description: "Public site URL for metadataBase + share cards." },
  { name: "NEXT_PUBLIC_APP_URL", category: "Auth", sensitivity: "public", description: "Public app URL for Stripe redirect callbacks." },
  // Database
  { name: "DATABASE_URL", category: "Database", sensitivity: "secret", required: true, description: "Postgres connection string." },
  // Storage
  { name: "BLOB_READ_WRITE_TOKEN", category: "Storage", sensitivity: "secret", description: "Vercel Blob token for warden photo persistence. Falls back to /dev-blobs on disk when unset." },
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
  { name: "PARKINGRABBIT_GENERATE_CONCURRENCY", category: "Claude / AI", sensitivity: "config", description: "Max concurrent /api/generate calls (default 4)." },
  // Stripe
  { name: "STRIPE_SECRET_KEY", category: "Stripe", sensitivity: "secret", description: "sk_test_* in dev / sk_live_* in prod." },
  { name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", category: "Stripe", sensitivity: "public" },
  { name: "STRIPE_WEBHOOK_SECRET", category: "Stripe", sensitivity: "secret" },
  { name: "STRIPE_CARE_PLAN_PRICE_ID", category: "Stripe", sensitivity: "config", description: "Care Plan Stripe Price ID." },
  // Submission engine
  { name: "PARKINGRABBIT_MODE", category: "Submission engine", sensitivity: "config", description: "Explicit mode pin: 'dev' or 'production'. Overrides the NODE_ENV-based default. Use for staging environments." },
  { name: "PARKINGRABBIT_CLAUDE_MODE", category: "Submission engine", sensitivity: "config", description: "'cli' (Claude CLI subprocess, current) or 'sdk' (direct Anthropic SDK, planned). Defaults follow mode: cli in dev, sdk in production." },
  { name: "PARKINGRABBIT_SUBMISSION_LIVE", category: "Submission engine", sensitivity: "config", description: "Anything-but-\"0\" = LIVE Playwright MCP; \"0\" = deterministic mock." },
  { name: "PARKINGRABBIT_ALLOW_REAL_SUBMIT", category: "Submission engine", sensitivity: "config", description: "Safety brake — only when ON does the agent click Finish. Inverted into `stopAtReview` internally." },
  { name: "PARKINGRABBIT_MCP_HEADED", category: "Submission engine", sensitivity: "config", description: "Run Chromium headed so you can watch the agent drive." },
  { name: "PARKINGRABBIT_MCP_SCREENSHOTS", category: "Submission engine", sensitivity: "config", description: "Set to 1 to force milestone screenshots in lookup agents. Default OFF — HTML-scrape lookups are ~3× faster." },
  { name: "PARKINGRABBIT_DISABLE_WORKER", category: "Submission engine", sensitivity: "config", description: "Skip the in-process worker (use when running it on a separate box)." },
  { name: "PARKINGRABBIT_SKIP_PAYMENT_CHECK", category: "Submission engine", sensitivity: "config" },
  { name: "NEXT_PUBLIC_PARKINGRABBIT_FAKE_PAYMENT", category: "Submission engine", sensitivity: "public", description: "Render the dev fake-payment buttons inside the £2.99 submit PaymentSheet." },
  { name: "NEXT_PUBLIC_PARKINGRABBIT_SHOW_MCP_LIVE_VIEW", category: "Submission engine", sensitivity: "public", description: "When ON, the customer routes into the full MCP live views for validation / drafting / submission. When OFF (default), those run in the background and emit notifications on done. Overridable at runtime via /admin/settings." },
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

/* ───── startup sanity-checks ─────
 *
 * Called once from `instrumentation.ts` at process boot. Logs (does NOT
 * throw) on configurations that almost certainly indicate a misconfig
 * — silent breakage on these combinations is the worst kind.
 */
export function logStartupSanityChecks(): void {
  const s = getSettings();
  if (s.submissionLive && s.workerDisabled) {
    console.warn(
      "[settings] submissionLive=true + workerDisabled=true — appeals will queue forever unless an external worker box is running. Check PARKINGRABBIT_DISABLE_WORKER + PARKINGRABBIT_EXTERNAL_WORKER_URL.",
    );
  }
  if (s.mode === "production" && s.stopAtReview) {
    console.warn(
      "[settings] mode=production + stopAtReview=true — agents will NEVER click Finish on real council portals. Unset PARKINGRABBIT_ALLOW_REAL_SUBMIT to allow real submissions.",
    );
  }
  if (s.mode === "production" && s.fakePayment) {
    console.warn(
      "[settings] mode=production + fakePayment=true — fake payment buttons are rendered in prod. Almost certainly wrong.",
    );
  }
  if (s.mode === "production" && s.skipPaymentCheck) {
    console.warn(
      "[settings] mode=production + skipPaymentCheck=true — Stripe verification is bypassed in prod. Almost certainly wrong.",
    );
  }
  console.info(
    `[settings] mode=${s.mode} claudeMode=${s.claudeMode} submissionLive=${s.submissionLive} stopAtReview=${s.stopAtReview}`,
  );
}
