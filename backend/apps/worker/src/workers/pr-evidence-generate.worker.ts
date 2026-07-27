import { schema } from "@ratify/db";
import { and, desc, eq } from "drizzle-orm";
import { runWorker, enqueueJob, nextStage, PR_ANALYSIS_FLOW, type PrEvidenceGeneratePayload } from "@ratify/queue";
import { generateEvidence, EvidenceStore, type RawFindingInput, type PrecedentForLinking } from "@ratify/evidence-generator";
import { RatifyError } from "@ratify/shared";
import type { WorkerContext } from "../context.js";

/**
 * pr.evidence_generate: fourth stage of PR_ANALYSIS_FLOW. Combines the
 * deterministic Finding rows from pr.policy_check with the LLM findings
 * from the latest AIReasoningRun, blends confidence per
 * @ratify/evidence-generator, links historical precedents, replaces the
 * review session's Finding set with the generated (scored) findings, and
 * writes a ScoreSnapshot.
 */
export function startPrEvidenceGenerateWorker(ctx: WorkerContext) {
  const { db, logger, metrics } = ctx;

  return runWorker<PrEvidenceGeneratePayload>({
    db,
    jobType: "pr.evidence_generate",
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
        .set({ status: "scoring", updatedAt: new Date() })
        .where(eq(schema.reviewSessions.id, reviewSession.id));

      const [policyFindings, latestRun, precedents] = await Promise.all([
        db.query.findings.findMany({ where: eq(schema.findings.reviewSessionId, reviewSession.id) }),
        db.query.aiReasoningRuns.findFirst({
          where: and(eq(schema.aiReasoningRuns.reviewSessionId, reviewSession.id), eq(schema.aiReasoningRuns.status, "succeeded")),
          orderBy: desc(schema.aiReasoningRuns.createdAt),
        }),
        db.query.historicalPrecedents.findMany({ where: eq(schema.historicalPrecedents.repositoryId, payload.repositoryId) }),
      ]);

      const rawFindings: RawFindingInput[] = policyFindings.map((f) => ({
        source: "policy-engine",
        ruleKey: f.ruleKey,
        title: f.title,
        description: f.description,
        severity: f.severity,
        confidence: f.confidence,
        filePath: f.filePath ?? undefined,
        lineStart: f.lineStart ?? undefined,
        lineEnd: f.lineEnd ?? undefined,
        remediation: f.remediation ?? undefined,
        falsePositiveLikelihood: f.falsePositiveLikelihood ?? undefined,
        evidence: (f.metadata as { evidence?: { kind: string; ref: string; excerpt?: string; url?: string }[] } | null)?.evidence ?? [],
      }));

      const structuredOutput = latestRun?.structuredOutput as
        | { findings: { title: string; description: string; severity: string; confidence: number; filePath?: string; lineStart?: number; lineEnd?: number; remediation?: string; falsePositiveLikelihood?: number; evidence: { kind: string; ref: string; excerpt?: string; url?: string }[] }[] }
        | null;

      for (const llmFinding of structuredOutput?.findings ?? []) {
        rawFindings.push({
          source: "llm-reasoner",
          ruleKey: slugify(llmFinding.title),
          title: llmFinding.title,
          description: llmFinding.description,
          severity: llmFinding.severity as RawFindingInput["severity"],
          confidence: llmFinding.confidence,
          filePath: llmFinding.filePath,
          lineStart: llmFinding.lineStart,
          lineEnd: llmFinding.lineEnd,
          remediation: llmFinding.remediation,
          falsePositiveLikelihood: llmFinding.falsePositiveLikelihood,
          evidence: llmFinding.evidence,
        });
      }

      const precedentsForLinking: PrecedentForLinking[] = precedents.map((p) => ({
        id: p.id,
        title: p.title,
        relatedPathGlobs: p.relatedPathGlobs,
        outcome: p.outcome,
      }));

      const generatedFindings = generateEvidence({ findings: rawFindings, precedents: precedentsForLinking });

      // Replace the review session's Finding set with the generated (scored, deduplicated,
      // precedent-linked) findings — the raw policy-engine rows inserted in pr.policy_check
      // were an intermediate artifact, superseded here by the calibrated result.
      await db.delete(schema.findings).where(eq(schema.findings.reviewSessionId, reviewSession.id));

      const store = new EvidenceStore(db, payload.orgId);
      const findingIds = await store.persistFindings(reviewSession.id, generatedFindings);
      const score = await store.persistScoreSnapshot(reviewSession.id, generatedFindings);

      await metrics.emit({
        name: "evidence.generated",
        orgId: payload.orgId,
        repositoryId: payload.repositoryId,
        reviewSessionId: reviewSession.id,
        jobId: payload.jobId,
        durationMs: Date.now() - startedAt,
        success: true,
        attributes: { findingCount: findingIds.length, overallScore: score.overallScore },
      });

      const next = nextStage(PR_ANALYSIS_FLOW, "pr.evidence_generate");
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

      return { findingCount: findingIds.length, overallScore: score.overallScore };
    },
  });
}

function slugify(text: string): string {
  return `llm-${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48)}`;
}
