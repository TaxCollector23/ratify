import { schema } from "@ratify/db";
import { eq } from "drizzle-orm";
import { runWorker, enqueueJob, nextStage, PR_ANALYSIS_FLOW, type PrPolicyCheckPayload } from "@ratify/queue";
import { runPolicyEngine, DEFAULT_POLICY_CONFIG } from "@ratify/policy-engine";
import { RatifyError } from "@ratify/shared";
import type { WorkerContext } from "../context.js";
import { assemblePullRequestContext, buildPolicyCheckContext } from "../lib/pull-request-context.js";

/**
 * pr.policy_check: first stage of PR_ANALYSIS_FLOW. Runs the deterministic
 * @ratify/policy-engine rules against the PR's diff and persists results
 * as Finding rows with source="policy-engine" (matching findingSourceEnum).
 */
export function startPrPolicyCheckWorker(ctx: WorkerContext) {
  const { db, logger, metrics } = ctx;

  return runWorker<PrPolicyCheckPayload>({
    db,
    jobType: "pr.policy_check",
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
        .set({ status: "running_policy_checks", startedAt: reviewSession.startedAt ?? new Date().toISOString(), updatedAt: new Date() })
        .where(eq(schema.reviewSessions.id, reviewSession.id));

      const assembled = await assemblePullRequestContext(db, payload.repositoryId, payload.pullRequestId);
      const policyCtx = buildPolicyCheckContext(payload.orgId, payload.repositoryId, payload.pullRequestId, assembled, DEFAULT_POLICY_CONFIG);

      const { findings, ruleErrors } = await runPolicyEngine(policyCtx);

      if (ruleErrors.length > 0) {
        logger.warn({ reviewSessionId: reviewSession.id, ruleErrors }, "pr.policy_check: one or more rules threw");
      }

      if (findings.length > 0) {
        await db.insert(schema.findings).values(
          findings.map((f) => ({
            orgId: payload.orgId,
            reviewSessionId: reviewSession.id,
            ruleKey: f.ruleKey,
            source: "policy-engine" as const,
            title: f.title,
            description: f.description,
            severity: f.severity,
            confidence: f.confidence,
            filePath: f.filePath,
            lineStart: f.lineStart,
            lineEnd: f.lineEnd,
            remediation: f.remediation,
            metadata: { evidence: f.evidence },
          })),
        );
      }

      await metrics.emit({
        name: "policy.check.completed",
        orgId: payload.orgId,
        repositoryId: payload.repositoryId,
        reviewSessionId: reviewSession.id,
        jobId: payload.jobId,
        durationMs: Date.now() - startedAt,
        success: true,
        attributes: { findingCount: findings.length, ruleErrorCount: ruleErrors.length },
      });

      const next = nextStage(PR_ANALYSIS_FLOW, "pr.policy_check");
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

      return { findingCount: findings.length, touchedFileCount: assembled.touchedFilePaths.length };
    },
  });
}
