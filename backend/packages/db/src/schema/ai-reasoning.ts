import { index, integer, jsonb, pgEnum, pgTable, real, text, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./common.js";
import { organizations } from "./org.js";
import { reviewSessions } from "./review.js";

export const aiReasoningRunStatusEnum = pgEnum("ai_reasoning_run_status", [
  "pending",
  "running",
  "succeeded",
  "schema_validation_failed",
  "timed_out",
  "failed",
]);

/**
 * AIReasoningRun records exactly one LLM call in the review pipeline:
 * the exact context sent, structured output received (schema-validated),
 * token usage, latency, and outcome — for reproducibility & auditing.
 */
export const aiReasoningRuns = pgTable(
  "ai_reasoning_runs",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    reviewSessionId: uuid("review_session_id")
      .notNull()
      .references(() => reviewSessions.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // e.g. "anthropic"
    model: text("model").notNull(),
    status: aiReasoningRunStatusEnum("status").notNull().default("pending"),
    promptObjectStorageKey: text("prompt_object_storage_key"), // full assembled context, stored in S3
    promptContentHash: text("prompt_content_hash"),
    outputSchemaVersion: text("output_schema_version").notNull().default("v1"),
    structuredOutput: jsonb("structured_output").$type<Record<string, unknown> | null>(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms"),
    overallConfidence: real("overall_confidence"),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (t) => [
    index("ai_reasoning_runs_org_idx").on(t.orgId),
    index("ai_reasoning_runs_session_idx").on(t.reviewSessionId),
    index("ai_reasoning_runs_status_idx").on(t.status),
  ],
);

export const metricsEventNameEnum = pgEnum("metrics_event_name", [
  "webhook.received",
  "webhook.verified",
  "webhook.rejected",
  "webhook.deduped",
  "job.enqueued",
  "job.started",
  "job.completed",
  "job.failed",
  "job.retried",
  "job.dead_lettered",
  "repo.sync.started",
  "repo.sync.completed",
  "repo.index.started",
  "repo.index.completed",
  "parser.run",
  "parser.failed",
  "graph.build.completed",
  "history.mine.completed",
  "doctrine.inferred",
  "policy.check.completed",
  "retrieval.query",
  "llm.call.started",
  "llm.call.completed",
  "llm.call.failed",
  "llm.schema_validation_failed",
  "evidence.generated",
  "review.published",
  "review.publish_failed",
  "feedback.received",
  "cache.hit",
  "cache.miss",
]);

/** Durable store for the structured metrics events emitted via packages/observability. */
export const metricsEvents = pgTable(
  "metrics_events",
  {
    id: idColumn(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    name: metricsEventNameEnum("name").notNull(),
    repositoryId: uuid("repository_id"),
    jobId: uuid("job_id"),
    reviewSessionId: uuid("review_session_id"),
    durationMs: integer("duration_ms"),
    success: text("success"), // "true"|"false"|null
    attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: text("occurred_at").notNull(),
    ...timestamps,
  },
  (t) => [
    index("metrics_events_org_idx").on(t.orgId),
    index("metrics_events_name_idx").on(t.name),
    index("metrics_events_repo_idx").on(t.repositoryId),
    index("metrics_events_session_idx").on(t.reviewSessionId),
  ],
);
