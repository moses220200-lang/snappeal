/**
 * Drizzle ORM schema for the Snappeal Postgres database.
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
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ───── appeals ───── */

export const appeals = pgTable(
  "appeals",
  {
    id: text("id").primaryKey(), // app-side ulid
    sessionId: text("session_id").notNull(), // anonymous client session
    status: appealStatus("status").notNull().default("draft"),
    step: text("step").notNull().default("photos"),
    ticket: jsonb("ticket").notNull(),
    grounds: jsonb("grounds").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    letterSubject: text("letter_subject"),
    letterBody: text("letter_body"),
    letterWordCount: integer("letter_word_count"),
    letterAddressedTo: text("letter_addressed_to"),
    timeline: jsonb("timeline").notNull(),
    councilSlug: text("council_slug").references(() => councils.slug),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("appeals_session_idx").on(t.sessionId),
    index("appeals_status_idx").on(t.status),
  ],
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
