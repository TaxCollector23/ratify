import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { schema } from "@ratify/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { requireOrgMatch } from "../plugins/auth.js";
import type { AppDeps } from "../types.js";

const AdminMetricsSummarySchema = z.object({
  queueDepthByType: z.record(z.string(), z.number()),
  jobStatusCounts: z.record(z.string(), z.number()),
  webhookStatusCounts: z.record(z.string(), z.number()),
  avgJobDurationMsByType: z.record(z.string(), z.number().nullable()),
  deadLetterCount: z.number(),
  doctrineRuleCounts: z.record(z.string(), z.number()),
  publicationSuccessRate: z.number().nullable(),
});

/**
 * Admin/ops metrics endpoint. Implemented as routes within api-server
 * (documented choice, see ARCHITECTURE.md) rather than a fully separate
 * process — it shares the same DB connection pool and auth middleware,
 * and its traffic profile (low-volume, internal) doesn't justify a
 * separate deployable at this stage. apps/admin-metrics still exists as
 * a standalone scaffold for teams that want to split it out later.
 */
export function registerAdminMetricsRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get(
    "/orgs/:orgId/admin/metrics/summary",
    {
      schema: {
        tags: ["admin"],
        params: z.object({ orgId: z.string().uuid() }),
        response: { 200: AdminMetricsSummarySchema },
      },
    },
    async (request) => {
      const { orgId } = request.params as { orgId: string };
      requireOrgMatch(request, orgId);

      const [jobStatusRows, webhookStatusRows, durationRows, doctrineRows, publicationRows] = await Promise.all([
        deps.db
          .select({ status: schema.jobs.status, count: sql<number>`count(*)::int` })
          .from(schema.jobs)
          .where(eq(schema.jobs.orgId, orgId))
          .groupBy(schema.jobs.status),
        deps.db
          .select({ status: schema.webhookEvents.status, count: sql<number>`count(*)::int` })
          .from(schema.webhookEvents)
          .where(eq(schema.webhookEvents.orgId, orgId))
          .groupBy(schema.webhookEvents.status),
        deps.db
          .select({
            type: schema.jobs.type,
            avgDuration: sql<number | null>`avg(extract(epoch from (${schema.jobs.completedAt}::timestamptz - ${schema.jobs.startedAt}::timestamptz)) * 1000)`,
          })
          .from(schema.jobs)
          .where(and(eq(schema.jobs.orgId, orgId), eq(schema.jobs.status, "completed")))
          .groupBy(schema.jobs.type),
        deps.db
          .select({ status: schema.doctrineRules.status, count: sql<number>`count(*)::int` })
          .from(schema.doctrineRules)
          .where(eq(schema.doctrineRules.orgId, orgId))
          .groupBy(schema.doctrineRules.status),
        deps.db
          .select({ status: schema.publicationRecords.status, count: sql<number>`count(*)::int` })
          .from(schema.publicationRecords)
          .where(eq(schema.publicationRecords.orgId, orgId))
          .groupBy(schema.publicationRecords.status),
      ]);

      const jobStatusCounts = Object.fromEntries(jobStatusRows.map((r) => [r.status, r.count]));
      const webhookStatusCounts = Object.fromEntries(webhookStatusRows.map((r) => [r.status, r.count]));
      const avgJobDurationMsByType = Object.fromEntries(durationRows.map((r) => [r.type, r.avgDuration]));
      const doctrineRuleCounts = Object.fromEntries(doctrineRows.map((r) => [r.status, r.count]));

      const publishedCount = publicationRows.find((r) => r.status === "published")?.count ?? 0;
      const totalPublications = publicationRows.reduce((sum, r) => sum + r.count, 0);

      // Queue depth per type is best sourced live from BullMQ (Redis) in the worker/ops process;
      // here we approximate using queued+active Job rows as the durable-record view.
      const queueDepthByType = jobStatusRows
        .filter((r) => r.status === "queued" || r.status === "active")
        .reduce<Record<string, number>>((acc, r) => {
          acc[r.status] = (acc[r.status] ?? 0) + r.count;
          return acc;
        }, {});

      return {
        queueDepthByType,
        jobStatusCounts,
        webhookStatusCounts,
        avgJobDurationMsByType,
        deadLetterCount: jobStatusCounts["dead_letter"] ?? 0,
        doctrineRuleCounts,
        publicationSuccessRate: totalPublications > 0 ? publishedCount / totalPublications : null,
      };
    },
  );

  app.get(
    "/orgs/:orgId/admin/metrics/events",
    {
      schema: {
        tags: ["admin"],
        params: z.object({ orgId: z.string().uuid() }),
        querystring: z.object({ sinceMinutes: z.coerce.number().int().positive().default(60) }),
        response: {
          200: z.array(
            z.object({
              name: z.string(),
              occurredAt: z.string(),
              durationMs: z.number().nullable(),
              success: z.string().nullable(),
            }),
          ),
        },
      },
    },
    async (request) => {
      const { orgId } = request.params as { orgId: string };
      const { sinceMinutes } = request.query as { sinceMinutes: number };
      requireOrgMatch(request, orgId);

      const since = new Date(Date.now() - sinceMinutes * 60_000).toISOString();
      const rows = await deps.db.query.metricsEvents.findMany({
        where: and(eq(schema.metricsEvents.orgId, orgId), gte(schema.metricsEvents.occurredAt, since)),
        limit: 500,
      });

      return rows.map((r) => ({ name: r.name, occurredAt: r.occurredAt, durationMs: r.durationMs, success: r.success }));
    },
  );
}
