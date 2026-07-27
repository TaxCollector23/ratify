import { schema } from "@ratify/db";
import { and, eq } from "drizzle-orm";
import { runWorker, type FeedbackIngestPayload } from "@ratify/queue";
import { DoctrineStore, applyFeedbackAdjustment } from "@ratify/doctrine";
import { RatifyError } from "@ratify/shared";
import type { WorkerContext } from "../context.js";

/**
 * feedback.ingest: terminal job (not part of either ordered flow).
 * Applies a FeedbackEvent's effect to the originating Finding's confidence
 * and, when the finding is traceable to a DoctrineRule (via ruleKey match
 * on that repository), to the rule's confidence too — using the same
 * calibration formula defined in @ratify/doctrine/scoring.ts so both
 * paths stay consistent.
 */
export function startFeedbackIngestWorker(ctx: WorkerContext) {
  const { db, logger, metrics } = ctx;

  return runWorker<FeedbackIngestPayload>({
    db,
    jobType: "feedback.ingest",
    logger,
    handler: async (payload) => {
      const startedAt = Date.now();

      const feedbackEvent = await db.query.feedbackEvents.findFirst({
        where: eq(schema.feedbackEvents.id, payload.feedbackEventId),
      });
      if (!feedbackEvent) {
        throw new RatifyError({ code: "NOT_FOUND", message: `Feedback event ${payload.feedbackEventId} not found` });
      }

      const finding = await db.query.findings.findFirst({ where: eq(schema.findings.id, payload.findingId) });
      if (!finding) {
        throw new RatifyError({ code: "NOT_FOUND", message: `Finding ${payload.findingId} not found` });
      }

      const nextConfidence = applyFeedbackAdjustment(finding.confidence, feedbackEvent.kind);
      const nextStatus =
        feedbackEvent.kind === "false_positive"
          ? "dismissed"
          : feedbackEvent.kind === "exception" || feedbackEvent.kind === "temporary_exception"
            ? "excepted"
            : feedbackEvent.kind === "agree"
              ? "acknowledged"
              : finding.status;

      await db
        .update(schema.findings)
        .set({ confidence: nextConfidence, status: nextStatus, updatedAt: new Date() })
        .where(eq(schema.findings.id, finding.id));

      await db
        .update(schema.feedbackEvents)
        .set({ confidenceDelta: nextConfidence - finding.confidence, updatedAt: new Date() })
        .where(eq(schema.feedbackEvents.id, feedbackEvent.id));

      // Propagate to the corresponding DoctrineRule, if the finding's ruleKey matches one for this repository.
      let doctrineRuleId: string | undefined;
      const reviewSession = await db.query.reviewSessions.findFirst({
        where: eq(schema.reviewSessions.id, finding.reviewSessionId),
      });
      if (reviewSession) {
        const matchingRule = await db.query.doctrineRules.findFirst({
          where: and(eq(schema.doctrineRules.repositoryId, reviewSession.repositoryId), eq(schema.doctrineRules.key, finding.ruleKey)),
        });
        if (matchingRule) {
          const store = new DoctrineStore(db, payload.orgId);
          await store.adjustConfidenceFromFeedback(matchingRule.id, feedbackEvent.kind);
          doctrineRuleId = matchingRule.id;
        }
      }

      await metrics.emit({
        name: "feedback.received",
        orgId: payload.orgId,
        jobId: payload.jobId,
        durationMs: Date.now() - startedAt,
        success: true,
        attributes: { kind: feedbackEvent.kind, findingId: finding.id, doctrineRuleId: doctrineRuleId ?? "" },
      });

      // Terminal stage — no further job to enqueue.
      return { findingId: finding.id, nextConfidence, doctrineRuleId };
    },
  });
}
