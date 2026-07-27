import { schema } from "@ratify/db";
import { eq } from "drizzle-orm";
import { runWorker, enqueueJob, nextStage, PR_ANALYSIS_FLOW, type PrContextRetrievePayload } from "@ratify/queue";
import { ContextRetriever } from "@ratify/retrieval";
import { RatifyError, orgStorageKey } from "@ratify/shared";
import type { WorkerContext } from "../context.js";
import { assemblePullRequestContext } from "../lib/pull-request-context.js";

/**
 * pr.context_retrieve: second stage of PR_ANALYSIS_FLOW. Runs
 * @ratify/retrieval's ContextRetriever (structural + graph + optional
 * semantic search) over the PR's touched files and persists the result
 * to object storage keyed by review session, since RetrievalResult is a
 * transient job artifact rather than something with its own table — the
 * next stage (pr.llm_reason) reads it back by reviewSessionId.
 */
export function startPrContextRetrieveWorker(ctx: WorkerContext) {
  const { db, logger, metrics, objectStore } = ctx;

  return runWorker<PrContextRetrievePayload>({
    db,
    jobType: "pr.context_retrieve",
    logger,
    handler: async (payload) => {
      const startedAt = Date.now();

      const reviewSession = await db.query.reviewSessions.findFirst({
        where: eq(schema.reviewSessions.id, payload.reviewSessionId),
      });
      if (!reviewSession) {
        throw new RatifyError({ code: "NOT_FOUND", message: `Review session ${payload.reviewSessionId} not found` });
      }

      await db
        .update(schema.reviewSessions)
        .set({ status: "gathering_context", updatedAt: new Date() })
        .where(eq(schema.reviewSessions.id, reviewSession.id));

      const assembled = await assemblePullRequestContext(db, payload.repositoryId, payload.pullRequestId);

      const retriever = new ContextRetriever(db, payload.orgId);
      const result = await retriever.retrieve({
        orgId: payload.orgId,
        repositoryId: payload.repositoryId,
        touchedFilePaths: assembled.touchedFilePaths,
        // No embedding model wired up in this environment; structural + graph retrieval still runs.
        // See backend/ASSUMPTIONS.md.
      });

      const key = retrievalResultKey(payload.orgId, reviewSession.id);
      await objectStore.putObject(key, JSON.stringify(result), "application/json");

      await metrics.emit({
        name: "retrieval.query",
        orgId: payload.orgId,
        repositoryId: payload.repositoryId,
        reviewSessionId: reviewSession.id,
        jobId: payload.jobId,
        durationMs: Date.now() - startedAt,
        success: true,
        attributes: { docCount: result.docs.length, precedentCount: result.precedents.length },
      });

      const next = nextStage(PR_ANALYSIS_FLOW, "pr.context_retrieve");
      if (next) {
        await enqueueJob({
          db,
          jobType: next,
          orgId: payload.orgId,
          scopeId: reviewSession.id,
          payload: {
            repositoryId: payload.repositoryId,
            pullRequestId: payload.pullRequestId,
            reviewSessionId: reviewSession.id,
            headSha: payload.headSha,
          },
          idempotencyExtra: { headSha: payload.headSha },
        });
      }

      return { docCount: result.docs.length, precedentCount: result.precedents.length, contextStorageKey: key };
    },
  });
}

export function retrievalResultKey(orgId: string, reviewSessionId: string): string {
  return orgStorageKey(orgId, "review-sessions", reviewSessionId, "retrieval-result.json");
}
