import { schema } from "@ratify/db";
import { and, desc, eq } from "drizzle-orm";
import { runWorker, enqueueJob, nextStage, REPOSITORY_INDEXING_FLOW, type RepoHistoryMinePayload } from "@ratify/queue";
import { listRecentCommits, listTrackedFilesInWorkingDirectory, readWorkingTreeFile } from "@ratify/repo-sync";
import { mineHistory, HistoryMinerStore, classifyDocumentPath } from "@ratify/history-miner";
import { RatifyError } from "@ratify/shared";
import type { WorkerContext } from "../context.js";
import { localWorkingDirectoryFor } from "../lib/snapshot.js";

const MAX_COMMITS = 200;
const MAX_DOC_BYTES = 300_000;

/**
 * repo.history_mine: mines commit history + on-disk documents (README,
 * ADR/RFC, CODEOWNERS, CI config) from the most recent successful
 * snapshot's working directory into HistoricalPrecedent + DocumentArtifact
 * rows, and feeds derived RawHistorySignals into @ratify/doctrine's
 * inference pass in the next stage.
 *
 * GitHub API access (merged-PR titles/review comments) is intentionally
 * not required here — see backend/ASSUMPTIONS.md: this stage works
 * end-to-end from local git history alone, which is what's available in
 * this sandbox, and layering in GitHubApiClient.listMergedPullRequests
 * is a drop-in addition once a live installation token is available.
 */
export function startRepoHistoryMineWorker(ctx: WorkerContext) {
  const { db, logger, metrics } = ctx;

  return runWorker<RepoHistoryMinePayload>({
    db,
    jobType: "repo.history_mine",
    logger,
    handler: async (payload) => {
      const startedAt = Date.now();

      const repository = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, payload.repositoryId),
      });
      if (!repository) {
        throw new RatifyError({ code: "NOT_FOUND", message: `Repository ${payload.repositoryId} not found` });
      }

      const snapshot = await db.query.repositorySnapshots.findFirst({
        where: and(
          eq(schema.repositorySnapshots.repositoryId, repository.id),
          eq(schema.repositorySnapshots.syncStatus, "ready"),
        ),
        orderBy: desc(schema.repositorySnapshots.createdAt),
      });
      if (!snapshot) {
        throw new RatifyError({ code: "NOT_FOUND", message: `No ready snapshot found for repository ${repository.id}` });
      }

      const workingDirectory = localWorkingDirectoryFor(snapshot.objectStorageKey);
      const filePaths = await listTrackedFilesInWorkingDirectory(workingDirectory);

      const candidateDocuments: { filePath: string; content: string; commitSha: string }[] = [];
      for (const filePath of filePaths) {
        if (!classifyDocumentPath(filePath)) continue;
        const content = await readWorkingTreeFile(workingDirectory, filePath);
        if (content === null || content.length > MAX_DOC_BYTES) continue;
        candidateDocuments.push({ filePath, content, commitSha: snapshot.commitSha });
      }

      const codeownersContent =
        candidateDocuments.find((d) => classifyDocumentPath(d.filePath) === "codeowners")?.content ?? null;

      const commits = await listRecentCommits(workingDirectory, {
        maxCount: MAX_COMMITS,
        sinceCommitSha: payload.sinceCommitSha,
      });

      const mined = mineHistory({
        mergedPullRequests: [], // no live GitHub API access in this environment; see doc comment above
        commits,
        candidateDocuments,
        codeownersContent,
      });

      const store = new HistoryMinerStore(db, payload.orgId, ctx.objectStore);
      const { documentIds, precedentIds } = await store.persistAll(repository.id, mined.documents, mined.precedents);

      await metrics.emit({
        name: "history.mine.completed",
        orgId: payload.orgId,
        repositoryId: repository.id,
        jobId: payload.jobId,
        durationMs: Date.now() - startedAt,
        success: true,
        attributes: {
          documentCount: documentIds.length,
          precedentCount: precedentIds.length,
          doctrineSignalCount: mined.doctrineSignals.length,
          commitCount: commits.length,
        },
      });

      const next = nextStage(REPOSITORY_INDEXING_FLOW, "repo.history_mine");
      if (next) {
        await enqueueJob({
          db,
          jobType: next,
          orgId: payload.orgId,
          scopeId: repository.id,
          payload: { repositoryId: repository.id },
          idempotencyExtra: { snapshotId: snapshot.id },
        });
      }

      return { documentCount: documentIds.length, precedentCount: precedentIds.length };
    },
  });
}
