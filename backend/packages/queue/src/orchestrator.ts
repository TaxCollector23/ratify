import type { Database } from "@ratify/db";
import { schema } from "@ratify/db";
import { buildIdempotencyKey } from "@ratify/shared";
import { eq } from "drizzle-orm";
import { getQueue, QUEUE_NAMES } from "./queues.js";
import { JOB_PAYLOAD_SCHEMAS, type JobPayloadFor, type JobType } from "./job-schemas.js";

export interface EnqueueJobParams<T extends JobType> {
  db: Database;
  jobType: T;
  orgId: string;
  /** Scope id used for idempotency-key derivation, e.g. repositoryId or reviewSessionId. */
  scopeId: string;
  payload: Omit<JobPayloadFor<T>, "orgId" | "jobId">;
  correlationId?: string;
  priority?: number;
  /** Extra fields folded into the idempotency key hash (e.g. headSha) to distinguish re-runs. */
  idempotencyExtra?: Record<string, string | number | boolean | undefined>;
  delayMs?: number;
}

export interface EnqueueJobResult {
  jobRowId: string;
  bullJobId: string;
  deduped: boolean;
}

/**
 * Enqueues a job with full idempotency + durable-record semantics:
 *   1. Derive a deterministic idempotency key.
 *   2. Upsert a `jobs` row (source of truth for state/replay).
 *   3. Push to BullMQ with the same key as the BullMQ jobId so BullMQ
 *      itself also naturally dedupes in-flight duplicates.
 *
 * This is the only supported way to enqueue work in Ratify — workers
 * never call `queue.add` directly.
 */
export async function enqueueJob<T extends JobType>(params: EnqueueJobParams<T>): Promise<EnqueueJobResult> {
  const { db, jobType, orgId, scopeId, correlationId, priority = 0, idempotencyExtra, delayMs } = params;

  const idempotencyKey = buildIdempotencyKey({
    jobType,
    orgId,
    scopeId,
    extra: idempotencyExtra,
  });

  const existing = await db.query.jobs.findFirst({
    where: eq(schema.jobs.idempotencyKey, idempotencyKey),
  });

  if (existing && (existing.status === "queued" || existing.status === "active" || existing.status === "completed")) {
    return {
      jobRowId: existing.id,
      bullJobId: existing.bullJobId ?? idempotencyKey,
      deduped: true,
    };
  }

  const [jobRow] = existing
    ? await db
        .update(schema.jobs)
        .set({ status: "queued", attemptCount: 0, result: null, updatedAt: new Date() })
        .where(eq(schema.jobs.id, existing.id))
        .returning()
    : await db
        .insert(schema.jobs)
        .values({
          orgId,
          type: jobType,
          idempotencyKey,
          status: "queued",
          queueName: QUEUE_NAMES[jobType],
          payload: params.payload as Record<string, unknown>,
          priority,
          correlationId: correlationId ?? scopeId,
          bullJobId: idempotencyKey,
        })
        .returning();

  if (!jobRow) {
    throw new Error(`Failed to persist job row for ${jobType}`);
  }

  const fullPayload = JOB_PAYLOAD_SCHEMAS[jobType].parse({
    ...params.payload,
    orgId,
    jobId: jobRow.id,
  });

  const queue = getQueue(jobType);
  const bullJob = await queue.add(jobType, fullPayload, {
    jobId: idempotencyKey,
    priority: priority > 0 ? priority : undefined,
    delay: delayMs,
  });

  return {
    jobRowId: jobRow.id,
    bullJobId: bullJob.id ?? idempotencyKey,
    deduped: false,
  };
}

/**
 * Convenience helper implementing the two chained flows described in the
 * spec. Each stage enqueues the next stage on successful completion
 * (called from within worker job handlers, not here) — this module only
 * provides the ordered stage lists so orchestration logic stays DRY.
 */
export const REPOSITORY_INDEXING_FLOW: JobType[] = [
  "repo.sync",
  "repo.parse",
  "repo.graph_build",
  "repo.history_mine",
  "repo.doctrine_infer",
];

export const PR_ANALYSIS_FLOW: JobType[] = [
  "pr.policy_check",
  "pr.context_retrieve",
  "pr.llm_reason",
  "pr.evidence_generate",
  "pr.publish",
];

export function nextStage(flow: JobType[], current: JobType): JobType | null {
  const idx = flow.indexOf(current);
  if (idx === -1 || idx === flow.length - 1) return null;
  return flow[idx + 1] ?? null;
}
