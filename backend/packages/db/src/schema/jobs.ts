import { index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./common.js";
import { organizations } from "./org.js";

export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "active",
  "completed",
  "failed",
  "dead_letter",
  "cancelled",
]);

export const jobTypeEnum = pgEnum("job_type", [
  "repo.sync",
  "repo.parse",
  "repo.graph_build",
  "repo.history_mine",
  "repo.doctrine_infer",
  "pr.policy_check",
  "pr.context_retrieve",
  "pr.llm_reason",
  "pr.evidence_generate",
  "pr.publish",
  "feedback.ingest",
]);

/**
 * Job is the durable, replayable record of a unit of async work. BullMQ
 * drives execution/scheduling; this table is the source of truth for
 * state, idempotency, and audit history so any job can be inspected or
 * replayed even if the Redis queue is flushed.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: jobTypeEnum("type").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),
    queueName: text("queue_name").notNull(),
    bullJobId: text("bull_job_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    result: jsonb("result").$type<Record<string, unknown> | null>(),
    priority: integer("priority").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    attemptCount: integer("attempt_count").notNull().default(0),
    scheduledFor: text("scheduled_for"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    correlationId: text("correlation_id"), // e.g. review session id, repository id
    ...timestamps,
  },
  (t) => [
    index("jobs_org_idx").on(t.orgId),
    uniqueIndex("jobs_idempotency_key_idx").on(t.idempotencyKey),
    index("jobs_status_idx").on(t.status),
    index("jobs_type_idx").on(t.type),
    index("jobs_correlation_idx").on(t.correlationId),
  ],
);

export const jobAttemptStatusEnum = pgEnum("job_attempt_status", ["running", "succeeded", "failed"]);

export const jobAttempts = pgTable(
  "job_attempts",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    status: jobAttemptStatusEnum("status").notNull().default("running"),
    workerId: text("worker_id"),
    errorMessage: text("error_message"),
    errorStack: text("error_stack"),
    durationMs: integer("duration_ms"),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    ...timestamps,
  },
  (t) => [
    index("job_attempts_org_idx").on(t.orgId),
    index("job_attempts_job_idx").on(t.jobId),
    uniqueIndex("job_attempts_job_attempt_number_idx").on(t.jobId, t.attemptNumber),
  ],
);
