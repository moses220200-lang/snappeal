/**
 * Drizzle ORM schema for the ParkingRabbit Postgres database.
 *
 * Activated when DATABASE_URL is set (Neon Postgres via Vercel Marketplace
 * in production). Until then the app runs in mock-data mode and never
 * touches the database.
 *
 * Schema matches the mock-data fixture so a swap from fixture → DB is a
 * data-source change, not a contract change.
 */

import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

/* ───── enums ───── */

export const appealStatus = pgEnum("appeal_status", [
  "draft",
  "ready",
  "submitting",
  "submitted",
  "under_review",
  "decision_pending",
  "cancelled",
  "rejected",
]);

export const submissionMethod = pgEnum("submission_method", [
  "portal",
  "email",
  "manual",
]);

export const paymentMethod = pgEnum("payment_method", [
  "apple_pay",
  "google_pay",
  "card",
]);

export const automationStatus = pgEnum("automation_status", [
  "manual",
  "automated_beta",
  "automated_ga",
]);

/* ───── councils (knowledge base) ───── */

export const councils = pgTable("councils", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // borough | corporation | tfl | royal_parks
  appealPortalUrl: text("appeal_portal_url").notNull(),
  appealEmail: text("appeal_email"),
  postalAddress: text("postal_address"),
  submissionMethods: jsonb("submission_methods").$type<string[]>().notNull(),
  identifierHints: jsonb("identifier_hints").$type<string[]>().notNull(),
  pcnRefPattern: text("pcn_ref_pattern"),
  automationStatus: automationStatus("automation_status")
    .notNull()
    .default("manual"),
  automationFormSchema: jsonb("automation_form_schema"),
  notes: text("notes"),
  logoUrl: text("logo_url"),
  logoBg: text("logo_bg"),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ───── council_automation — per-council MCP recipe ───── */
export const councilAutomation = pgTable("council_automation", {
  councilSlug: text("council_slug").primaryKey(),
  /** Markdown prompt fed to the Claude+Playwright MCP submission agent. */
  agentPrompt: text("agent_prompt").notNull(),
  /** Markdown prompt fed to the Claude+Playwright MCP **lookup** agent —
   *  read-only walk of the portal to fetch warden photos + verdict.
   *  Nullable: falls back to FALLBACK_LOOKUP_PROMPT when not seeded. */
  lookupAgentPrompt: text("lookup_agent_prompt"),
  /** Last known good selectors / hints (jsonb so it can evolve). */
  fieldHints: jsonb("field_hints"),
  /** Last dry-run's step trace (event log + final JSON). */
  lastDryRun: jsonb("last_dry_run"),
  lastDryRunAt: timestamp("last_dry_run_at", { withTimezone: true }),
  lastDryRunOk: text("last_dry_run_ok"), // 'true' | 'false' | null
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───── users (email/password auth) ───── */

export const users = pgTable("users", {
  id: text("id").primaryKey(), // ulid-style
  email: text("email").notNull().unique(),
  /** pbkdf2-sha256 hash, stored as `<saltHex>:<hashHex>`. NULL for OAuth-only users. */
  passwordHash: text("password_hash"),
  displayName: text("display_name"),
  role: text("role").notNull().default("user"), // 'user' | 'admin'
  /** Default pricing tier ('buy_time' | 'grounds' | 'care_plan'). Persisted server-side; client mirror in localStorage is convenience-only. */
  serviceTier: text("service_tier").notNull().default("grounds"),
  /** UK postal address fields used by the portal-automation agent when the
   *  council form requires a registered-keeper address. Captured at sign-up
   *  and editable from /app/profile/personal-details. */
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  addressCity: text("address_city"),
  addressPostcode: text("address_postcode"),
  phone: text("phone"),
  /** Transactional notification prefs ({ emailOnCouncilReply, emailOnSubmission, pushOnCouncilReply }). */
  notificationPrefs: jsonb("notification_prefs"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
});

/* ───── subscriptions (Care Plan) ───── */
export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeCustomerId: text("stripe_customer_id"),
  status: text("status").notNull().default("incomplete"),
  product: text("product").notNull().default("care_plan"),
  pricePence: integer("price_pence").notNull().default(999),
  currency: text("currency").notNull().default("gbp"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: text("cancel_at_period_end").notNull().default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───── care_plan_waitlist ───── */
export const carePlanWaitlist = pgTable("care_plan_waitlist", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  /** Optional userId when the joiner was signed in. */
  userId: text("user_id"),
  /** Optional sessionId when the joiner was a guest. */
  sessionId: text("session_id"),
  source: text("source"), // 'profile_page' | 'paywall' | etc.
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───── appeals ───── */

export const appeals = pgTable(
  "appeals",
  {
    id: text("id").primaryKey(), // app-side ulid
    /** Anonymous client session — set on first appeal, persists across guest visits. */
    sessionId: text("session_id").notNull(),
    /** Clerk userId once the guest signs in. NULL = still anonymous. */
    userId: text("user_id"),
    /** Reply-to email alias the council sees on outbound letters / portal forms. */
    replyEmail: text("reply_email"),
    status: appealStatus("status").notNull().default("draft"),
    step: text("step").notNull().default("photos"),
    /** Nullable until /api/generate succeeds. */
    ticket: jsonb("ticket"),
    grounds: jsonb("grounds").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    /** Council-portal lookup snapshot (warden photos + validity verdict).
     *  Populated by the `pcn_lookup` job before the user reaches the
     *  evidence/quiz page. Null when the council is not yet automated. */
    portalLookup: jsonb("portal_lookup").$type<PortalLookupSnapshot | null>(),
    letterSubject: text("letter_subject"),
    letterBody: text("letter_body"),
    letterWordCount: integer("letter_word_count"),
    letterAddressedTo: text("letter_addressed_to"),
    timeline: jsonb("timeline").notNull().default([]),
    councilSlug: text("council_slug").references(() => councils.slug),
    /** Pricing tier for this appeal: 'buy_time' | 'grounds' | 'care_plan'. */
    serviceTier: text("service_tier").notNull().default("grounds"),
    /** Customer-picked submission path (v0.2.11). Nullable until the user
     *  taps an action on the ticket-page recommendation card. Read as:
     *    - `"email"`  → free path; `/api/submit` bypasses the Stripe check
     *                    and routes through `runSubmission(_, { method: "email" })`.
     *    - `"portal"` → £2.99 path; existing PaymentSheet + `submit_appeal` MCP job.
     *    - NULL       → user hasn't picked yet (state B on the ticket page). */
    preferredMethod: text("preferred_method"),
    /** v0.2.15 — per-step processing status. Drives the inline status rows
     *  on the smart ticket card (Reading PCN / Generating recommendation).
     *  Portal lookup status lives on `portalLookup.status` (separate so
     *  each step's error trail stays targeted). */
    processing: jsonb("processing").$type<ProcessingStatus | null>(),
    /** Vercel Blob URL for the uploaded PCN photo. Lets the smart card
     *  show the image inline even after a refresh or cross-device load. */
    pcnImageUrl: text("pcn_image_url"),
    /** PR 3 — AI-strength score (0–100). NULL until the drafter has
     *  returned. Surfaced in the smart card so a sub-50 appeal warns the
     *  user before they pay. */
    strengthScore: integer("strength_score"),
    /** One-sentence rationale shown when score < 50. */
    strengthRationale: text("strength_rationale"),
    /** Up to 3 actionable evidence asks shown when score < 50. */
    strengthImprovements: jsonb("strength_improvements").$type<string[] | null>(),
    /** Audit trail: `{ usedIds: string[], tokens: number }` snapshot of the
     *  knowledge pack the drafter saw on the most recent generation. */
    knowledgePackUsed: jsonb("knowledge_pack_used").$type<KnowledgePackAudit | null>(),
    modelUsed: text("model_used"),
    costPenceMillis: integer("cost_pence_millis"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("appeals_session_idx").on(t.sessionId),
    index("appeals_user_idx").on(t.userId),
    index("appeals_status_idx").on(t.status),
  ],
);

/* ───── jobs (Postgres-backed work queue) ─────
 *
 * Used for any work that's either expensive (Claude CLI subprocess), long
 * (Playwright MCP submission, ~minutes), or that must survive a crash.
 *
 * Claim with `FOR UPDATE SKIP LOCKED` so N workers can run in parallel
 * without stepping on each other. `lockedAt`/`lockedBy` are advisory —
 * if a worker dies mid-job the lock is reclaimed after a stale-lock cutoff.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(), // 'submit_appeal' | 'generate_draft' | future kinds
    appealId: text("appeal_id"),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("queued"), // 'queued' | 'running' | 'done' | 'failed'
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    result: jsonb("result"),
    /** Append-only event log streamed to the customer while a submission is mid-flight.
     * Shape: `[{ ts, kind: 'step' | 'thought' | 'screenshot' | 'status', message?, url?, step? }]`. */
    progress: jsonb("progress").$type<JobProgressEvent[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("jobs_status_runafter_idx").on(t.status, t.runAfter),
    index("jobs_appeal_idx").on(t.appealId),
  ],
);

export type JobProgressEvent =
  | { ts: string; kind: "status"; message: string }
  | { ts: string; kind: "step"; message: string }
  | { ts: string; kind: "thought"; message: string }
  | { ts: string; kind: "screenshot"; step: number; url: string; caption?: string }
  | {
      ts: string;
      kind: "metadata";
      /** A field of `PortalLookupSnapshot["metadata"]` plus a few extras
       *  the prompt may emit progressively (e.g. issuer, contravention
       *  description). The client maps these into the live "Council
       *  confirms" panel. */
      field: string;
      value: string;
    };

/** Audit trail snapshot for the knowledge pack a drafter actually saw —
 *  written to `appeals.knowledge_pack_used` so we can later debug
 *  why a given letter was framed the way it was. */
export interface KnowledgePackAudit {
  usedIds: string[];
  tokens: number;
}

/** Per-step processing status for the smart ticket card (v0.2.15).
 *  Each backend operation that runs after the appeal row is created
 *  reports its lifecycle here, so the UI can show progressive inline
 *  loading rows without a full-screen blocker. */
export type ProcessingStepStatus = "pending" | "running" | "done" | "failed";

export interface ProcessingStatus {
  /** OCR step — Claude vision extracts ticket fields from the photo. */
  ocr?: {
    status: ProcessingStepStatus;
    error?: string;
    /** Set when the OCR PATCH wrote to ticket. */
    completedAt?: string;
  };
  /** AI appeal-analysis step — recommendation card generation. */
  analysis?: {
    status: ProcessingStepStatus;
    error?: string;
    completedAt?: string;
  };
}

/** Verdict returned by the council portal after a PCN lookup. */
export type PortalLookupVerdict =
  | "open"           // PCN is live + appealable
  | "paid"           // already paid in full
  | "closed"         // council has cancelled / closed the case
  | "not_found"      // portal couldn't locate the PCN
  | "expired"        // statutory window to challenge has passed
  | "unknown";       // lookup ran but couldn't determine state

/** Snapshot persisted to `appeals.portal_lookup`. Drives the validation
 *  banner, the warden-photo gallery, and the hard-block routing on the
 *  evidence page. */
export interface PortalLookupSnapshot {
  jobId: string | null;
  /** Lifecycle of the lookup itself (not the verdict). */
  status:
    | "pending"        // job enqueued, not yet run
    | "verified"       // ran ok; verdict is trustworthy
    | "invalid"        // ran ok; verdict ∈ {paid, closed, not_found}
    | "skipped"        // council not automated — no lookup attempted
    | "overridden"     // verdict said invalid but user chose to appeal anyway
    | "error";         // lookup failed (portal down, timeout, captcha…)
  verdict?: PortalLookupVerdict;
  verdictReason?: string;
  /** Warden / portal-side photo URLs (already uploaded to Blob). */
  photoUrls: string[];
  /** Ticket fields the portal returned — these become the source-of-truth
   *  over the OCR'd ticket once a lookup succeeds. */
  metadata?: {
    pcnRef?: string;
    vehicleReg?: string;
    contraventionCode?: string;
    location?: string;
    issuedAt?: string;
    amountPence?: number;
    discountUntil?: string;
    fullChargeFrom?: string;
    dueDateAt?: string;
    paidAt?: string;
  };
  fetchedAt: string;
}

/**
 * Inbound mail from councils. Per-appeal alias is `<appeal-id>@appeals.parkingrabbit.com`;
 * the email-relay webhook lands here. Parsing happens in lib/server/inbound.ts.
 */
export const inboundMessages = pgTable(
  "inbound_messages",
  {
    id: text("id").primaryKey(),
    appealId: text("appeal_id").references(() => appeals.id, {
      onDelete: "cascade",
    }),
    fromAddr: text("from_addr").notNull(),
    toAddr: text("to_addr").notNull(),
    subject: text("subject"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    classification: text("classification"), // 'cancelled' | 'rejected' | 'acknowledged' | 'request' | 'unknown'
    rawHeaders: jsonb("raw_headers"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("inbound_appeal_idx").on(t.appealId)],
);

/* ───── appeal_photos ───── */

export const appealPhotos = pgTable("appeal_photos", {
  id: text("id").primaryKey(),
  appealId: text("appeal_id")
    .notNull()
    .references(() => appeals.id, { onDelete: "cascade" }),
  /** PCN photo OR an evidence photo */
  kind: text("kind").notNull(), // "pcn" | "evidence"
  blobUrl: text("blob_url").notNull(),
  caption: text("caption"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ───── payments ───── */

export const payments = pgTable("payments", {
  stripePaymentIntentId: text("stripe_payment_intent_id").primaryKey(),
  appealId: text("appeal_id").references(() => appeals.id),
  sessionId: text("session_id").notNull(),
  amountPence: integer("amount_pence").notNull(),
  currency: text("currency").notNull().default("gbp"),
  status: text("status").notNull(), // mirrors Stripe statuses
  method: paymentMethod("method"),
  receiptEmail: text("receipt_email"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
  refundReason: text("refund_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ───── submissions ───── */

export const submissions = pgTable("submissions", {
  id: text("id").primaryKey(),
  appealId: text("appeal_id")
    .notNull()
    .references(() => appeals.id, { onDelete: "cascade" }),
  method: submissionMethod("method").notNull(),
  channel: text("channel").notNull(),
  councilReference: text("council_reference"),
  messageId: text("message_id"), // email message-id when method=email
  screenshotUrl: text("screenshot_url"),
  status: text("status").notNull(), // queued | submitting | submitted | failed
  retries: integer("retries").notNull().default(0),
  lastError: text("last_error"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
