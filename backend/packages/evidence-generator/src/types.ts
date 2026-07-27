import type { Severity } from "@ratify/shared";
import type { PolicyFinding } from "@ratify/policy-engine";
import type { LlmFinding } from "@ratify/llm";

/** A finding from either the deterministic policy engine or the LLM reasoner, normalized to a common shape. */
export interface RawFindingInput {
  source: "policy-engine" | "llm-reasoner";
  ruleKey: string;
  title: string;
  description: string;
  severity: Severity;
  /** Source-reported confidence: deterministic-rule certainty for policy-engine, model confidence for llm-reasoner. */
  confidence: number;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  remediation?: string;
  falsePositiveLikelihood?: number;
  evidence: { kind: string; ref: string; excerpt?: string; url?: string }[];
}

/** A HistoricalPrecedent row, minimally shaped for linkage matching. */
export interface PrecedentForLinking {
  id: string;
  title: string;
  relatedPathGlobs: string[];
  outcome: string | null;
}

export interface GeneratedEvidenceItem {
  kind: "file-line" | "pull-request" | "commit" | "review-comment" | "doc" | "adr" | "graph-node" | "precedent";
  ref: string;
  excerpt?: string;
  url?: string;
  /** Contribution weight toward the finding's confidence calibration. */
  weight: number;
}

export interface GeneratedFinding {
  ruleKey: string;
  source: "policy-engine" | "llm-reasoner";
  title: string;
  description: string;
  severity: Severity;
  /** Calibrated, blended confidence — never a raw pass-through of a single source's confidence. */
  confidence: number;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  remediation: string;
  falsePositiveLikelihood: number;
  evidenceItems: GeneratedEvidenceItem[];
  rationale: string;
  /** Ids of precedents (if any) that corroborate or contextualize this finding. */
  linkedPrecedentIds: string[];
}

/** Groups findings that appear to describe the same underlying issue, for cross-source confidence blending. */
export interface FindingCluster {
  ruleKey: string;
  filePath?: string;
  members: RawFindingInput[];
}

export function normalizePolicyFinding(f: PolicyFinding): RawFindingInput {
  return {
    source: "policy-engine",
    ruleKey: f.ruleKey,
    title: f.title,
    description: f.description,
    severity: f.severity,
    confidence: f.confidence,
    filePath: f.filePath,
    lineStart: f.lineStart,
    lineEnd: f.lineEnd,
    remediation: f.remediation,
    evidence: f.evidence,
  };
}

export function normalizeLlmFinding(f: LlmFinding): RawFindingInput {
  return {
    source: "llm-reasoner",
    ruleKey: slugifyTitle(f.title),
    title: f.title,
    description: f.description,
    severity: f.severity,
    confidence: f.confidence,
    filePath: f.filePath,
    lineStart: f.lineStart,
    lineEnd: f.lineEnd,
    remediation: f.remediation,
    falsePositiveLikelihood: f.falsePositiveLikelihood,
    evidence: f.evidence,
  };
}

function slugifyTitle(title: string): string {
  return `llm-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48)}`;
}
