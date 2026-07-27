import { minimatch } from "minimatch";
import type { PolicyCheckContext, PolicyFinding, PolicyFileChange } from "../types.js";

/**
 * Flags PRs that touch payments/billing/checkout source files without any
 * corresponding test file changes in the same PR. Deterministic, glob-based
 * — no LLM required.
 */
export function missingTestsForPaymentsPaths(ctx: PolicyCheckContext): PolicyFinding[] {
  const { fileChanges, config } = ctx;

  const isTestFile = (path: string) => /\.(test|spec)\.[jt]sx?$/.test(path) || path.includes("__tests__/");

  const touchedPaymentsSources = fileChanges.filter(
    (fc: PolicyFileChange) =>
      !isTestFile(fc.filePath) &&
      !fc.isBinary &&
      fc.status !== "removed" &&
      config.paymentsPathGlobs.some((glob) => minimatch(fc.filePath, glob, { nocase: true })),
  );

  if (touchedPaymentsSources.length === 0) return [];

  const touchedTestFiles = fileChanges.filter((fc) => isTestFile(fc.filePath));

  const findings: PolicyFinding[] = [];
  for (const source of touchedPaymentsSources) {
    const hasMatchingTest = touchedTestFiles.some((t) => sameLogicalArea(source.filePath, t.filePath));
    if (!hasMatchingTest) {
      findings.push({
        ruleKey: "missing-tests-for-payments-paths",
        title: `Payments-related change without test coverage: ${source.filePath}`,
        description: `The file ${source.filePath} matches a payments/billing/checkout path pattern and was modified without any corresponding test file change in this pull request.`,
        severity: "high",
        confidence: 0.75,
        filePath: source.filePath,
        evidence: [
          {
            kind: "file-line",
            ref: source.filePath,
            excerpt: `${source.status} (+${source.additions}/-${source.deletions})`,
          },
        ],
        remediation: `Add or update tests covering the changes in ${source.filePath} before merging.`,
      });
    }
  }
  return findings;
}

function sameLogicalArea(sourcePath: string, testPath: string): boolean {
  const baseName = sourcePath
    .split("/")
    .pop()!
    .replace(/\.(ts|tsx|js|jsx)$/, "");
  return testPath.includes(baseName);
}
