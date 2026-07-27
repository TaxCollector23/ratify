import type { Severity } from "@ratify/shared";
import type { GeneratedFinding } from "./types.js";

const SEVERITY_POINTS: Record<Severity, number> = { info: 2, low: 8, medium: 20, high: 40, critical: 70 };

export interface ReviewSessionScore {
  overallScore: number; // 0..100, higher = riskier
  severityCounts: Record<Severity, number>;
  touchedSensitiveAreas: boolean;
  hasBreakingApiChange: boolean;
  missingTestCoverage: boolean;
}

/**
 * Rolls up generated findings into a single 0..100 risk score for
 * ScoreSnapshot. Confidence-weights each finding's severity contribution
 * (a high-severity, low-confidence finding contributes less than a
 * high-severity, high-confidence one) and caps the total so a large
 * number of low-severity findings can't outweigh a single critical one.
 */
export function scoreReviewSession(findings: GeneratedFinding[]): ReviewSessionScore {
  const severityCounts: Record<Severity, number> = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
  let weightedPoints = 0;

  for (const finding of findings) {
    severityCounts[finding.severity] += 1;
    weightedPoints += SEVERITY_POINTS[finding.severity] * finding.confidence;
  }

  const overallScore = Math.min(100, Math.round(weightedPoints));

  return {
    overallScore,
    severityCounts,
    touchedSensitiveAreas: findings.some((f) => f.ruleKey.includes("sensitive-area")),
    hasBreakingApiChange: findings.some((f) => f.ruleKey.includes("breaking-api")),
    missingTestCoverage: findings.some((f) => f.ruleKey.includes("missing-tests")),
  };
}
