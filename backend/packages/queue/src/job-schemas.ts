import { z } from "zod";

/**
 * Zod payload schemas for every job in the repository-indexing flow and
 * PR-analysis flow. Each job payload always carries orgId + a correlation
 * id so downstream workers can enforce org isolation and idempotency.
 */

const BaseJobPayload = z.object({
  orgId: z.string().uuid(),
  jobId: z.string().uuid(), // Job table row id, not the BullMQ job id
});

// ---- Repository indexing flow ----

export const RepoSyncPayloadSchema = BaseJobPayload.extend({
  repositoryId: z.string().uuid(),
  ref: z.string().default("HEAD"),
  reason: z.enum(["initial-install", "scheduled-refresh", "manual", "pr-analysis-dependency"]),
});
export type RepoSyncPayload = z.infer<typeof RepoSyncPayloadSchema>;

export const RepoParsePayloadSchema = BaseJobPayload.extend({
  repositoryId: z.string().uuid(),
  snapshotId: z.string().uuid(),
});
export type RepoParsePayload = z.infer<typeof RepoParsePayloadSchema>;

export const RepoGraphBuildPayloadSchema = BaseJobPayload.extend({
  repositoryId: z.string().uuid(),
  snapshotId: z.string().uuid(),
});
export type RepoGraphBuildPayload = z.infer<typeof RepoGraphBuildPayloadSchema>;

export const RepoHistoryMinePayloadSchema = BaseJobPayload.extend({
  repositoryId: z.string().uuid(),
  sinceCommitSha: z.string().optional(),
});
export type RepoHistoryMinePayload = z.infer<typeof RepoHistoryMinePayloadSchema>;

export const RepoDoctrineInferPayloadSchema = BaseJobPayload.extend({
  repositoryId: z.string().uuid(),
});
export type RepoDoctrineInferPayload = z.infer<typeof RepoDoctrineInferPayloadSchema>;

// ---- PR analysis flow ----

export const PrPolicyCheckPayloadSchema = BaseJobPayload.extend({
  repositoryId: z.string().uuid(),
  pullRequestId: z.string().uuid(),
  reviewSessionId: z.string().uuid(),
  headSha: z.string(),
});
export type PrPolicyCheckPayload = z.infer<typeof PrPolicyCheckPayloadSchema>;

export const PrContextRetrievePayloadSchema = PrPolicyCheckPayloadSchema;
export type PrContextRetrievePayload = z.infer<typeof PrContextRetrievePayloadSchema>;

export const PrLlmReasonPayloadSchema = PrPolicyCheckPayloadSchema;
export type PrLlmReasonPayload = z.infer<typeof PrLlmReasonPayloadSchema>;

export const PrEvidenceGeneratePayloadSchema = PrPolicyCheckPayloadSchema;
export type PrEvidenceGeneratePayload = z.infer<typeof PrEvidenceGeneratePayloadSchema>;

export const PrPublishPayloadSchema = PrPolicyCheckPayloadSchema;
export type PrPublishPayload = z.infer<typeof PrPublishPayloadSchema>;

export const FeedbackIngestPayloadSchema = BaseJobPayload.extend({
  findingId: z.string().uuid(),
  feedbackEventId: z.string().uuid(),
});
export type FeedbackIngestPayload = z.infer<typeof FeedbackIngestPayloadSchema>;

/** Maps job type -> payload schema, used by the orchestrator for validation before enqueue. */
export const JOB_PAYLOAD_SCHEMAS = {
  "repo.sync": RepoSyncPayloadSchema,
  "repo.parse": RepoParsePayloadSchema,
  "repo.graph_build": RepoGraphBuildPayloadSchema,
  "repo.history_mine": RepoHistoryMinePayloadSchema,
  "repo.doctrine_infer": RepoDoctrineInferPayloadSchema,
  "pr.policy_check": PrPolicyCheckPayloadSchema,
  "pr.context_retrieve": PrContextRetrievePayloadSchema,
  "pr.llm_reason": PrLlmReasonPayloadSchema,
  "pr.evidence_generate": PrEvidenceGeneratePayloadSchema,
  "pr.publish": PrPublishPayloadSchema,
  "feedback.ingest": FeedbackIngestPayloadSchema,
} as const;

export type JobType = keyof typeof JOB_PAYLOAD_SCHEMAS;
export type JobPayloadFor<T extends JobType> = z.infer<(typeof JOB_PAYLOAD_SCHEMAS)[T]>;
