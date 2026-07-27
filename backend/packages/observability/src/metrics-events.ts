import { z } from "zod";
import type { Logger } from "pino";

/**
 * Structured metrics events. These are the canonical "every major step
 * emits a structured event" mechanism referenced in the spec. In
 * production these get persisted to the MetricsEvent table (via
 * packages/db) and/or shipped to a metrics backend; here we define the
 * event contract and a pluggable emitter interface.
 */
export const MetricsEventNameEnum = z.enum([
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
export type MetricsEventName = z.infer<typeof MetricsEventNameEnum>;

export const MetricsEventSchema = z.object({
  name: MetricsEventNameEnum,
  orgId: z.string().optional(),
  repositoryId: z.string().optional(),
  jobId: z.string().optional(),
  reviewSessionId: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  success: z.boolean().optional(),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  timestamp: z.string().datetime().default(() => new Date().toISOString()),
});
export type MetricsEvent = z.infer<typeof MetricsEventSchema>;

export interface MetricsSink {
  emit(event: MetricsEvent): Promise<void> | void;
}

/** Default sink: structured log line. A DB-backed sink lives in packages/db. */
export class LoggingMetricsSink implements MetricsSink {
  constructor(private readonly logger: Logger) {}

  emit(event: MetricsEvent): void {
    this.logger.info({ metricsEvent: event }, `metrics: ${event.name}`);
  }
}

export class MetricsEmitter {
  constructor(private readonly sinks: MetricsSink[]) {}

  async emit(event: Omit<MetricsEvent, "timestamp"> & { timestamp?: string }): Promise<void> {
    const parsed = MetricsEventSchema.parse(event);
    await Promise.all(this.sinks.map((sink) => sink.emit(parsed)));
  }
}
