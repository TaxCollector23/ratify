import type { FindingCluster, RawFindingInput } from "./types.js";

/**
 * Confidence blending: never pass a single source's confidence straight
 * through. The deterministic policy-engine is treated as higher-precision
 * (glob/AST-based, no hallucination risk) while the LLM reasoner is
 * treated as higher-recall but noisier judgment. When both sources agree
 * on the same underlying issue, that corroboration should raise
 * confidence beyond what either alone would justify; when only one source
 * flags it, its own weighted confidence is used, discounted slightly for
 * lack of corroboration.
 */

const SOURCE_TRUST_WEIGHT: Record<RawFindingInput["source"], number> = {
  "policy-engine": 0.85, // deterministic rules: high precision, so weight them more heavily
  "llm-reasoner": 0.65, // judgment-based: useful signal, but calibrated down for hallucination risk
};

/** Groups raw findings into clusters describing the same underlying issue (same ruleKey + filePath, or LLM findings referencing the same policy ruleKey via title heuristics). */
export function clusterFindings(findings: RawFindingInput[]): FindingCluster[] {
  const byKey = new Map<string, FindingCluster>();

  for (const finding of findings) {
    const clusterKey = `${finding.ruleKey}::${finding.filePath ?? ""}`;
    const existing = byKey.get(clusterKey);
    if (existing) {
      existing.members.push(finding);
    } else {
      byKey.set(clusterKey, { ruleKey: finding.ruleKey, filePath: finding.filePath, members: [finding] });
    }
  }

  return [...byKey.values()];
}

/**
 * Blends confidence across a cluster's members. Formula:
 *   1. Weighted average confidence, weighted by each source's trust weight.
 *   2. A corroboration boost when >1 independent source agrees on the
 *      same cluster (log-scaled like doctrine's corroboration boost, for
 *      consistency across the codebase), capped so a single very-confident
 *      source can't masquerade as multi-source agreement.
 *   3. Clamped to [0, 1].
 */
export function blendClusterConfidence(cluster: FindingCluster): number {
  const { members } = cluster;
  if (members.length === 0) return 0;

  const distinctSources = new Set(members.map((m) => m.source));
  const weightedSum = members.reduce((sum, m) => sum + m.confidence * SOURCE_TRUST_WEIGHT[m.source], 0);
  const weightSum = members.reduce((sum, m) => sum + SOURCE_TRUST_WEIGHT[m.source], 0);
  const weightedAverage = weightSum > 0 ? weightedSum / weightSum : 0;
  // Average trust weight of contributing sources, applied on top of the
  // weighted average so a single low-trust source (e.g. llm-reasoner alone)
  // scores lower than a single high-trust source at the same raw confidence.
  const averageTrust = members.length > 0 ? weightSum / members.length : 0;

  const corroborationBoost = distinctSources.size > 1 ? 0.15 : 0;
  const singleSourceDiscount = distinctSources.size === 1 ? 0.05 : 0;

  const blended = weightedAverage * averageTrust + corroborationBoost - singleSourceDiscount;
  return clamp(blended, 0, 1);
}

/**
 * False-positive likelihood heuristic: inversely related to blended
 * confidence and corroboration, but bumped up for findings that are
 * LLM-only (no deterministic backing) since those carry more hallucination
 * risk, and bumped down for findings with an explicit LLM-estimated
 * falsePositiveLikelihood (trust that estimate as a floor, not a ceiling).
 */
export function estimateFalsePositiveLikelihood(cluster: FindingCluster, blendedConfidence: number): number {
  const distinctSources = new Set(cluster.members.map((m) => m.source));
  const llmOnly = distinctSources.size === 1 && distinctSources.has("llm-reasoner");

  const explicitEstimate = cluster.members
    .map((m) => m.falsePositiveLikelihood)
    .filter((v): v is number => v !== undefined);

  const baseline = 1 - blendedConfidence;
  const llmOnlyPenalty = llmOnly ? 0.1 : 0;

  const heuristic = clamp(baseline + llmOnlyPenalty, 0, 1);

  if (explicitEstimate.length > 0) {
    // Trust the model's own estimate but never let it undercut the deterministic heuristic floor.
    const modelEstimate = Math.max(...explicitEstimate);
    return clamp(Math.max(modelEstimate, heuristic * 0.5), 0, 1);
  }

  return heuristic;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
