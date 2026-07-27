import { schema } from "@ratify/db";
import { eq } from "drizzle-orm";
import { runWorker, enqueueJob, nextStage, REPOSITORY_INDEXING_FLOW, type RepoSyncPayload } from "@ratify/queue";
import { syncRepository } from "@ratify/repo-sync";
import { RatifyError } from "@ratify/shared";
import type { WorkerContext } from "../context.js";

/**
 * repo.sync: clones/updates the repository working copy, records a
 * RepositorySnapshot row (content-addressed), and enqueues repo.parse —
 * the first stage of REPOSITORY_INDEXING_FLOW.
 */
export function startRepoSyncWorker(ctx: WorkerContext) {
  const { db, logger, metrics, workDir } = ctx;

  return runWorker<RepoSyncPayload>({
    db,
    jobType: "repo.sync",
    logger,
    handler: async (payload) => {
      const startedAt = Date.now();
      await metrics.emit({
        name: "repo.sync.started",
        orgId: payload.orgId,
        repositoryId: payload.repositoryId,
        jobId: payload.jobId,
      });

      const repository = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, payload.repositoryId),
      });
      if (!repository) {
        throw new RatifyError({ code: "NOT_FOUND", message: `Repository ${payload.repositoryId} not found` });
      }

      await db
        .update(schema.repositories)
        .set({ indexingStatus: "indexing", updatedAt: new Date() })
        .where(eq(schema.repositories.id, repository.id));

      const syncResult = await syncRepository({
        cloneUrl: repository.cloneUrl,
        ref: payload.ref === "HEAD" ? repository.defaultBranch : payload.ref,
        workDir,
        cacheKey: `${repository.owner}/${repository.name}`,
        // Deep-ish sync on manual triggers: history-mine benefits from a fuller commit log.
        shallow: payload.reason !== "manual",
      });

      const existingSnapshot = await db.query.repositorySnapshots.findFirst({
        where: eq(schema.repositorySnapshots.contentHash, syncResult.contentHash),
      });

      const [snapshot] = existingSnapshot
        ? await db
            .update(schema.repositorySnapshots)
            .set({
              syncStatus: "ready",
              fileCount: syncResult.filePaths.length,
              sizeBytes: syncResult.sizeBytes,
              updatedAt: new Date(),
            })
            .where(eq(schema.repositorySnapshots.id, existingSnapshot.id))
            .returning()
        : await db
            .insert(schema.repositorySnapshots)
            .values({
              orgId: payload.orgId,
              repositoryId: repository.id,
              ref: syncResult.ref,
              commitSha: syncResult.commitSha,
              isShallow: syncResult.isShallow,
              // Working copy lives on local disk, not object storage — see backend/ASSUMPTIONS.md.
              objectStorageKey: `local://${syncResult.workingDirectory}`,
              contentHash: syncResult.contentHash,
              fileCount: syncResult.filePaths.length,
              sizeBytes: syncResult.sizeBytes,
              syncStatus: "ready",
            })
            .returning();

      if (!snapshot) throw new Error("Failed to persist repository snapshot");

      await db
        .update(schema.repositories)
        .set({ lastIndexedAt: new Date().toISOString(), updatedAt: new Date() })
        .where(eq(schema.repositories.id, repository.id));

      await metrics.emit({
        name: "repo.sync.completed",
        orgId: payload.orgId,
        repositoryId: payload.repositoryId,
        jobId: payload.jobId,
        durationMs: Date.now() - startedAt,
        success: true,
        attributes: { commitSha: syncResult.commitSha, fileCount: syncResult.filePaths.length },
      });

      const next = nextStage(REPOSITORY_INDEXING_FLOW, "repo.sync");
      if (next) {
        await enqueueJob({
          db,
          jobType: next,
          orgId: payload.orgId,
          scopeId: repository.id,
          payload: { repositoryId: repository.id, snapshotId: snapshot.id },
          idempotencyExtra: { snapshotId: snapshot.id },
        });
      }

      return { snapshotId: snapshot.id, commitSha: syncResult.commitSha, workingDirectory: syncResult.workingDirectory };
    },
  });
}
