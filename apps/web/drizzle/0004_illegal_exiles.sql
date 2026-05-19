CREATE TABLE "care_plan_waitlist" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"user_id" text,
	"session_id" text,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "care_plan_waitlist_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "appeals" ADD COLUMN "service_tier" text DEFAULT 'grounds' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "service_tier" text DEFAULT 'grounds' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notification_prefs" jsonb;