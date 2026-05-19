/**
 * API request/response contracts for the Snappeal backend.
 *
 * All API routes parse incoming JSON through these zod schemas and return
 * typed JSON. The shapes match the mock-data fixture (fixtures/mock-data.json)
 * so the frontend can swap from fixture → real API by changing the data
 * source, not the consumer code.
 */

import { z } from "zod";

/* ────────────────────────────────────────────────────────────────────────── */
/*  Shared primitives                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

export const TimelineState = z.enum(["completed", "in_progress", "pending"]);

export const TimelineStep = z.object({
  id: z.string(),
  label: z.string(),
  state: TimelineState,
  at: z.string().nullable(),
});

export const AppealStatus = z.enum([
  "draft",
  "ready",
  "submitting",
  "submitted",
  "under_review",
  "decision_pending",
  "cancelled",
  "rejected",
]);

export const Ticket = z.object({
  issuer: z.string(),
  councilSlug: z.string(),
  pcnRef: z.string(),
  vehicleReg: z.string(),
  contraventionCode: z.string(),
  contraventionDescription: z.string(),
  issuedAt: z.string(),
  location: z.string(),
  amountPence: z.number().int().nonnegative(),
});

/**
 * Per-field confidence scores returned by the extract endpoint. Each value
 * is in [0, 1] — 1 = "100% sure I read this correctly from the photo".
 * Used to render the amber dot on low-confidence fields in the capture UI.
 */
export const TicketConfidence = z.object({
  issuer: z.number().min(0).max(1).optional(),
  councilSlug: z.number().min(0).max(1).optional(),
  pcnRef: z.number().min(0).max(1).optional(),
  vehicleReg: z.number().min(0).max(1).optional(),
  contraventionCode: z.number().min(0).max(1).optional(),
  location: z.number().min(0).max(1).optional(),
  issuedAt: z.number().min(0).max(1).optional(),
  amountPence: z.number().min(0).max(1).optional(),
});

/**
 * Photo-coach feedback. Output of a quick Claude pass over the PCN photo
 * BEFORE we trust the extraction — surfaces "try again" advice when the
 * image is unreadable.
 */
export const PhotoCoach = z.object({
  legible: z.boolean(),
  quality: z.enum(["good", "ok", "poor"]),
  issues: z.array(z.string()).max(5),
  advice: z.string().max(280),
});

export const Letter = z.object({
  subject: z.string(),
  body: z.string(),
  wordCount: z.number().int().nonnegative(),
  addressedTo: z.string(),
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  POST /api/checkout                                                        */
/*  Creates a Stripe PaymentIntent for £2.99 GBP.                             */
/* ────────────────────────────────────────────────────────────────────────── */

export const CheckoutRequest = z.object({
  /** Anonymous client session ID — links the PaymentIntent back to the local
   * appeal once the user completes payment. */
  sessionId: z.string().min(1).max(128),
  /** Email collected at the paywall for the receipt (optional in v0.1) */
  email: z.email().optional(),
});

export const CheckoutResponse = z.object({
  clientSecret: z.string(),
  paymentIntentId: z.string(),
  amountPence: z.literal(299),
  currency: z.literal("gbp"),
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  POST /api/generate                                                        */
/*  Vision + drafting in a single Claude call via the AI Gateway.             */
/* ────────────────────────────────────────────────────────────────────────── */

export const GenerateRequest = z.object({
  sessionId: z.string().min(1).max(128),
  /** Required: base64 data URL of the PCN photo. */
  pcnPhoto: z.string().min(1).startsWith("data:image/"),
  /** Optional evidence photos (up to 6). */
  evidencePhotos: z
    .array(z.string().startsWith("data:image/"))
    .max(6)
    .default([]),
  /** Optional 'what happened' notes. */
  notes: z.string().max(2000).optional(),
  /** Optional already-extracted ticket fields (from /api/extract). When
   * present, the drafter trusts these instead of re-OCRing the photo. */
  confirmedTicket: Ticket.partial().optional(),
});

export const GenerateResponse = z.object({
  ticket: Ticket,
  groundIds: z.array(z.string()).min(0).max(6),
  letter: Letter,
  modelUsed: z.string(),
  generatedAt: z.string(),
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  POST /api/submit                                                          */
/*  Queues a submission via the chosen channel. v0.1 implementation returns   */
/*  a mocked confirmation; v0.2 enqueues a Vercel Workflow run.               */
/* ────────────────────────────────────────────────────────────────────────── */

export const SubmissionMethod = z.enum(["portal", "email", "manual"]);

export const SubmitRequest = z.object({
  sessionId: z.string().min(1).max(128),
  appealId: z.string().min(1),
  paymentIntentId: z.string().min(1),
  /** Channel preference — engine may still route differently. */
  preferredMethod: SubmissionMethod.optional(),
});

export const SubmitResponse = z.object({
  submissionId: z.string(),
  status: z.enum(["queued", "submitting", "submitted", "failed"]),
  method: SubmissionMethod,
  councilReference: z.string().nullable(),
  submittedAt: z.string().nullable(),
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  Inferred TypeScript types — single source for both client and server      */
/* ────────────────────────────────────────────────────────────────────────── */

export type CheckoutRequest = z.infer<typeof CheckoutRequest>;
export type CheckoutResponse = z.infer<typeof CheckoutResponse>;
export type GenerateRequest = z.infer<typeof GenerateRequest>;
export type GenerateResponse = z.infer<typeof GenerateResponse>;
export type SubmitRequest = z.infer<typeof SubmitRequest>;
export type SubmitResponse = z.infer<typeof SubmitResponse>;

/* ────────────────────────────────────────────────────────────────────────── */
/*  Generic JSON error envelope                                               */
/* ────────────────────────────────────────────────────────────────────────── */

export const ApiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ApiError = z.infer<typeof ApiError>;

export const jsonError = (
  code: string,
  message: string,
  details?: unknown,
): ApiError => ({ error: { code, message, details } });
