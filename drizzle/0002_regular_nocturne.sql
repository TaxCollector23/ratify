CREATE TABLE "doctrine_mining_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"rules_found" integer DEFAULT 0 NOT NULL,
	"prs_analyzed" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "doctrine_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"repository_id" uuid,
	"rule_key" text NOT NULL,
	"rule_text" text NOT NULL,
	"category" text NOT NULL,
	"strength" text DEFAULT 'soft-norm' NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"discovered_from" text DEFAULT 'history' NOT NULL,
	"supporting_evidence" jsonb,
	"enabled" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doctrine_mining_runs" ADD CONSTRAINT "doctrine_mining_runs_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctrine_rules" ADD CONSTRAINT "doctrine_rules_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctrine_rules" ADD CONSTRAINT "doctrine_rules_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;