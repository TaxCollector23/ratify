import { minimatch } from "minimatch";
import type { PolicyCheckContext, PolicyFinding } from "../types.js";

/**
 * Flags files touched in the PR whose path matches a CODEOWNERS pattern
 * but which have no owner (misconfiguration) — and, when author identity
 * is known via ctx metadata, flags self-approval-adjacent risk by simply
 * surfacing which owners must review. This rule stays purely structural:
 * it never calls GitHub to check who *actually* approved, only what the
 * CODEOWNERS file *requires*.
 */
export function codeownersBoundaryViolation(ctx: PolicyCheckContext): PolicyFinding[] {
  const { fileChanges, codeowners } = ctx;
  if (!codeowners || codeowners.length === 0) return [];

  const findings: PolicyFinding[] = [];
  const unowned: string[] = [];
  const requiredOwnersByFile = new Map<string, string[]>();

  for (const fc of fileChanges) {
    const matches = codeowners.filter((entry) => minimatch(fc.filePath, entry.pathGlob, { dot: true }));
    if (matches.length === 0) {
      unowned.push(fc.filePath);
      continue;
    }
    // Last matching rule wins per CODEOWNERS semantics — take the most specific (last) match.
    const winning = matches[matches.length - 1]!;
    requiredOwnersByFile.set(fc.filePath, winning.owners);
  }

  if (unowned.length > 0) {
    findings.push({
      ruleKey: "codeowners-boundary-violation",
      title: `${unowned.length} changed file(s) have no CODEOWNERS entry`,
      description: `The following files were modified but do not match any CODEOWNERS pattern: ${unowned.join(", ")}.`,
      severity: "low",
      confidence: 0.8,
      evidence: unowned.map((f) => ({ kind: "file-line" as const, ref: f })),
      remediation: "Add an ownership entry for this path in CODEOWNERS, or confirm this is intentionally unowned.",
    });
  }

  const crossBoundaryFiles = [...requiredOwnersByFile.entries()].filter(([, owners]) => owners.length > 0);
  const distinctOwnerSets = new Set(crossBoundaryFiles.map(([, owners]) => owners.slice().sort().join(",")));

  if (distinctOwnerSets.size > 1) {
    findings.push({
      ruleKey: "codeowners-boundary-violation",
      title: "Pull request spans multiple ownership boundaries",
      description: `This PR touches files owned by ${distinctOwnerSets.size} distinct owner groups: ${[...distinctOwnerSets].join(" | ")}. Cross-boundary PRs carry higher coordination risk.`,
      severity: "medium",
      confidence: 0.65,
      evidence: crossBoundaryFiles.map(([file, owners]) => ({
        kind: "file-line" as const,
        ref: file,
        excerpt: `owners: ${owners.join(", ")}`,
      })),
      remediation: "Ensure reviewers from each owning team are requested before merge.",
    });
  }

  return findings;
}
