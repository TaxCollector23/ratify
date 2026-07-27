import { minimatch } from "minimatch";
import type { PolicyCheckContext, PolicyFinding } from "../types.js";

/**
 * Flags changes to configurable "sensitive" path globs (auth, security,
 * infra, migrations, CI workflows, secrets-adjacent files). Purely
 * structural — the glob list is configurable per repo via PolicyEngineConfig.
 */
export function sensitiveAreaModification(ctx: PolicyCheckContext): PolicyFinding[] {
  const { fileChanges, config } = ctx;

  const touched = fileChanges.filter((fc) =>
    config.sensitivePathGlobs.some((glob) => minimatch(fc.filePath, glob, { nocase: true })),
  );

  if (touched.length === 0) return [];

  return [
    {
      ruleKey: "sensitive-area-modification",
      title: `${touched.length} sensitive-area file(s) modified`,
      description: `This pull request modifies files under configured sensitive-area path patterns: ${touched
        .map((t) => t.filePath)
        .join(", ")}. These areas typically require elevated review scrutiny.`,
      severity: "high",
      confidence: 1.0,
      evidence: touched.map((t) => ({
        kind: "file-line" as const,
        ref: t.filePath,
        excerpt: `${t.status} (+${t.additions}/-${t.deletions})`,
      })),
      remediation: "Ensure a code owner for this area has explicitly reviewed and approved the change.",
    },
  ];
}
