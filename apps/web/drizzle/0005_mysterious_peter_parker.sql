CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stripe_subscription_id" text,
	"stripe_customer_id" text,
	"status" text DEFAULT 'incomplete' NOT NULL,
	"product" text DEFAULT 'care_plan' NOT NULL,
	"price_pence" integer DEFAULT 999 NOT NULL,
	"currency" text DEFAULT 'gbp' NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" text DEFAULT 'false' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
