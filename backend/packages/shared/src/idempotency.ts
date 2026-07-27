import { createHash } from "node:crypto";

/**
 * Deterministic idempotency-key generation for jobs.
 *
 * Every job in the system must be safely re-enqueueable: given the same
 * logical unit of work, we must always derive the same key so BullMQ /
 * our Job table can dedupe retries, replays, and webhook redeliveries.
 */
export function buildIdempotencyKey(parts: {
  jobType: string;
  orgId: string;
  scopeId: string;
  extra?: Record<string, string | number | boolean | undefined>;
}): string {
  const normalizedExtra = parts.extra
    ? Object.keys(parts.extra)
        .sort()
        .filter((k) => parts.extra?.[k] !== undefined)
        .map((k) => `${k}=${String(parts.extra?.[k])}`)
        .join("&")
    : "";

  const raw = [parts.jobType, parts.orgId, parts.scopeId, normalizedExtra].join("|");
  const hash = createHash("sha256").update(raw).digest("hex").slice(0, 32);
  return `${parts.jobType}:${hash}`;
}

/** Content-addressed id for immutable blobs (snapshots, diffs, parsed artifacts). */
export function contentAddress(buffer: Buffer | string): string {
  const hash = createHash("sha256").update(buffer).digest("hex");
  return `sha256:${hash}`;
}
