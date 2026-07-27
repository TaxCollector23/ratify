CREATE TYPE "public"."user_role" AS ENUM('owner', 'admin', 'member', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."installation_status" AS ENUM('pending', 'active', 'suspended', 'uninstalled');--> statement-breakpoint
CREATE TYPE "public"."repository_visibility" AS ENUM('public', 'private', 'internal');--> statement-breakpoint
CREATE TYPE "public"."file_change_status" AS ENUM('added', 'modified', 'removed', 'renamed', 'copied');--> statement-breakpoint
CREATE TYPE "public"."pull_request_state" AS ENUM('open', 'closed', 'merged');--> statement-breakpoint
CREATE TYPE "public"."finding_severity" AS ENUM('info', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."finding_source" AS ENUM('policy-engine', 'llm-reasoner', 'history-miner', 'doctrine-miner');--> statement-breakpoint
CREATE TYPE "public"."finding_status" AS ENUM('open', 'acknowledged', 'resolved', 'dismissed', 'excepted');--> statement-breakpoint
CREATE TYPE "public"."review_session_status" AS ENUM('queued', 'gathering_context', 'running_policy_checks', 'running_ai_reasoning', 'scoring', 'publishing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."doctrine_rule_kind" AS ENUM('hard-rule', 'soft-norm', 'likely-preference');--> statement-breakpoint
CREATE TYPE "public"."doctrine_rule_status" AS ENUM('candidate', 'confirmed', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."doctrine_source_kind" AS ENUM('merged-pr', 'review-comment', 'commit-message', 'doc', 'adr', 'readme', 'codeowners', 'ci-config', 'feedback-event');--> statement-breakpoint
CREATE TYPE "public"."document_artifact_kind" AS ENUM('readme', 'adr', 'rfc', 'codeowners', 'ci-config', 'doc', 'changelog');--> statement-breakpoint
CREATE TYPE "public"."embedding_source_kind" AS ENUM('symbol', 'file', 'doc', 'adr', 'pull_request', 'review_comment', 'doctrine_rule');--> statement-breakpoint
CREATE TYPE "public"."graph_edge_kind" AS ENUM('calls', 'imports', 'depends_on', 'owned_by', 'documented_by', 'reviewed_by', 'modified_by', 'supports', 'contradicts', 'similar_to');--> statement-breakpoint
CREATE TYPE "public"."graph_node_kind" AS ENUM('file', 'symbol', 'module', 'package', 'test', 'doc', 'adr', 'pull_request', 'review_comment', 'owner', 'doctrine_rule', 'review_session');--> statement-breakpoint
CREATE TYPE "public"."job_attempt_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'active', 'completed', 'failed', 'dead_letter', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('repo.sync', 'repo.parse', 'repo.graph_build', 'repo.history_mine', 'repo.doctrine_infer', 'pr.policy_check', 'pr.context_retrieve', 'pr.llm_reason', 'pr.evidence_generate', 'pr.publish', 'feedback.ingest');--> statement-breakpoint
CREATE TYPE "public"."webhook_event_status" AS ENUM('received', 'verified', 'rejected', 'deduped', 'enqueued', 'processing_failed');--> statement-breakpoint
CREATE TYPE "public"."exception_record_status" AS ENUM('active', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."feedback_event_kind" AS ENUM('agree', 'disagree', 'false_positive', 'exception', 'temporary_exception', 'needs_human_review');--> statement-breakpoint
CREATE TYPE "public"."ai_reasoning_run_status" AS ENUM('pending', 'running', 'succeeded', 'schema_validation_failed', 'timed_out', 'failed');--> statement-breakpoint
CREATE TYPE "public"."metrics_event_name" AS ENUM('webhook.received', 'webhook.verified', 'webhook.rejected', 'webhook.deduped', 'job.enqueued', 'job.started', 'job.completed', 'job.failed', 'job.retried', 'job.dead_lettered', 'repo.sync.started', 'repo.sync.completed', 'repo.index.started', 'repo.index.completed', 'parser.run', 'parser.failed', 'graph.build.completed', 'history.mine.completed', 'doctrine.inferred', 'policy.check.completed', 'retrieval.query', 'llm.call.started', 'llm.call.completed', 'llm.call.failed', 'llm.schema_validation_failed', 'evidence.generated', 'review.published', 'review.publish_failed', 'feedback.received', 'cache.hit', 'cache.miss');--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"github_org_login" text,
	"plan_tier" text DEFAULT 'trial' NOT NULL,
	"data_retention_days" text DEFAULT '90' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"github_login" text,
	"github_user_id" text,
	"display_name" text,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"installation_id" bigint NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text NOT NULL,
	"status" "installation_status" DEFAULT 'pending' NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"encrypted_token_ref" text,
	"suspended_at" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"installation_id" uuid NOT NULL,
	"github_repo_id" bigint NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"visibility" "repository_visibility" DEFAULT 'private' NOT NULL,
	"clone_url" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"indexing_status" text DEFAULT 'not_indexed' NOT NULL,
	"last_indexed_at" text,
	"profile" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"path_glob" text NOT NULL,
	"owner_handle" text NOT NULL,
	"source" text DEFAULT 'CODEOWNERS' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"ref" text NOT NULL,
	"commit_sha" text NOT NULL,
	"merge_base_sha" text,
	"is_shallow" boolean DEFAULT true NOT NULL,
	"object_storage_key" text NOT NULL,
	"content_hash" text NOT NULL,
	"file_count" integer,
	"size_bytes" bigint,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pull_request_file_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"pull_request_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"previous_file_path" text,
	"status" "file_change_status" NOT NULL,
	"additions" integer DEFAULT 0 NOT NULL,
	"deletions" integer DEFAULT 0 NOT NULL,
	"patch_object_storage_key" text,
	"patch_content_hash" text,
	"is_binary" text DEFAULT 'false' NOT NULL,
	"language_detected" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pull_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"github_pr_number" integer NOT NULL,
	"title" text NOT NULL,
	"author_login" text NOT NULL,
	"state" "pull_request_state" DEFAULT 'open' NOT NULL,
	"base_ref" text NOT NULL,
	"head_ref" text NOT NULL,
	"base_sha" text NOT NULL,
	"head_sha" text NOT NULL,
	"merge_base_sha" text,
	"merged_at" text,
	"closed_at" text,
	"additions" integer DEFAULT 0 NOT NULL,
	"deletions" integer DEFAULT 0 NOT NULL,
	"changed_files" integer DEFAULT 0 NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"finding_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"excerpt" text,
	"url" text,
	"weight" real DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"review_session_id" uuid NOT NULL,
	"rule_key" text NOT NULL,
	"source" "finding_source" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"severity" "finding_severity" NOT NULL,
	"confidence" real NOT NULL,
	"status" "finding_status" DEFAULT 'open' NOT NULL,
	"file_path" text,
	"line_start" integer,
	"line_end" integer,
	"false_positive_likelihood" real,
	"remediation" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publication_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"review_session_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"external_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload_summary" text,
	"error_message" text,
	"published_at" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"pull_request_id" uuid NOT NULL,
	"head_sha" text NOT NULL,
	"status" "review_session_status" DEFAULT 'queued' NOT NULL,
	"triggered_by" text DEFAULT 'webhook' NOT NULL,
	"started_at" text,
	"completed_at" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"review_session_id" uuid NOT NULL,
	"overall_score" real NOT NULL,
	"severity_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"touched_sensitive_areas" text DEFAULT 'false' NOT NULL,
	"has_breaking_api_change" text DEFAULT 'false' NOT NULL,
	"missing_test_coverage" text DEFAULT 'false' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctrine_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"statement" text NOT NULL,
	"kind" "doctrine_rule_kind" NOT NULL,
	"status" "doctrine_rule_status" DEFAULT 'candidate' NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"scope_globs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rationale" text,
	"confirmed_by_user_id" uuid,
	"supersedes_rule_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctrine_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"doctrine_rule_id" uuid NOT NULL,
	"kind" "doctrine_source_kind" NOT NULL,
	"ref" text NOT NULL,
	"excerpt" text,
	"weight" real DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"kind" "document_artifact_kind" NOT NULL,
	"file_path" text NOT NULL,
	"title" text,
	"object_storage_key" text NOT NULL,
	"content_hash" text NOT NULL,
	"commit_sha" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historical_precedents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"source_pr_number" text,
	"source_commit_sha" text,
	"related_path_globs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outcome" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embedding_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"source_kind" "embedding_source_kind" NOT NULL,
	"source_ref" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"model" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graph_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"kind" "graph_edge_kind" NOT NULL,
	"source_node_id" uuid NOT NULL,
	"target_node_id" uuid NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graph_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"kind" "graph_node_kind" NOT NULL,
	"external_ref" text NOT NULL,
	"label" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "job_attempt_status" DEFAULT 'running' NOT NULL,
	"worker_id" text,
	"error_message" text,
	"error_stack" text,
	"duration_ms" integer,
	"started_at" text NOT NULL,
	"finished_at" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" "job_type" NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"queue_name" text NOT NULL,
	"bull_job_id" text,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"priority" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"scheduled_for" text,
	"started_at" text,
	"completed_at" text,
	"correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"delivery_id" text NOT NULL,
	"event_type" text NOT NULL,
	"action" text,
	"status" "webhook_event_status" DEFAULT 'received' NOT NULL,
	"signature_valid" text,
	"payload_object_storage_key" text NOT NULL,
	"payload_content_hash" text NOT NULL,
	"installation_id" text,
	"repository_full_name" text,
	"enqueued_job_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_message" text,
	"received_at" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exception_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"rule_key" text NOT NULL,
	"scope_glob" text,
	"granted_by_user_id" uuid,
	"reason" text NOT NULL,
	"status" "exception_record_status" DEFAULT 'active' NOT NULL,
	"expires_at" text,
	"source_finding_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"finding_id" uuid NOT NULL,
	"user_id" uuid,
	"kind" "feedback_event_kind" NOT NULL,
	"comment" text,
	"confidence_delta" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_reasoning_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"review_session_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"status" "ai_reasoning_run_status" DEFAULT 'pending' NOT NULL,
	"prompt_object_storage_key" text,
	"prompt_content_hash" text,
	"output_schema_version" text DEFAULT 'v1' NOT NULL,
	"structured_output" jsonb,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"overall_confidence" real,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"name" "metrics_event_name" NOT NULL,
	"repository_id" uuid,
	"job_id" uuid,
	"review_session_id" uuid,
	"duration_ms" integer,
	"success" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_installation_id_github_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."github_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_owners" ADD CONSTRAINT "repository_owners_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_owners" ADD CONSTRAINT "repository_owners_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_snapshots" ADD CONSTRAINT "repository_snapshots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_snapshots" ADD CONSTRAINT "repository_snapshots_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_request_file_changes" ADD CONSTRAINT "pull_request_file_changes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_request_file_changes" ADD CONSTRAINT "pull_request_file_changes_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_review_session_id_review_sessions_id_fk" FOREIGN KEY ("review_session_id") REFERENCES "public"."review_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_records" ADD CONSTRAINT "publication_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_records" ADD CONSTRAINT "publication_records_review_session_id_review_sessions_id_fk" FOREIGN KEY ("review_session_id") REFERENCES "public"."review_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_sessions" ADD CONSTRAINT "review_sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_sessions" ADD CONSTRAINT "review_sessions_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_sessions" ADD CONSTRAINT "review_sessions_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_snapshots" ADD CONSTRAINT "score_snapshots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_snapshots" ADD CONSTRAINT "score_snapshots_review_session_id_review_sessions_id_fk" FOREIGN KEY ("review_session_id") REFERENCES "public"."review_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctrine_rules" ADD CONSTRAINT "doctrine_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctrine_rules" ADD CONSTRAINT "doctrine_rules_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctrine_sources" ADD CONSTRAINT "doctrine_sources_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctrine_sources" ADD CONSTRAINT "doctrine_sources_doctrine_rule_id_doctrine_rules_id_fk" FOREIGN KEY ("doctrine_rule_id") REFERENCES "public"."doctrine_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_artifacts" ADD CONSTRAINT "document_artifacts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_artifacts" ADD CONSTRAINT "document_artifacts_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_precedents" ADD CONSTRAINT "historical_precedents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_precedents" ADD CONSTRAINT "historical_precedents_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding_records" ADD CONSTRAINT "embedding_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding_records" ADD CONSTRAINT "embedding_records_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_source_node_id_graph_nodes_id_fk" FOREIGN KEY ("source_node_id") REFERENCES "public"."graph_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_target_node_id_graph_nodes_id_fk" FOREIGN KEY ("target_node_id") REFERENCES "public"."graph_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_nodes" ADD CONSTRAINT "graph_nodes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_nodes" ADD CONSTRAINT "graph_nodes_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_attempts" ADD CONSTRAINT "job_attempts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_attempts" ADD CONSTRAINT "job_attempts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exception_records" ADD CONSTRAINT "exception_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exception_records" ADD CONSTRAINT "exception_records_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exception_records" ADD CONSTRAINT "exception_records_source_finding_id_findings_id_fk" FOREIGN KEY ("source_finding_id") REFERENCES "public"."findings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reasoning_runs" ADD CONSTRAINT "ai_reasoning_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reasoning_runs" ADD CONSTRAINT "ai_reasoning_runs_review_session_id_review_sessions_id_fk" FOREIGN KEY ("review_session_id") REFERENCES "public"."review_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_events" ADD CONSTRAINT "metrics_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_idx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_org_email_idx" ON "users" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "github_installations_org_idx" ON "github_installations" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_installations_installation_id_idx" ON "github_installations" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "repositories_org_idx" ON "repositories" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "repositories_installation_idx" ON "repositories" USING btree ("installation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repositories_github_repo_id_idx" ON "repositories" USING btree ("github_repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repositories_owner_name_idx" ON "repositories" USING btree ("owner","name");--> statement-breakpoint
CREATE INDEX "repository_owners_org_idx" ON "repository_owners" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "repository_owners_repo_idx" ON "repository_owners" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "repository_owners_path_glob_idx" ON "repository_owners" USING btree ("path_glob");--> statement-breakpoint
CREATE INDEX "repository_snapshots_org_idx" ON "repository_snapshots" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "repository_snapshots_repo_idx" ON "repository_snapshots" USING btree ("repository_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_snapshots_repo_commit_idx" ON "repository_snapshots" USING btree ("repository_id","commit_sha");--> statement-breakpoint
CREATE INDEX "repository_snapshots_content_hash_idx" ON "repository_snapshots" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "pull_request_file_changes_org_idx" ON "pull_request_file_changes" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "pull_request_file_changes_pr_idx" ON "pull_request_file_changes" USING btree ("pull_request_id");--> statement-breakpoint
CREATE INDEX "pull_request_file_changes_path_idx" ON "pull_request_file_changes" USING btree ("file_path");--> statement-breakpoint
CREATE INDEX "pull_requests_org_idx" ON "pull_requests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "pull_requests_repo_idx" ON "pull_requests" USING btree ("repository_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pull_requests_repo_number_idx" ON "pull_requests" USING btree ("repository_id","github_pr_number");--> statement-breakpoint
CREATE INDEX "pull_requests_state_idx" ON "pull_requests" USING btree ("state");--> statement-breakpoint
CREATE INDEX "evidence_items_org_idx" ON "evidence_items" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "evidence_items_finding_idx" ON "evidence_items" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX "findings_org_idx" ON "findings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "findings_session_idx" ON "findings" USING btree ("review_session_id");--> statement-breakpoint
CREATE INDEX "findings_rule_key_idx" ON "findings" USING btree ("rule_key");--> statement-breakpoint
CREATE INDEX "findings_severity_idx" ON "findings" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "findings_status_idx" ON "findings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "publication_records_org_idx" ON "publication_records" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "publication_records_session_idx" ON "publication_records" USING btree ("review_session_id");--> statement-breakpoint
CREATE INDEX "review_sessions_org_idx" ON "review_sessions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "review_sessions_repo_idx" ON "review_sessions" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "review_sessions_pr_idx" ON "review_sessions" USING btree ("pull_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_sessions_pr_head_sha_idx" ON "review_sessions" USING btree ("pull_request_id","head_sha");--> statement-breakpoint
CREATE INDEX "review_sessions_status_idx" ON "review_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "score_snapshots_org_idx" ON "score_snapshots" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "score_snapshots_session_idx" ON "score_snapshots" USING btree ("review_session_id");--> statement-breakpoint
CREATE INDEX "doctrine_rules_org_idx" ON "doctrine_rules" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "doctrine_rules_repo_idx" ON "doctrine_rules" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "doctrine_rules_key_idx" ON "doctrine_rules" USING btree ("key");--> statement-breakpoint
CREATE INDEX "doctrine_rules_status_idx" ON "doctrine_rules" USING btree ("status");--> statement-breakpoint
CREATE INDEX "doctrine_sources_org_idx" ON "doctrine_sources" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "doctrine_sources_rule_idx" ON "doctrine_sources" USING btree ("doctrine_rule_id");--> statement-breakpoint
CREATE INDEX "document_artifacts_org_idx" ON "document_artifacts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "document_artifacts_repo_idx" ON "document_artifacts" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "document_artifacts_kind_idx" ON "document_artifacts" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "historical_precedents_org_idx" ON "historical_precedents" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "historical_precedents_repo_idx" ON "historical_precedents" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "embedding_records_org_idx" ON "embedding_records" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "embedding_records_repo_idx" ON "embedding_records" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "embedding_records_source_idx" ON "embedding_records" USING btree ("source_kind","source_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "embedding_records_repo_ref_model_idx" ON "embedding_records" USING btree ("repository_id","source_ref","model");--> statement-breakpoint
CREATE INDEX "graph_edges_org_idx" ON "graph_edges" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "graph_edges_repo_idx" ON "graph_edges" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "graph_edges_source_idx" ON "graph_edges" USING btree ("source_node_id");--> statement-breakpoint
CREATE INDEX "graph_edges_target_idx" ON "graph_edges" USING btree ("target_node_id");--> statement-breakpoint
CREATE INDEX "graph_edges_kind_idx" ON "graph_edges" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "graph_edges_unique_edge_idx" ON "graph_edges" USING btree ("source_node_id","target_node_id","kind");--> statement-breakpoint
CREATE INDEX "graph_nodes_org_idx" ON "graph_nodes" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "graph_nodes_repo_idx" ON "graph_nodes" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "graph_nodes_kind_idx" ON "graph_nodes" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "graph_nodes_repo_kind_ref_idx" ON "graph_nodes" USING btree ("repository_id","kind","external_ref");--> statement-breakpoint
CREATE INDEX "job_attempts_org_idx" ON "job_attempts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "job_attempts_job_idx" ON "job_attempts" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_attempts_job_attempt_number_idx" ON "job_attempts" USING btree ("job_id","attempt_number");--> statement-breakpoint
CREATE INDEX "jobs_org_idx" ON "jobs" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_idempotency_key_idx" ON "jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_type_idx" ON "jobs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "jobs_correlation_idx" ON "jobs" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "webhook_events_org_idx" ON "webhook_events" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_delivery_id_idx" ON "webhook_events" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "webhook_events_status_idx" ON "webhook_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "webhook_events_event_type_idx" ON "webhook_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "exception_records_org_idx" ON "exception_records" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "exception_records_repo_idx" ON "exception_records" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "exception_records_rule_key_idx" ON "exception_records" USING btree ("rule_key");--> statement-breakpoint
CREATE INDEX "exception_records_status_idx" ON "exception_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "feedback_events_org_idx" ON "feedback_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "feedback_events_finding_idx" ON "feedback_events" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX "feedback_events_kind_idx" ON "feedback_events" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "ai_reasoning_runs_org_idx" ON "ai_reasoning_runs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ai_reasoning_runs_session_idx" ON "ai_reasoning_runs" USING btree ("review_session_id");--> statement-breakpoint
CREATE INDEX "ai_reasoning_runs_status_idx" ON "ai_reasoning_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "metrics_events_org_idx" ON "metrics_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "metrics_events_name_idx" ON "metrics_events" USING btree ("name");--> statement-breakpoint
CREATE INDEX "metrics_events_repo_idx" ON "metrics_events" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "metrics_events_session_idx" ON "metrics_events" USING btree ("review_session_id");