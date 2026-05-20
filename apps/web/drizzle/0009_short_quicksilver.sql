ALTER TABLE "councils" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "councils" ADD COLUMN "logo_bg" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "progress" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address_line1" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address_line2" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address_city" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address_postcode" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;