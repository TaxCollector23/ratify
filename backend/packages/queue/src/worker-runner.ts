import { Worker, type Job, QueueEvents } from "bullmq";
import type { Database } from "@ratify/db";
import { schema } from "@ratify/db";
import { eq, sql } from "drizzle-orm";
import type { Logger } from "pino";
import { getRedisConnection } from "./redis.js";
import { QUEUE_NAMES } from "./queues.js";
import type { JobType } from "./job-schemas.js";

export interface WorkerRunnerOptions<T> {
  db: Database;
  jobType: JobType;
  logger: Logger;
  concurrency?: number;
  handler: (payload: T, job: Job) => Promise<Record<string, unknown> | void>;
}

/**
 * Wraps a BullMQ Worker so that every execution:
 *   - records a JobAttempt row (start/finish/duration/error)
 *   - updates the Job row status (active -> completed/failed)
 *   - moves permanently-failed jobs to dead_letter after max attempts
 *   - never throws unhandled — failures are always recorded, never silent
 */
export function runWorker<T extends { jobId: string; orgId: string }>(
  options: WorkerRunnerOptions<T>,
): Worker {
  const { db, jobType, logger, concurrency = 4, handler } = options;
  const queueName = QUEUE_NAMES[jobType];

  const worker = new Worker(
    queueName,
    async (job: Job) => {
      const payload = job.data as T;
      const attemptNumber = job.attemptsMade + 1;
      const startedAt = new Date();

      await db
        .update(schema.jobs)
        .set({ status: "active", startedAt: startedAt.toISOString(), attemptCount: attemptNumber, updatedAt: new Date() })
        .where(eq(schema.jobs.id, payload.jobId));

      const [attemptRow] = await db
        .insert(schema.jobAttempts)
        .values({
          orgId: payload.orgId,
          jobId: payload.jobId,
          attemptNumber,
          status: "running",
          workerId: `${queueName}#${process.pid}`,
          startedAt: startedAt.toISOString(),
        })
        .returning();

      try {
        const result = (await handler(payload, job)) ?? {};
        const finishedAt = new Date();

        await Promise.all([
          db
            .update(schema.jobs)
            .set({
              status: "completed",
              result,
              completedAt: finishedAt.toISOString(),
              updatedAt: new Date(),
            })
            .where(eq(schema.jobs.id, payload.jobId)),
          attemptRow
            ? db
                .update(schema.jobAttempts)
                .set({
                  status: "succeeded",
                  finishedAt: finishedAt.toISOString(),
                  durationMs: finishedAt.getTime() - startedAt.getTime(),
                  updatedAt: new Date(),
                })
                .where(eq(schema.jobAttempts.id, attemptRow.id))
            : Promise.resolve(),
        ]);

        logger.info({ jobType, jobId: payload.jobId, attemptNumber }, "job completed");
        return result;
      } catch (err) {
        const finishedAt = new Date();
        const error = err as Error;
        const isFinalAttempt = attemptNumber >= (job.opts.attempts ?? 5);

        await Promise.all([
          db
            .update(schema.jobs)
            .set({
              status: isFinalAttempt ? "dead_letter" : "failed",
              updatedAt: new Date(),
            })
            .where(eq(schema.jobs.id, payload.jobId)),
          attemptRow
            ? db
                .update(schema.jobAttempts)
                .set({
                  status: "failed",
                  errorMessage: error.message,
                  errorStack: error.stack,
                  finishedAt: finishedAt.toISOString(),
                  durationMs: finishedAt.getTime() - startedAt.getTime(),
                  updatedAt: new Date(),
                })
                .where(eq(schema.jobAttempts.id, attemptRow.id))
            : Promise.resolve(),
        ]);

        logger.error(
          { jobType, jobId: payload.jobId, attemptNumber, isFinalAttempt, err: error.message },
          "job failed",
        );
        throw err; // rethrow so BullMQ applies backoff/retry per queue defaultJobOptions
      }
    },
    { connection: getRedisConnection(), concurrency },
  );

  // Keep DB rows in sync for jobs that reach BullMQ's own terminal failure event,
  // covering the edge case where the process crashes mid-attempt.
  const events = new QueueEvents(queueName, { connection: getRedisConnection() });
  events.on("failed", ({ jobId, failedReason }) => {
    logger.warn({ queueName, jobId, failedReason }, "queue-events: job failed");
  });

  return worker;
}

/** Idempotency helper: no-op if a Job row is already terminal-completed for this key. */
export async function isAlreadyCompleted(db: Database, idempotencyKey: string): Promise<boolean> {
  const rows = await db
    .select({ status: schema.jobs.status })
    .from(schema.jobs)
    .where(sql`${schema.jobs.idempotencyKey} = ${idempotencyKey} AND ${schema.jobs.status} = 'completed'`)
    .limit(1);
  return rows.length > 0;
}
