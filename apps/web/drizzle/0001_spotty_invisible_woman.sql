CREATE TABLE "inbound_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"appeal_id" text,
	"from_addr" text NOT NULL,
	"to_addr" text NOT NULL,
	"subject" text,
	"body_text" text,
	"body_html" text,
	"classification" text,
	"raw_headers" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appeals" ALTER COLUMN "ticket" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "appeals" ALTER COLUMN "timeline" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "appeals" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "appeals" ADD COLUMN "reply_email" text;--> statement-breakpoint
ALTER TABLE "appeals" ADD COLUMN "model_used" text;--> statement-breakpoint
ALTER TABLE "appeals" ADD COLUMN "cost_pence_millis" integer;--> statement-breakpoint
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_appeal_id_appeals_id_fk" FOREIGN KEY ("appeal_id") REFERENCES "public"."appeals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbound_appeal_idx" ON "inbound_messages" USING btree ("appeal_id");--> statement-breakpoint
CREATE INDEX "appeals_user_idx" ON "appeals" USING btree ("user_id");