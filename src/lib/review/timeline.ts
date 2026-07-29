import { db } from "@/lib/db/client";
import { reviewEvents } from "@/lib/db/schema";

/**
 * Records a pipeline stage against a review session. Never throws — a
 * failed audit-log write must not take down the review pipeline itself.
 * Duration is optional; pass ms elapsed since the start of that stage.
 */
export async function recordStage(
  reviewSessionId: string,
  stage:
    | "webhook_received"
    | "policy_checks"
    | "context_retrieved"
    | "llm_call"
    | "evidence_generated"
    | "published"
    | "error"
    | "skipped_duplicate",
  detail?: Record<string, unknown>,
  durationMs?: number,
): Promise<void> {
  try {
    await db.insert(reviewEvents).values({
      reviewSessionId,
      stage,
      detail: detail ?? null,
      durationMs: durationMs ?? null,
    });
  } catch (err) {
    // Audit log must not break the pipeline. Log to console and move on.
    console.error(`[timeline] failed to record ${stage} for session ${reviewSessionId}:`, err);
  }
}

/** Wraps a promise-returning function so its duration is captured and a stage event is emitted. */
export async function timeStage<T>(
  reviewSessionId: string,
  stage: Parameters<typeof recordStage>[1],
  fn: () => Promise<T>,
  buildDetail?: (result: T) => Record<string, unknown>,
): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await fn();
    await recordStage(reviewSessionId, stage, buildDetail?.(result), Date.now() - t0);
    return result;
  } catch (err) {
    await recordStage(reviewSessionId, "error", { failedStage: stage, error: String(err) }, Date.now() - t0);
    throw err;
  }
}
