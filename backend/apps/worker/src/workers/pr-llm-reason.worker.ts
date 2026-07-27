import { schema } from "@ratify/db";
import { eq } from "drizzle-orm";
import { runWorker, enqueueJob, nextStage, PR_ANALYSIS_FLOW, type PrLlmReasonPayload } from "@ratify/queue";
import type { LlmReasoningRequest } from "@ratify/llm";
import { RatifyError } from "@ratify/shared";
import type { WorkerContext } from "../context.js";
import { assemblePullRequestContext } from "../lib/pull-request-context.js";
import { retrievalResultKey } from "./pr-context-retrieve.worker.js";
import type { RetrievalResult } from "@ratify/retrieval";

/**
 * pr.llm_reason: third stage of PR_ANALYSIS_FLOW. Assembles the full
 * structured LlmReasoningRequest (diff summary, graph slice, retrieved
 * docs/precedents, doctrine rules, deterministic findings, ownership
 * context, risk-profile hint) and calls the injected LlmProvider
 * (MockLlmProvider by default — see WorkerContext / ASSUMPTIONS.md).
 * Persists the call as an AIReasoningRun row.
 */
export function startPrLlmReasonWorker(ctx: WorkerContext) {
  const { db, logger, metrics, objectStore, llmProvider } = ctx;

  return runWorker<PrLlmReasonPayload>({
    db,
    jobType: "pr.llm_reason",
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
        .set({ status: "running_ai_reasoning", updatedAt: new Date() })
        .where(eq(schema.reviewSessions.id, reviewSession.id));

      const [assembled, retrieval, doctrineRules, deterministicFindings] = await Promise.all([
        assemblePullRequestContext(db, payload.repositoryId, payload.pullRequestId),
        readRetrievalResult(objectStore, payload.orgId, reviewSession.id),
        db.query.doctrineRules.findMany({ where: eq(schema.doctrineRules.repositoryId, payload.repositoryId) }),
        db.query.findings.findMany({
          where: eq(schema.findings.reviewSessionId, reviewSession.id),
        }),
      ]);

      const diffSummary = buildDiffSummary(assembled);

      const request: LlmReasoningRequest = {
        orgId: payload.orgId,
        repositoryId: payload.repositoryId,
        reviewSessionId: reviewSession.id,
        diffSummary,
        graphSliceSummary: retrieval?.graphSliceSummary ?? "No graph context available.",
        retrievedDocs: (retrieval?.docs ?? []).map((d) => ({ title: d.title, excerpt: d.excerpt, source: d.source })),
        precedents: (retrieval?.precedents ?? []).map((p) => ({ title: p.title, summary: p.summary, outcome: p.outcome })),
        doctrineRules: doctrineRules
          .filter((r) => r.status !== "rejected")
          .map((r) => ({ key: r.key, statement: r.statement, kind: r.kind, confidence: r.confidence })),
        deterministicFindings: deterministicFindings.map((f) => ({ ruleKey: f.ruleKey, title: f.title, severity: f.severity })),
        ownershipContext: retrieval?.ownershipContext ?? [],
        riskProfileHint: {
          touchedSensitiveAreas: deterministicFindings.some((f) => f.ruleKey === "sensitive-area-modification"),
          hasBreakingApiChange: deterministicFindings.some((f) => f.ruleKey === "breaking-api-change"),
          missingTestCoverage: deterministicFindings.some((f) => f.ruleKey === "missing-tests-for-payments-paths"),
        },
      };

      await metrics.emit({
        name: "llm.call.started",
        orgId: payload.orgId,
        repositoryId: payload.repositoryId,
        reviewSessionId: reviewSession.id,
        jobId: payload.jobId,
        attributes: { provider: llmProvider.id },
      });

      const promptKey = `orgs/${payload.orgId}/review-sessions/${reviewSession.id}/llm-prompt.json`;
      const { contentHash: promptContentHash } = await objectStore.putObject(promptKey, JSON.stringify(request), "application/json");

      const [runRow] = await db
        .insert(schema.aiReasoningRuns)
        .values({
          orgId: payload.orgId,
          reviewSessionId: reviewSession.id,
          provider: llmProvider.id,
          model: "pending",
          status: "running",
          promptObjectStorageKey: promptKey,
          promptContentHash,
        })
        .returning();

      if (!runRow) throw new Error("Failed to insert AI reasoning run");

      try {
        const result = await llmProvider.runStructuredReasoning(request);

        await db
          .update(schema.aiReasoningRuns)
          .set({
            status: "succeeded",
            model: result.metadata.model,
            structuredOutput: result.output,
            inputTokens: Math.round(result.metadata.inputTokens),
            outputTokens: Math.round(result.metadata.outputTokens),
            latencyMs: result.metadata.latencyMs,
            overallConfidence: result.output.overallConfidence,
            updatedAt: new Date(),
          })
          .where(eq(schema.aiReasoningRuns.id, runRow.id));

        await metrics.emit({
          name: "llm.call.completed",
          orgId: payload.orgId,
          repositoryId: payload.repositoryId,
          reviewSessionId: reviewSession.id,
          jobId: payload.jobId,
          durationMs: Date.now() - startedAt,
          success: true,
          attributes: { provider: llmProvider.id, findingCount: result.output.findings.length },
        });

        const next = nextStage(PR_ANALYSIS_FLOW, "pr.llm_reason");
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

        return { aiReasoningRunId: runRow.id, findingCount: result.output.findings.length };
      } catch (err) {
        const isSchemaFailure = (err as { code?: string }).code === "SCHEMA_CONSTRAINT_FAILED";
        await db
          .update(schema.aiReasoningRuns)
          .set({
            status: isSchemaFailure ? "schema_validation_failed" : "failed",
            errorMessage: (err as Error).message,
            updatedAt: new Date(),
          })
          .where(eq(schema.aiReasoningRuns.id, runRow.id));

        await metrics.emit({
          name: isSchemaFailure ? "llm.schema_validation_failed" : "llm.call.failed",
          orgId: payload.orgId,
          repositoryId: payload.repositoryId,
          reviewSessionId: reviewSession.id,
          jobId: payload.jobId,
          durationMs: Date.now() - startedAt,
          success: false,
          attributes: { provider: llmProvider.id, error: (err as Error).message },
        });

        throw err;
      }
    },
  });
}

function buildDiffSummary(assembled: Awaited<ReturnType<typeof assemblePullRequestContext>>): string {
  const lines = assembled.fileChanges.map(
    (fc) => `${fc.status.toUpperCase()} ${fc.filePath} (+${fc.additions}/-${fc.deletions})`,
  );
  return lines.length > 0 ? lines.join("\n") : "No file changes detected.";
}

async function readRetrievalResult(
  objectStore: WorkerContext["objectStore"],
  orgId: string,
  reviewSessionId: string,
): Promise<RetrievalResult | null> {
  try {
    const buf = await objectStore.getObject(retrievalResultKey(orgId, reviewSessionId));
    return JSON.parse(buf.toString("utf-8")) as RetrievalResult;
  } catch {
    return null;
  }
}
