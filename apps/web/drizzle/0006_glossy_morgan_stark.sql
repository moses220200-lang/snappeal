CREATE TABLE "council_automation" (
	"council_slug" text PRIMARY KEY NOT NULL,
	"agent_prompt" text NOT NULL,
	"field_hints" jsonb,
	"last_dry_run" jsonb,
	"last_dry_run_at" timestamp with time zone,
	"last_dry_run_ok" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
