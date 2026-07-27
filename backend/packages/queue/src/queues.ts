import { Queue, type JobsOptions } from "bullmq";
import { getRedisConnection } from "./redis.js";
import type { JobType } from "./job-schemas.js";

/**
 * Queue naming: one BullMQ queue per logical stage. Kept 1:1 with jobType
 * for simplicity and clear per-stage concurrency tuning / dashboards.
 */
export const QUEUE_NAMES: Record<JobType, string> = {
  "repo.sync": "repo-sync",
  "repo.parse": "repo-parse",
  "repo.graph_build": "repo-graph-build",
  "repo.history_mine": "repo-history-mine",
  "repo.doctrine_infer": "repo-doctrine-infer",
  "pr.policy_check": "pr-policy-check",
  "pr.context_retrieve": "pr-context-retrieve",
  "pr.llm_reason": "pr-llm-reason",
  "pr.evidence_generate": "pr-evidence-generate",
  "pr.publish": "pr-publish",
  "feedback.ingest": "feedback-ingest",
};

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 2_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

const queueCache = new Map<string, Queue>();

/** Returns (creating if needed) the BullMQ Queue for a given job type. */
export function getQueue(jobType: JobType): Queue {
  const name = QUEUE_NAMES[jobType];
  let queue = queueCache.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: getRedisConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    queueCache.set(name, queue);
  }
  return queue;
}

export function allQueues(): Queue[] {
  return (Object.keys(QUEUE_NAMES) as JobType[]).map(getQueue);
}

export async function closeAllQueues(): Promise<void> {
  await Promise.all([...queueCache.values()].map((q) => q.close()));
  queueCache.clear();
}
