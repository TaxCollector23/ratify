import type { DoctrineCandidate, DoctrineSignal, ScoredDoctrineCandidate } from "./types.js";

/**
 * Source-kind base weights: signals mined from merged PRs and repeated
 * review comments are stronger evidence of an *enforced* convention than
 * a single README mention. These weights are the deterministic backbone
 * of doctrine confidence — never LLM-guessed.
 */
const SOURCE_KIND_WEIGHT: Record<string, number> = {
  "merged-pr": 0.9,
  "review-comment": 0.8,
  "ci-config": 0.85,
  codeowners: 0.7,
  adr: 0.75,
  doc: 0.5,
  readme: 0.45,
  "commit-message": 0.4,
  "feedback-event": 1.0, // explicit human confirmation is the strongest possible signal
};

export interface ConfidenceScoringOptions {
  /** Minimum number of independent signals required before confidence exceeds 0.5. */
  minSignalsForHighConfidence?: number;
}

/**
 * Computes a calibrated [0,1] confidence score for a doctrine candidate
 * from its underlying signals. Formula:
 *   1. weighted average of signal strength * source-kind weight
 *   2. multiplied by a "corroboration" boost that grows with distinct
 *      signal count (log-scaled, capped) so a single strong signal never
 *      reaches the same confidence as many independent occurrences
 *   3. clamped to [0, 1]
 */
export function scoreDoctrineCandidate(
  candidate: DoctrineCandidate,
  options: ConfidenceScoringOptions = {},
): ScoredDoctrineCandidate {
  const minSignals = options.minSignalsForHighConfidence ?? 4;

  if (candidate.signals.length === 0) {
    return { ...candidate, confidence: 0.1, rationale: "No supporting signals found; treated as a weak candidate." };
  }

  const weightedStrengths = candidate.signals.map((s) => s.strength * (SOURCE_KIND_WEIGHT[s.kind] ?? 0.5));
  const avgWeightedStrength = weightedStrengths.reduce((a, b) => a + b, 0) / weightedStrengths.length;

  const corroborationBoost = Math.min(1, Math.log2(1 + candidate.signals.length) / Math.log2(1 + minSignals));

  const rawConfidence = avgWeightedStrength * (0.5 + 0.5 * corroborationBoost);
  const confidence = clamp(rawConfidence, 0, 1);

  const kindCounts = countByKind(candidate.signals);
  const rationale = `Derived from ${candidate.signals.length} signal(s): ${Object.entries(kindCounts)
    .map(([k, c]) => `${c}x ${k}`)
    .join(", ")}. Avg weighted strength ${avgWeightedStrength.toFixed(2)}, corroboration boost ${corroborationBoost.toFixed(2)}.`;

  return { ...candidate, confidence, rationale };
}

function countByKind(signals: DoctrineSignal[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of signals) counts[s.kind] = (counts[s.kind] ?? 0) + 1;
  return counts;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Classifies a scored candidate into hard-rule / soft-norm / likely-preference
 * based on confidence thresholds, unless the candidate already declares a
 * kind from explicit signals (e.g. a CI config check is inherently a hard rule).
 */
export function classifyDoctrineKind(candidate: ScoredDoctrineCandidate): ScoredDoctrineCandidate["kind"] {
  if (candidate.signals.some((s) => s.kind === "ci-config")) return "hard-rule";
  if (candidate.confidence >= 0.75) return "hard-rule";
  if (candidate.confidence >= 0.45) return "soft-norm";
  return "likely-preference";
}

/**
 * Recomputes confidence after a new FeedbackEvent arrives (agree/disagree/
 * false_positive/exception). Positive feedback nudges confidence up,
 * negative feedback pulls it down, with diminishing effect as confidence
 * approaches the bounds (so single outliers can't swing a well-established
 * rule wildly).
 */
export function applyFeedbackAdjustment(currentConfidence: number, feedbackKind: string): number {
  const delta = feedbackDeltaFor(feedbackKind);
  const distanceToTarget = delta > 0 ? 1 - currentConfidence : currentConfidence;
  const adjustment = delta * distanceToTarget * 0.5;
  return clamp(currentConfidence + adjustment, 0, 1);
}

function feedbackDeltaFor(kind: string): number {
  switch (kind) {
    case "agree":
      return 0.15;
    case "disagree":
      return -0.15;
    case "false_positive":
      return -0.35;
    case "exception":
    case "temporary_exception":
      return -0.1;
    case "needs_human_review":
      return -0.05;
    default:
      return 0;
  }
}
