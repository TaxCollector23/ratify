import type { Severity } from "@ratify/shared";
import { blendClusterConfidence, clusterFindings, estimateFalsePositiveLikelihood } from "./confidence-blending.js";
import type { FindingCluster, GeneratedEvidenceItem, GeneratedFinding, PrecedentForLinking, RawFindingInput } from "./types.js";

const SEVERITY_RANK: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

/** Picks the most severe rating across a cluster's members — never silently downgrade risk when sources disagree. */
function maxSeverity(members: RawFindingInput[]): Severity {
  return members.reduce<Severity>((max, m) => (SEVERITY_RANK[m.severity] > SEVERITY_RANK[max] ? m.severity : max), "info");
}

/** Prefers the more detailed description (policy-engine descriptions are terse; LLM descriptions are richer). */
function pickDescription(members: RawFindingInput[]): string {
  return [...members].sort((a, b) => b.description.length - a.description.length)[0]?.description ?? "";
}

function pickTitle(members: RawFindingInput[]): string {
  // Prefer the deterministic policy-engine title when present (stable, rule-driven); else the LLM title.
  const policyMember = members.find((m) => m.source === "policy-engine");
  return policyMember?.title ?? members[0]?.title ?? "Untitled finding";
}

function mergeRemediation(members: RawFindingInput[]): string {
  const remediations = [...new Set(members.map((m) => m.remediation).filter((r): r is string => Boolean(r)))];
  if (remediations.length > 0) return remediations.join(" ");
  return "Review the flagged change and confirm it aligns with repository conventions before merging.";
}

function collectEvidenceItems(members: RawFindingInput[]): GeneratedEvidenceItem[] {
  const items: GeneratedEvidenceItem[] = [];
  for (const member of members) {
    for (const ev of member.evidence) {
      items.push({
        kind: ev.kind as GeneratedEvidenceItem["kind"],
        ref: ev.ref,
        excerpt: ev.excerpt,
        url: ev.url,
        // deterministic-sourced evidence carries more calibration weight than LLM-cited evidence
        weight: member.source === "policy-engine" ? 1.0 : 0.7,
      });
    }
  }
  return items;
}

/** Finds precedents whose relatedPathGlobs match the finding's file path — simple prefix/glob matching, consistent with retrieval package's approach. */
function linkPrecedents(filePath: string | undefined, precedents: PrecedentForLinking[]): PrecedentForLinking[] {
  if (!filePath) return [];
  return precedents.filter((p) => p.relatedPathGlobs.some((glob) => filePath.startsWith(glob.replace(/\*+$/, ""))));
}

function buildRationale(cluster: FindingCluster, confidence: number, linked: PrecedentForLinking[]): string {
  const distinctSources = new Set(cluster.members.map((m) => m.source));
  const sourceDescription =
    distinctSources.size > 1
      ? `corroborated by both the deterministic policy engine and the LLM reasoner`
      : `flagged by ${[...distinctSources][0] === "policy-engine" ? "the deterministic policy engine" : "the LLM reasoner"} only`;

  const precedentNote =
    linked.length > 0
      ? ` ${linked.length} related historical precedent(s) found (e.g. "${linked[0]?.title}").`
      : " No directly related historical precedent found.";

  return `Confidence ${confidence.toFixed(2)}: ${sourceDescription}, based on ${cluster.members.length} raw finding(s).${precedentNote}`;
}

export interface GenerateEvidenceOptions {
  findings: RawFindingInput[];
  precedents?: PrecedentForLinking[];
}

/**
 * Turns raw findings (deterministic + LLM) into scored, deduplicated
 * GeneratedFinding + GeneratedEvidenceItem records ready for persistence
 * as Finding + EvidenceItem rows. This is the single place confidence
 * calibration and precedent linkage happen — callers (apps/worker) should
 * never compute these independently.
 */
export function generateEvidence(options: GenerateEvidenceOptions): GeneratedFinding[] {
  const { findings, precedents = [] } = options;
  const clusters = clusterFindings(findings);

  return clusters.map((cluster) => {
    const confidence = blendClusterConfidence(cluster);
    const falsePositiveLikelihood = estimateFalsePositiveLikelihood(cluster, confidence);
    const filePath = cluster.filePath || cluster.members[0]?.filePath;
    const linked = linkPrecedents(filePath, precedents);

    const primarySource = cluster.members.some((m) => m.source === "policy-engine") ? "policy-engine" : "llm-reasoner";

    const evidenceItems: GeneratedEvidenceItem[] = [
      ...collectEvidenceItems(cluster.members),
      ...linked.map((p) => ({ kind: "precedent" as const, ref: p.id, excerpt: p.title, weight: 0.5 })),
    ];

    const generated: GeneratedFinding = {
      ruleKey: cluster.ruleKey,
      source: primarySource,
      title: pickTitle(cluster.members),
      description: pickDescription(cluster.members),
      severity: maxSeverity(cluster.members),
      confidence,
      filePath,
      lineStart: cluster.members.find((m) => m.lineStart !== undefined)?.lineStart,
      lineEnd: cluster.members.find((m) => m.lineEnd !== undefined)?.lineEnd,
      remediation: mergeRemediation(cluster.members),
      falsePositiveLikelihood,
      evidenceItems,
      rationale: buildRationale(cluster, confidence, linked),
      linkedPrecedentIds: linked.map((p) => p.id),
    };

    return generated;
  });
}
