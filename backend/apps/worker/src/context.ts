import { createDb, type Database } from "@ratify/db";
import { getObjectStore, type ObjectStore } from "@ratify/storage";
import { createLogger, LoggingMetricsSink, MetricsEmitter, type Logger } from "@ratify/observability";
import { MockLlmProvider, AnthropicLlmProvider, type LlmProvider } from "@ratify/llm";
import { DbMetricsSink } from "./metrics-sink.js";

/**
 * Shared dependency bag constructed once at process start and threaded
 * through every worker handler. Mirrors the `deps` pattern used by
 * apps/api-server and apps/webhook-handler so all three services follow
 * the same composition-root convention.
 */
export interface WorkerContext {
  db: Database;
  objectStore: ObjectStore;
  logger: Logger;
  metrics: MetricsEmitter;
  llmProvider: LlmProvider;
  workDir: string;
}

/**
 * LLM provider selection: defaults to the deterministic MockLlmProvider
 * unless RATIFY_LLM_PROVIDER=anthropic *and* ANTHROPIC_API_KEY is set, so
 * the full repo-indexing + PR-analysis pipeline runs end-to-end offline
 * (see backend/ASSUMPTIONS.md).
 */
function buildLlmProvider(): LlmProvider {
  if (process.env.RATIFY_LLM_PROVIDER === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return new AnthropicLlmProvider({
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL,
    });
  }
  return new MockLlmProvider();
}

export function buildWorkerContext(): WorkerContext {
  const db = createDb();
  const logger = createLogger({ service: "worker" });
  return {
    db,
    objectStore: getObjectStore(),
    logger,
    metrics: new MetricsEmitter([new LoggingMetricsSink(logger), new DbMetricsSink(db)]),
    llmProvider: buildLlmProvider(),
    workDir: process.env.REPO_SYNC_WORKDIR ?? "/tmp/ratify-repos",
  };
}
