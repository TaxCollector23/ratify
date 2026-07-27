import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { schema } from "@ratify/db";
import { and, eq } from "drizzle-orm";
import { RatifyError } from "@ratify/shared";
import { requireOrgMatch } from "../plugins/auth.js";
import type { AppDeps } from "../types.js";

const FeedbackEventKindEnum = z.enum([
  "agree",
  "disagree",
  "false_positive",
  "exception",
  "temporary_exception",
  "needs_human_review",
]);

const SubmitFeedbackBodySchema = z.object({
  kind: FeedbackEventKindEnum,
  comment: z.string().max(2000).optional(),
});

const FeedbackEventResponseSchema = z.object({
  id: z.string(),
  findingId: z.string(),
  kind: z.string(),
  comment: z.string().nullable(),
});

/** POST /orgs/:orgId/findings/:findingId/feedback — records a feedback event and enqueues ingestion. */
export function registerFeedbackRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.post(
    "/orgs/:orgId/findings/:findingId/feedback",
    {
      schema: {
        tags: ["feedback"],
        params: z.object({ orgId: z.string().uuid(), findingId: z.string().uuid() }),
        body: SubmitFeedbackBodySchema,
        response: { 201: FeedbackEventResponseSchema },
      },
    },
    async (request, reply) => {
      const { orgId, findingId } = request.params as { orgId: string; findingId: string };
      const body = request.body as z.infer<typeof SubmitFeedbackBodySchema>;
      requireOrgMatch(request, orgId);

      const finding = await deps.db.query.findings.findFirst({
        where: and(eq(schema.findings.id, findingId), eq(schema.findings.orgId, orgId)),
      });
      if (!finding) throw new RatifyError({ code: "NOT_FOUND", message: "Finding not found" });

      const [event] = await deps.db
        .insert(schema.feedbackEvents)
        .values({
          orgId,
          findingId,
          userId: request.authContext!.userId,
          kind: body.kind,
          comment: body.comment,
        })
        .returning();

      if (!event) throw new Error("Failed to persist feedback event");

      await deps.metrics.emit({ name: "feedback.received", orgId, attributes: { kind: body.kind, findingId } });

      const { enqueueJob } = await import("@ratify/queue");
      await enqueueJob({
        db: deps.db,
        jobType: "feedback.ingest",
        orgId,
        scopeId: event.id,
        payload: { findingId, feedbackEventId: event.id },
      });

      reply.code(201);
      return { id: event.id, findingId: event.findingId, kind: event.kind, comment: event.comment };
    },
  );
}
