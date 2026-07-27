import type { Worker } from "bullmq";
import { closeDb } from "@ratify/db";
import { closeRedisConnection, closeAllQueues } from "@ratify/queue";
import { initTracing } from "@ratify/observability";
import { buildWorkerContext } from "./context.js";
import { startRepoSyncWorker } from "./workers/repo-sync.worker.js";
import { startRepoParseWorker } from "./workers/repo-parse.worker.js";
import { startRepoGraphBuildWorker } from "./workers/repo-graph-build.worker.js";
import { startRepoHistoryMineWorker } from "./workers/repo-history-mine.worker.js";
import { startRepoDoctrineInferWorker } from "./workers/repo-doctrine-infer.worker.js";
import { startPrPolicyCheckWorker } from "./workers/pr-policy-check.worker.js";
import { startPrContextRetrieveWorker } from "./workers/pr-context-retrieve.worker.js";
import { startPrLlmReasonWorker } from "./workers/pr-llm-reason.worker.js";
import { startPrEvidenceGenerateWorker } from "./workers/pr-evidence-generate.worker.js";
import { startPrPublishWorker } from "./workers/pr-publish.worker.js";
import { startFeedbackIngestWorker } from "./workers/feedback-ingest.worker.js";

/**
 * apps/worker entrypoint: starts one BullMQ Worker per job type (11
 * total), covering both REPOSITORY_INDEXING_FLOW and PR_ANALYSIS_FLOW
 * plus the standalone feedback.ingest job. Each worker is built via
 * `runWorker()` from @ratify/queue, which owns all Job/JobAttempt
 * bookkeeping — handlers here only implement business logic and chain to
 * the next stage via `enqueueJob` + `nextStage`.
 */
async function main() {
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    initTracing("ratify-worker");
  }

  const ctx = buildWorkerContext();

  const workers: Worker[] = [
    startRepoSyncWorker(ctx),
    startRepoParseWorker(ctx),
    startRepoGraphBuildWorker(ctx),
    startRepoHistoryMineWorker(ctx),
    startRepoDoctrineInferWorker(ctx),
    startPrPolicyCheckWorker(ctx),
    startPrContextRetrieveWorker(ctx),
    startPrLlmReasonWorker(ctx),
    startPrEvidenceGenerateWorker(ctx),
    startPrPublishWorker(ctx),
    startFeedbackIngestWorker(ctx),
  ];

  ctx.logger.info({ workerCount: workers.length, llmProvider: ctx.llmProvider.id }, "worker process started");

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    ctx.logger.info({ signal }, "worker shutting down");
    await Promise.all(workers.map((w) => w.close()));
    await closeAllQueues();
    await closeRedisConnection();
    await closeDb();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("worker failed to start", err);
  process.exit(1);
});
