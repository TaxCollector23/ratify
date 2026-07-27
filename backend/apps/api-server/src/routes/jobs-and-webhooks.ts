import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { schema } from "@ratify/db";
import { and, desc, eq } from "drizzle-orm";
import { RatifyError } from "@ratify/shared";
import { requireOrgMatch } from "../plugins/auth.js";
import type { AppDeps } from "../types.js";

const JobStatusSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.string(),
  attemptCount: z.number(),
  maxAttempts: z.number(),
  correlationId: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});

const WebhookReceiptSchema = z.object({
  id: z.string(),
  deliveryId: z.string(),
  eventType: z.string(),
  action: z.string().nullable(),
  status: z.string(),
  signatureValid: z.string().nullable(),
  receivedAt: z.string(),
});

const PublicationRecordSchema = z.object({
  id: z.string(),
  reviewSessionId: z.string(),
  channel: z.string(),
  status: z.string(),
  externalId: z.string().nullable(),
  publishedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
});

export function registerJobAndWebhookRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get(
    "/orgs/:orgId/jobs/:jobId",
    {
      schema: {
        tags: ["jobs"],
        params: z.object({ orgId: z.string().uuid(), jobId: z.string().uuid() }),
        response: { 200: JobStatusSchema },
      },
    },
    async (request) => {
      const { orgId, jobId } = request.params as { orgId: string; jobId: string };
      requireOrgMatch(request, orgId);

      const job = await deps.db.query.jobs.findFirst({
        where: and(eq(schema.jobs.id, jobId), eq(schema.jobs.orgId, orgId)),
      });
      if (!job) throw new RatifyError({ code: "NOT_FOUND", message: "Job not found" });

      return {
        id: job.id,
        type: job.type,
        status: job.status,
        attemptCount: job.attemptCount,
        maxAttempts: job.maxAttempts,
        correlationId: job.correlationId,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      };
    },
  );

  app.get(
    "/orgs/:orgId/webhook-events",
    {
      schema: {
        tags: ["webhooks"],
        params: z.object({ orgId: z.string().uuid() }),
        response: { 200: z.array(WebhookReceiptSchema) },
      },
    },
    async (request) => {
      const { orgId } = request.params as { orgId: string };
      requireOrgMatch(request, orgId);

      const rows = await deps.db.query.webhookEvents.findMany({
        where: eq(schema.webhookEvents.orgId, orgId),
        orderBy: desc(schema.webhookEvents.receivedAt),
        limit: 100,
      });

      return rows.map((r) => ({
        id: r.id,
        deliveryId: r.deliveryId,
        eventType: r.eventType,
        action: r.action,
        status: r.status,
        signatureValid: r.signatureValid,
        receivedAt: r.receivedAt,
      }));
    },
  );

  app.get(
    "/orgs/:orgId/review-sessions/:reviewSessionId/publications",
    {
      schema: {
        tags: ["publications"],
        params: z.object({ orgId: z.string().uuid(), reviewSessionId: z.string().uuid() }),
        response: { 200: z.array(PublicationRecordSchema) },
      },
    },
    async (request) => {
      const { orgId, reviewSessionId } = request.params as { orgId: string; reviewSessionId: string };
      requireOrgMatch(request, orgId);

      const rows = await deps.db.query.publicationRecords.findMany({
        where: and(
          eq(schema.publicationRecords.orgId, orgId),
          eq(schema.publicationRecords.reviewSessionId, reviewSessionId),
        ),
      });

      return rows.map((r) => ({
        id: r.id,
        reviewSessionId: r.reviewSessionId,
        channel: r.channel,
        status: r.status,
        externalId: r.externalId,
        publishedAt: r.publishedAt,
        errorMessage: r.errorMessage,
      }));
    },
  );
}
