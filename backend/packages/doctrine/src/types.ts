import { z } from "zod";

export const DoctrineRuleKindEnum = z.enum(["hard-rule", "soft-norm", "likely-preference"]);
export type DoctrineRuleKind = z.infer<typeof DoctrineRuleKindEnum>;

export const DoctrineSourceKindEnum = z.enum([
  "merged-pr",
  "review-comment",
  "commit-message",
  "doc",
  "adr",
  "readme",
  "codeowners",
  "ci-config",
  "feedback-event",
]);
export type DoctrineSourceKind = z.infer<typeof DoctrineSourceKindEnum>;

export interface DoctrineSignal {
  kind: DoctrineSourceKind;
  ref: string;
  excerpt?: string;
  /** Raw, unweighted strength of this individual signal (0..1). */
  strength: number;
  scopeGlobs?: string[];
}

export interface DoctrineCandidate {
  key: string;
  title: string;
  statement: string;
  kind: DoctrineRuleKind;
  scopeGlobs: string[];
  signals: DoctrineSignal[];
}

export interface ScoredDoctrineCandidate extends DoctrineCandidate {
  confidence: number;
  rationale: string;
}
