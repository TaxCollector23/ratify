import type { Database } from "@ratify/db";
import { schema } from "@ratify/db";
import type { MetricsEvent, MetricsSink } from "@ratify/observability";

/**
 * Persists every metrics event emitted by worker handlers to the
 * `metrics_events` table (the durable store queried by
 * apps/api-server's review-sessions timeline and admin-metrics routes).
 * Failures to persist are logged but never thrown — metrics must never
 * take down a job.
 */
export class DbMetricsSink implements MetricsSink {
  constructor(private readonly db: Database) {}

  async emit(event: MetricsEvent): Promise<void> {
    try {
      await this.db.insert(schema.metricsEvents).values({
        orgId: event.orgId,
        name: event.name,
        repositoryId: event.repositoryId,
        jobId: event.jobId,
        reviewSessionId: event.reviewSessionId,
        durationMs: event.durationMs,
        success: event.success === undefined ? null : String(event.success),
        attributes: event.attributes ?? {},
        occurredAt: event.timestamp,
      });
    } catch {
      // Best-effort: metrics persistence failures must never fail the calling job.
    }
  }
}
