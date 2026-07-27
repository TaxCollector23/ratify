import { z } from "zod";

/** Severity scale used consistently across policy engine + LLM findings. */
export const SeverityEnum = z.enum(["info", "low", "medium", "high", "critical"]);
export type Severity = z.infer<typeof SeverityEnum>;

/** Confidence is a calibrated probability in [0, 1], not a vibe. */
export const ConfidenceSchema = z.number().min(0).max(1);

export const FindingSourceEnum = z.enum(["policy-engine", "llm-reasoner", "history-miner", "doctrine-miner"]);
export type FindingSource = z.infer<typeof FindingSourceEnum>;

export const EvidencePointerSchema = z.object({
  kind: z.enum(["file-line", "pull-request", "commit", "review-comment", "doc", "adr", "graph-node"]),
  ref: z.string().describe("Stable reference, e.g. path#L10-L20, PR number, SHA, doc id"),
  excerpt: z.string().max(2000).optional(),
  url: z.string().url().optional(),
});
export type EvidencePointer = z.infer<typeof EvidencePointerSchema>;

export const RiskProfileSchema = z.object({
  overallScore: z.number().min(0).max(100),
  severityCounts: z.record(SeverityEnum, z.number().int().nonnegative()),
  touchedSensitiveAreas: z.boolean(),
  hasBreakingApiChange: z.boolean(),
  missingTestCoverage: z.boolean(),
});
export type RiskProfile = z.infer<typeof RiskProfileSchema>;

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

export const PaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
