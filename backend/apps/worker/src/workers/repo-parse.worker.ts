import { readFile, stat } from "node:fs/promises";
import { schema } from "@ratify/db";
import { eq } from "drizzle-orm";
import { runWorker, enqueueJob, nextStage, REPOSITORY_INDEXING_FLOW, type RepoParsePayload } from "@ratify/queue";
import { getDefaultParserRegistry } from "@ratify/parser";
import { listTrackedFilesInWorkingDirectory } from "@ratify/repo-sync";
import { RatifyError } from "@ratify/shared";
import type { WorkerContext } from "../context.js";
import { localWorkingDirectoryFor } from "../lib/snapshot.js";

const MAX_FILE_BYTES = 1_000_000; // skip pathologically large generated files

/**
 * repo.parse: runs @ratify/parser's Tree-sitter plugins over every
 * parseable file in the snapshot's working directory and persists each
 * file's SymbolTable to object storage (content-addressed, one blob per
 * file) so repo.graph_build can consume them without re-parsing.
 */
export function startRepoParseWorker(ctx: WorkerContext) {
  const { db, logger, metrics, objectStore } = ctx;
  const registry = getDefaultParserRegistry();

  return runWorker<RepoParsePayload>({
    db,
    jobType: "repo.parse",
    logger,
    handler: async (payload) => {
      const startedAt = Date.now();

      const snapshot = await db.query.repositorySnapshots.findFirst({
        where: eq(schema.repositorySnapshots.id, payload.snapshotId),
      });
      if (!snapshot) {
        throw new RatifyError({ code: "NOT_FOUND", message: `Snapshot ${payload.snapshotId} not found` });
      }

      const workingDirectory = localWorkingDirectoryFor(snapshot.objectStorageKey);
      const filePaths = await listTrackedFilesInWorkingDirectory(workingDirectory);

      const parsedFilePaths: string[] = [];
      let parseErrorCount = 0;

      for (const filePath of filePaths) {
        if (!registry.pluginFor(filePath)) continue;
        try {
          const absPath = `${workingDirectory}/${filePath}`;
          const fileStat = await stat(absPath);
          if (fileStat.size > MAX_FILE_BYTES) continue;

          const sourceText = await readFile(absPath, "utf-8");
          const table = await registry.parseFile(filePath, sourceText);
          if (!table) continue;
          if (table.hasSyntaxError) parseErrorCount += 1;

          const key = `orgs/${payload.orgId}/repositories/${snapshot.repositoryId}/symbol-tables/${snapshot.commitSha}/${filePath}.json`;
          await objectStore.putObject(key, JSON.stringify(table), "application/json");
          parsedFilePaths.push(filePath);
        } catch (err) {
          parseErrorCount += 1;
          logger.warn({ filePath, err: (err as Error).message }, "repo.parse: failed to parse file");
        }
      }

      await metrics.emit({
        name: "parser.run",
        orgId: payload.orgId,
        repositoryId: snapshot.repositoryId,
        jobId: payload.jobId,
        durationMs: Date.now() - startedAt,
        success: true,
        attributes: { parsedFileCount: parsedFilePaths.length, parseErrorCount, totalFileCount: filePaths.length },
      });

      const next = nextStage(REPOSITORY_INDEXING_FLOW, "repo.parse");
      if (next) {
        await enqueueJob({
          db,
          jobType: next,
          orgId: payload.orgId,
          scopeId: snapshot.repositoryId,
          payload: { repositoryId: snapshot.repositoryId, snapshotId: snapshot.id },
          idempotencyExtra: { snapshotId: snapshot.id },
        });
      }

      return { parsedFileCount: parsedFilePaths.length, parseErrorCount, commitSha: snapshot.commitSha };
    },
  });
}
