import { describe, expect, it } from "vitest";
import { MockLlmProvider } from "./mock-provider.js";
import { LlmReasoningOutputSchema, type LlmReasoningRequest } from "./schemas.js";

describe("MockLlmProvider", () => {
  it("produces output that validates against LlmReasoningOutputSchema", async () => {
    const provider = new MockLlmProvider();
    const request: LlmReasoningRequest = {
      orgId: "org-1",
      repositoryId: "repo-1",
      reviewSessionId: "session-1",
      diffSummary: "changed 2 files",
      graphSliceSummary: "3 nodes, 2 edges",
      retrievedDocs: [],
      precedents: [],
      doctrineRules: [{ key: "require-tests", statement: "Require tests", kind: "hard-rule", confidence: 0.9 }],
      deterministicFindings: [{ ruleKey: "missing-tests-for-payments-paths", title: "Missing tests", severity: "high" }],
      ownershipContext: [],
      riskProfileHint: { touchedSensitiveAreas: false, hasBreakingApiChange: false, missingTestCoverage: true },
    };

    const result = await provider.runStructuredReasoning(request);
    const parsed = LlmReasoningOutputSchema.safeParse(result.output);
    expect(parsed.success).toBe(true);
    expect(result.metadata.provider).toBe("mock");
  });
});
