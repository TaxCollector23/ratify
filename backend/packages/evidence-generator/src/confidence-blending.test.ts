import { describe, expect, it } from "vitest";
import { blendClusterConfidence, clusterFindings, estimateFalsePositiveLikelihood } from "./confidence-blending.js";
import type { RawFindingInput } from "./types.js";

function finding(overrides: Partial<RawFindingInput>): RawFindingInput {
  return {
    source: "policy-engine",
    ruleKey: "missing-tests-for-payments-paths",
    title: "Missing tests",
    description: "desc",
    severity: "high",
    confidence: 0.75,
    evidence: [],
    ...overrides,
  };
}

describe("clusterFindings", () => {
  it("groups findings by ruleKey + filePath", () => {
    const findings = [
      finding({ filePath: "src/payments/a.ts" }),
      finding({ source: "llm-reasoner", filePath: "src/payments/a.ts", confidence: 0.5 }),
      finding({ ruleKey: "other-rule", filePath: "src/payments/a.ts" }),
    ];
    const clusters = clusterFindings(findings);
    expect(clusters).toHaveLength(2);
    expect(clusters.find((c) => c.ruleKey === "missing-tests-for-payments-paths")?.members).toHaveLength(2);
  });
});

describe("blendClusterConfidence", () => {
  it("blends single-source confidence with a small discount, never a raw pass-through", () => {
    const cluster = { ruleKey: "r", filePath: "f.ts", members: [finding({ confidence: 0.8 })] };
    const blended = blendClusterConfidence(cluster);
    // Weighted avg (policy-engine weight 0.85) minus single-source discount: should differ from raw 0.8.
    expect(blended).not.toBe(0.8);
    expect(blended).toBeGreaterThan(0);
    expect(blended).toBeLessThanOrEqual(1);
  });

  it("boosts confidence when policy-engine and llm-reasoner corroborate the same cluster", () => {
    const singleSource = { ruleKey: "r", filePath: "f.ts", members: [finding({ confidence: 0.6 })] };
    const corroborated = {
      ruleKey: "r",
      filePath: "f.ts",
      members: [finding({ confidence: 0.6 }), finding({ source: "llm-reasoner", confidence: 0.6 })],
    };

    const singleConfidence = blendClusterConfidence(singleSource);
    const corroboratedConfidence = blendClusterConfidence(corroborated);

    expect(corroboratedConfidence).toBeGreaterThan(singleConfidence);
  });

  it("weights deterministic policy-engine findings more heavily than LLM-only findings", () => {
    const policyOnly = { ruleKey: "r", filePath: "f.ts", members: [finding({ source: "policy-engine", confidence: 0.7 })] };
    const llmOnly = { ruleKey: "r", filePath: "f.ts", members: [finding({ source: "llm-reasoner", confidence: 0.7 })] };

    expect(blendClusterConfidence(policyOnly)).toBeGreaterThan(blendClusterConfidence(llmOnly));
  });

  it("clamps to [0, 1]", () => {
    const maxCluster = {
      ruleKey: "r",
      filePath: "f.ts",
      members: [finding({ confidence: 1 }), finding({ source: "llm-reasoner", confidence: 1 })],
    };
    expect(blendClusterConfidence(maxCluster)).toBeLessThanOrEqual(1);
  });
});

describe("estimateFalsePositiveLikelihood", () => {
  it("is higher for LLM-only findings than corroborated ones at the same confidence", () => {
    const llmOnly = { ruleKey: "r", filePath: "f.ts", members: [finding({ source: "llm-reasoner", confidence: 0.6 })] };
    const corroborated = {
      ruleKey: "r",
      filePath: "f.ts",
      members: [finding({ confidence: 0.6 }), finding({ source: "llm-reasoner", confidence: 0.6 })],
    };

    const llmOnlyFp = estimateFalsePositiveLikelihood(llmOnly, blendClusterConfidence(llmOnly));
    const corroboratedFp = estimateFalsePositiveLikelihood(corroborated, blendClusterConfidence(corroborated));

    expect(llmOnlyFp).toBeGreaterThan(corroboratedFp);
  });

  it("never lets an explicit model estimate be fully overridden by the heuristic floor", () => {
    const cluster = {
      ruleKey: "r",
      filePath: "f.ts",
      members: [finding({ source: "llm-reasoner", confidence: 0.9, falsePositiveLikelihood: 0.4 })],
    };
    const fp = estimateFalsePositiveLikelihood(cluster, blendClusterConfidence(cluster));
    expect(fp).toBeGreaterThanOrEqual(0.4);
  });

  it("stays within [0, 1]", () => {
    const cluster = { ruleKey: "r", filePath: "f.ts", members: [finding({ confidence: 0 })] };
    const fp = estimateFalsePositiveLikelihood(cluster, 0);
    expect(fp).toBeGreaterThanOrEqual(0);
    expect(fp).toBeLessThanOrEqual(1);
  });
});
