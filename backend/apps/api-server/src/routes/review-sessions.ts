import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { schema } from "@ratify/db";
import { and, desc, eq } from "drizzle-orm";
import { RatifyError } from "@ratify/shared";
import { requireOrgMatch } from "../plugins/auth.js";
import type { AppDeps } from "../types.js";

const ReviewSessionSchema = z.object({
  id: z.string(),
  repositoryId: z.string(),
  pullRequestId: z.string(),
  headSha: z.string(),
  status: z.string(),
  triggeredBy: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});

const TimelineEventSchema = z.object({
  name: z.string(),
  occurredAt: z.string(),
  durationMs: z.number().nullable(),
  success: z.string().nullable(),
  attributes: z.record(z.string(), z.unknown()),
});

export function registerReviewSessionRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get(
    "/orgs/:orgId/repositories/:repositoryId/review-sessions",
    {
      schema: {
        tags: ["review-sessions"],
        params: z.object({ orgId: z.string().uuid(), repositoryId: z.string().uuid() }),
        response: { 200: z.array(ReviewSessionSchema) },
      },
    },
    async (request) => {
      const { orgId, repositoryId } = request.params as { orgId: string; repositoryId: string };
      requireOrgMatch(request, orgId);

      const sessions = await deps.db.query.reviewSessions.findMany({
        where: and(eq(schema.reviewSessions.orgId, orgId), eq(schema.reviewSessions.repositoryId, repositoryId)),
        orderBy: desc(schema.reviewSessions.createdAt),
        limit: 100,
      });

      return sessions.map(toSessionDto);
    },
  );

  app.get(
    "/orgs/:orgId/review-sessions/:reviewSessionId",
    {
      schema: {
        tags: ["review-sessions"],
        params: z.object({ orgId: z.string().uuid(), reviewSessionId: z.string().uuid() }),
        response: { 200: ReviewSessionSchema },
      },
    },
    async (request) => {
      const { orgId, reviewSessionId } = request.params as { orgId: string; reviewSessionId: string };
      requireOrgMatch(request, orgId);
      const session = await findSessionOrThrow(deps, orgId, reviewSessionId);
      return toSessionDto(session);
    },
  );

  app.get(
    "/orgs/:orgId/review-sessions/:reviewSessionId/timeline",
    {
      schema: {
        tags: ["review-sessions"],
        params: z.object({ orgId: z.string().uuid(), reviewSessionId: z.string().uuid() }),
        response: { 200: z.array(TimelineEventSchema) },
      },
    },
    async (request) => {
      const { orgId, reviewSessionId } = request.params as { orgId: string; reviewSessionId: string };
      requireOrgMatch(request, orgId);
      await findSessionOrThrow(deps, orgId, reviewSessionId);

      const events = await deps.db.query.metricsEvents.findMany({
        where: eq(schema.metricsEvents.reviewSessionId, reviewSessionId),
        orderBy: schema.metricsEvents.occurredAt,
      });

      return events.map((e) => ({
        name: e.name,
        occurredAt: e.occurredAt,
        durationMs: e.durationMs,
        success: e.success,
        attributes: e.attributes,
      }));
    },
  );

  app.post(
    "/orgs/:orgId/review-sessions/:reviewSessionId/rerun",
    {
      schema: {
        tags: ["review-sessions"],
        params: z.object({ orgId: z.string().uuid(), reviewSessionId: z.string().uuid() }),
        response: { 202: z.object({ status: z.literal("queued"), jobRowId: z.string() }) },
      },
    },
    async (request, reply) => {
      const { orgId, reviewSessionId } = request.params as { orgId: string; reviewSessionId: string };
      requireOrgMatch(request, orgId);
      const session = await findSessionOrThrow(deps, orgId, reviewSessionId);

      const { enqueueJob } = await import("@ratify/queue");
      const result = await enqueueJob({
        db: deps.db,
        jobType: "pr.policy_check",
        orgId,
        scopeId: session.pullRequestId,
        payload: {
          repositoryId: session.repositoryId,
          pullRequestId: session.pullRequestId,
          reviewSessionId: session.id,
          headSha: session.headSha,
        },
        idempotencyExtra: { rerunAt: Date.now() },
      });

      reply.code(202);
      return { status: "queued" as const, jobRowId: result.jobRowId };
    },
  );
}

async function findSessionOrThrow(deps: AppDeps, orgId: string, reviewSessionId: string) {
  const session = await deps.db.query.reviewSessions.findFirst({
    where: and(eq(schema.reviewSessions.id, reviewSessionId), eq(schema.reviewSessions.orgId, orgId)),
  });
  if (!session) throw new RatifyError({ code: "NOT_FOUND", message: "Review session not found" });
  return session;
}

function toSessionDto(session: typeof schema.reviewSessions.$inferSelect) {
  return {
    id: session.id,
    repositoryId: session.repositoryId,
    pullRequestId: session.pullRequestId,
    headSha: session.headSha,
    status: session.status,
    triggeredBy: session.triggeredBy,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
  };
}
