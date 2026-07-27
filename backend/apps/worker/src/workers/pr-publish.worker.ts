import { schema } from "@ratify/db";
import { and, desc, eq } from "drizzle-orm";
import { runWorker, type PrPublishPayload } from "@ratify/queue";
import { ReviewPublisher } from "@ratify/github";
import { getGitHubAppClient } from "@ratify/github";
import { RatifyError } from "@ratify/shared";
import type { WorkerContext } from "../context.js";

/**
 * pr.publish: terminal stage of PR_ANALYSIS_FLOW. Posts a concise GitHub
 * check-run (top 1-3 findings + link to the full report) via
 * @ratify/github's ReviewPublisher, persists a PublicationRecord, and
 * marks the ReviewSession completed.
 *
 * Live GitHub API calls require a real installation token, which isn't
 * available in this sandbox — publish failures are recorded (not
 * silently swallowed) as `publication_records.status = "failed"` and the
 * job still completes the review session bookkeeping. See
 * backend/ASSUMPTIONS.md.
 */
export function startPrPublishWorker(ctx: WorkerContext) {
  const { db, logger, metrics } = ctx;

  return runWorker<PrPublishPayload>({
    db,
    jobType: "pr.publish",
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
        .set({ status: "publishing", updatedAt: new Date() })
        .where(eq(schema.reviewSessions.id, reviewSession.id));

      const [repository, pullRequest, installation, scoreSnapshot, findings] = await Promise.all([
        db.query.repositories.findFirst({ where: eq(schema.repositories.id, payload.repositoryId) }),
        db.query.pullRequests.findFirst({ where: eq(schema.pullRequests.id, payload.pullRequestId) }),
        db.query.repositories
          .findFirst({ where: eq(schema.repositories.id, payload.repositoryId) })
          .then((repo) =>
            repo ? db.query.githubInstallations.findFirst({ where: eq(schema.githubInstallations.id, repo.installationId) }) : null,
          ),
        db.query.scoreSnapshots.findFirst({
          where: eq(schema.scoreSnapshots.reviewSessionId, reviewSession.id),
          orderBy: desc(schema.scoreSnapshots.createdAt),
        }),
        db.query.findings.findMany({
          where: eq(schema.findings.reviewSessionId, reviewSession.id),
          orderBy: desc(schema.findings.confidence),
        }),
      ]);

      if (!repository || !pullRequest) {
        throw new RatifyError({ code: "NOT_FOUND", message: "Repository or pull request not found for publish" });
      }

      const severityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
      const topFindings = [...findings]
        .sort((a, b) => (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0) || b.confidence - a.confidence)
        .slice(0, 3)
        .map((f) => ({ title: f.title, severity: f.severity }));

      const reportUrl = `${process.env.RATIFY_APP_URL ?? "https://app.ratify.dev"}/review-sessions/${reviewSession.id}`;

      const severityCounts: Record<string, number> = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
      for (const f of findings) severityCounts[f.severity] = (severityCounts[f.severity] ?? 0) + 1;

      let publicationStatus: "published" | "failed" = "published";
      let externalId: string | undefined;
      let errorMessage: string | undefined;

      try {
        if (!installation) throw new RatifyError({ code: "NOT_FOUND", message: "No GitHub installation found for repository" });

        const octokit = await getGitHubAppClient().getInstallationClient(installation.installationId);
        const publisher = new ReviewPublisher(octokit);
        const result = await publisher.publishCheckRun({
          owner: repository.owner,
          repo: repository.name,
          headSha: payload.headSha,
          pullRequestNumber: pullRequest.githubPrNumber,
          riskScore: scoreSnapshot?.overallScore ?? 0,
          severityCounts,
          topFindings,
          reportUrl,
        });
        externalId = String(result.checkRunId);
      } catch (err) {
        publicationStatus = "failed";
        errorMessage = (err as Error).message;
        logger.error({ reviewSessionId: reviewSession.id, err: errorMessage }, "pr.publish: failed to publish to GitHub");
      }

      await db.insert(schema.publicationRecords).values({
        orgId: payload.orgId,
        reviewSessionId: reviewSession.id,
        channel: "github-check-run",
        externalId,
        status: publicationStatus,
        payloadSummary: `risk=${scoreSnapshot?.overallScore ?? 0}, findings=${findings.length}, top=${topFindings.map((f) => f.title).join("; ")}`,
        errorMessage,
        publishedAt: publicationStatus === "published" ? new Date().toISOString() : undefined,
      });

      await db
        .update(schema.reviewSessions)
        .set({
          status: publicationStatus === "published" ? "completed" : "failed",
          completedAt: new Date().toISOString(),
          failureReason: errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(schema.reviewSessions.id, reviewSession.id));

      await metrics.emit({
        name: publicationStatus === "published" ? "review.published" : "review.publish_failed",
        orgId: payload.orgId,
        repositoryId: payload.repositoryId,
        reviewSessionId: reviewSession.id,
        jobId: payload.jobId,
        durationMs: Date.now() - startedAt,
        success: publicationStatus === "published",
        attributes: { riskScore: scoreSnapshot?.overallScore ?? 0, findingCount: findings.length },
      });

      // Terminal stage of PR_ANALYSIS_FLOW — nothing further to enqueue.
      return { publicationStatus, riskScore: scoreSnapshot?.overallScore ?? 0 };
    },
  });
}
