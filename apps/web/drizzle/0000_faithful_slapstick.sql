CREATE TYPE "public"."appeal_status" AS ENUM('draft', 'ready', 'submitting', 'submitted', 'under_review', 'decision_pending', 'cancelled', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."automation_status" AS ENUM('manual', 'automated_beta', 'automated_ga');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('apple_pay', 'google_pay', 'card');--> statement-breakpoint
CREATE TYPE "public"."submission_method" AS ENUM('portal', 'email', 'manual');--> statement-breakpoint
CREATE TABLE "appeal_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"appeal_id" text NOT NULL,
	"kind" text NOT NULL,
	"blob_url" text NOT NULL,
	"caption" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appeals" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"status" "appeal_status" DEFAULT 'draft' NOT NULL,
	"step" text DEFAULT 'photos' NOT NULL,
	"ticket" jsonb NOT NULL,
	"grounds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"letter_subject" text,
	"letter_body" text,
	"letter_word_count" integer,
	"letter_addressed_to" text,
	"timeline" jsonb NOT NULL,
	"council_slug" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "councils" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"appeal_portal_url" text NOT NULL,
	"appeal_email" text,
	"postal_address" text,
	"submission_methods" jsonb NOT NULL,
	"identifier_hints" jsonb NOT NULL,
	"pcn_ref_pattern" text,
	"automation_status" "automation_status" DEFAULT 'manual' NOT NULL,
	"automation_form_schema" jsonb,
	"notes" text,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"stripe_payment_intent_id" text PRIMARY KEY NOT NULL,
	"appeal_id" text,
	"session_id" text NOT NULL,
	"amount_pence" integer NOT NULL,
	"currency" text DEFAULT 'gbp' NOT NULL,
	"status" text NOT NULL,
	"method" "payment_method",
	"receipt_email" text,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"refund_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"appeal_id" text NOT NULL,
	"method" "submission_method" NOT NULL,
	"channel" text NOT NULL,
	"council_reference" text,
	"message_id" text,
	"screenshot_url" text,
	"status" text NOT NULL,
	"retries" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appeal_photos" ADD CONSTRAINT "appeal_photos_appeal_id_appeals_id_fk" FOREIGN KEY ("appeal_id") REFERENCES "public"."appeals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_council_slug_councils_slug_fk" FOREIGN KEY ("council_slug") REFERENCES "public"."councils"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_appeal_id_appeals_id_fk" FOREIGN KEY ("appeal_id") REFERENCES "public"."appeals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_appeal_id_appeals_id_fk" FOREIGN KEY ("appeal_id") REFERENCES "public"."appeals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appeals_session_idx" ON "appeals" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "appeals_status_idx" ON "appeals" USING btree ("status");