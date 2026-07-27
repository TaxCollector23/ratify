import { schema } from "@ratify/db";
import { eq } from "drizzle-orm";
import { runWorker, enqueueJob, nextStage, REPOSITORY_INDEXING_FLOW, type RepoGraphBuildPayload } from "@ratify/queue";
import { GraphRepository, buildGraphFromSymbolTable } from "@ratify/graph";
import type { SymbolTable } from "@ratify/parser";
import { RatifyError } from "@ratify/shared";
import type { WorkerContext } from "../context.js";

/**
 * repo.graph_build: reads the SymbolTables persisted by repo.parse from
 * object storage and feeds each one through @ratify/graph's deterministic
 * builder to construct/update GraphNode + GraphEdge rows.
 */
export function startRepoGraphBuildWorker(ctx: WorkerContext) {
  const { db, logger, metrics, objectStore } = ctx;

  return runWorker<RepoGraphBuildPayload>({
    db,
    jobType: "repo.graph_build",
    logger,
    handler: async (payload) => {
      const startedAt = Date.now();

      const snapshot = await db.query.repositorySnapshots.findFirst({
        where: eq(schema.repositorySnapshots.id, payload.snapshotId),
      });
      if (!snapshot) {
        throw new RatifyError({ code: "NOT_FOUND", message: `Snapshot ${payload.snapshotId} not found` });
      }

      const prefix = `orgs/${payload.orgId}/repositories/${snapshot.repositoryId}/symbol-tables/${snapshot.commitSha}/`;
      const keys = await objectStore.listObjectKeys(prefix);

      const graphRepo = new GraphRepository(db, payload.orgId);
      let builtCount = 0;

      for (const key of keys) {
        try {
          const buf = await objectStore.getObject(key);
          const table = JSON.parse(buf.toString("utf-8")) as SymbolTable;
          await buildGraphFromSymbolTable(graphRepo, snapshot.repositoryId, table);
          builtCount += 1;
        } catch (err) {
          logger.warn({ key, err: (err as Error).message }, "repo.graph_build: failed to build graph for symbol table");
        }
      }

      await metrics.emit({
        name: "graph.build.completed",
        orgId: payload.orgId,
        repositoryId: snapshot.repositoryId,
        jobId: payload.jobId,
        durationMs: Date.now() - startedAt,
        success: true,
        attributes: { fileCount: builtCount },
      });

      const next = nextStage(REPOSITORY_INDEXING_FLOW, "repo.graph_build");
      if (next) {
        await enqueueJob({
          db,
          jobType: next,
          orgId: payload.orgId,
          scopeId: snapshot.repositoryId,
          payload: { repositoryId: snapshot.repositoryId },
          idempotencyExtra: { snapshotId: snapshot.id },
        });
      }

      return { builtCount };
    },
  });
}
