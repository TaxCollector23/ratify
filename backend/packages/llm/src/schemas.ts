import { z } from "zod";
import { ConfidenceSchema, EvidencePointerSchema, SeverityEnum } from "@ratify/shared";

/**
 * Schema-constrained structured output for the llm-reasoner. The model is
 * never allowed to return free text as the primary output — every call
 * is validated against this Zod schema, and validation failures are
 * recorded (AIReasoningRun.status = schema_validation_failed) rather than
 * silently accepted.
 */
export const LlmFindingSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
  severity: SeverityEnum,
  confidence: ConfidenceSchema,
  filePath: z.string().optional(),
  lineStart: z.number().int().optional(),
  lineEnd: z.number().int().optional(),
  evidence: z.array(EvidencePointerSchema).min(1),
  remediation: z.string().max(1000).optional(),
  falsePositiveLikelihood: ConfidenceSchema.optional(),
});
export type LlmFinding = z.infer<typeof LlmFindingSchema>;

export const LlmReasoningOutputSchema = z.object({
  overallAssessment: z.string().min(1).max(2000),
  overallConfidence: ConfidenceSchema,
  riskSeverity: SeverityEnum,
  findings: z.array(LlmFindingSchema),
  recommendedActions: z.array(z.string()).max(10),
  exceptionLikelihood: ConfidenceSchema.describe(
    "Estimated probability this PR should be granted a doctrine exception rather than blocked",
  ),
  reviewSummary: z.string().min(1).max(1000).describe("Short human-readable summary suitable for GitHub publishing"),
});
export type LlmReasoningOutput = z.infer<typeof LlmReasoningOutputSchema>;

/** The assembled context sent to the model — never raw repo access, always pre-curated. */
export const LlmReasoningRequestSchema = z.object({
  orgId: z.string(),
  repositoryId: z.string(),
  reviewSessionId: z.string(),
  diffSummary: z.string(),
  graphSliceSummary: z.string(),
  retrievedDocs: z.array(z.object({ title: z.string(), excerpt: z.string(), source: z.string() })),
  precedents: z.array(z.object({ title: z.string(), summary: z.string(), outcome: z.string().nullable() })),
  doctrineRules: z.array(z.object({ key: z.string(), statement: z.string(), kind: z.string(), confidence: z.number() })),
  deterministicFindings: z.array(z.object({ ruleKey: z.string(), title: z.string(), severity: z.string() })),
  ownershipContext: z.array(z.object({ pathGlob: z.string(), owners: z.array(z.string()) })),
  riskProfileHint: z.object({
    touchedSensitiveAreas: z.boolean(),
    hasBreakingApiChange: z.boolean(),
    missingTestCoverage: z.boolean(),
  }),
});
export type LlmReasoningRequest = z.infer<typeof LlmReasoningRequestSchema>;
