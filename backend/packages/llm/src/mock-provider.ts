import type { LlmReasoningRequest } from "./schemas.js";
import type { LlmCallResult, LlmProvider } from "./provider.js";

/**
 * Deterministic mock provider — no network calls. Used in tests and for
 * local/offline development so the reasoning pipeline can be exercised
 * end-to-end without a live ANTHROPIC_API_KEY. Produces schema-valid
 * output derived from the deterministic findings already present in the
 * request, so behavior is reproducible and inspectable.
 */
export class MockLlmProvider implements LlmProvider {
  readonly id = "mock";

  async runStructuredReasoning(request: LlmReasoningRequest): Promise<LlmCallResult> {
    const startedAt = Date.now();

    const hasSensitive = request.riskProfileHint.touchedSensitiveAreas;
    const hasBreaking = request.riskProfileHint.hasBreakingApiChange;
    const missingTests = request.riskProfileHint.missingTestCoverage;

    const severity = hasBreaking ? "high" : hasSensitive ? "medium" : missingTests ? "medium" : "low";

    const output = {
      overallAssessment: `Automated mock assessment based on ${request.deterministicFindings.length} deterministic finding(s) and ${request.doctrineRules.length} doctrine rule(s) in scope.`,
      overallConfidence: 0.6,
      riskSeverity: severity as "info" | "low" | "medium" | "high" | "critical",
      findings: request.deterministicFindings.slice(0, 3).map((f) => ({
        title: `Judgment follow-up: ${f.title}`,
        description: `Mock reasoner synthesized additional context for deterministic finding "${f.ruleKey}".`,
        severity: (f.severity as "info" | "low" | "medium" | "high" | "critical") ?? "low",
        confidence: 0.5,
        evidence: [{ kind: "graph-node" as const, ref: request.reviewSessionId }],
      })),
      recommendedActions: missingTests ? ["Add test coverage before merging"] : ["Proceed with standard review"],
      exceptionLikelihood: 0.1,
      reviewSummary: `Mock review: risk=${severity}, ${request.deterministicFindings.length} deterministic finding(s) considered.`,
    };

    return {
      output,
      rawText: JSON.stringify(output),
      metadata: {
        provider: this.id,
        model: "mock-v1",
        inputTokens: JSON.stringify(request).length / 4, // rough token estimate
        outputTokens: JSON.stringify(output).length / 4,
        latencyMs: Date.now() - startedAt,
      },
    };
  }
}
