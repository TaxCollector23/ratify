export interface PrFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface PolicyFinding {
  ruleKey: string;
  title: string;
  description: string;
  filePath?: string;
  severity: "low" | "medium" | "high";
  confidence: number;
  source: "policy-engine";
  evidence: Record<string, unknown>;
}

const SENSITIVE_PATH_PATTERN = /payment|billing|charge|checkout|invoice/i;
const TEST_PATH_PATTERN = /\.(test|spec)\.[jt]sx?$|__tests__\//;
const DEBUG_PATTERN = /^\+.*\b(TODO|FIXME|console\.log|debugger)\b/m;

/** Missing tests for changes touching payment-sensitive paths. */
function checkMissingTests(files: PrFile[]): PolicyFinding | null {
  const sensitiveFiles = files.filter((f) => SENSITIVE_PATH_PATTERN.test(f.filename) && !TEST_PATH_PATTERN.test(f.filename));
  if (sensitiveFiles.length === 0) return null;

  const hasTestChange = files.some((f) => TEST_PATH_PATTERN.test(f.filename));
  if (hasTestChange) return null;

  return {
    ruleKey: "missing-tests-for-payments-paths",
    title: "Missing tests for payment-sensitive change",
    description: `${sensitiveFiles.length} file(s) touching payment/billing logic changed with no corresponding test file in this diff.`,
    filePath: sensitiveFiles[0].filename,
    severity: "high",
    confidence: 0.85,
    source: "policy-engine",
    evidence: { files: sensitiveFiles.map((f) => f.filename) },
  };
}

/** Debug/TODO code left in the added lines of the diff. */
function checkDebugCode(files: PrFile[]): PolicyFinding[] {
  const findings: PolicyFinding[] = [];
  for (const file of files) {
    if (!file.patch) continue;
    if (DEBUG_PATTERN.test(file.patch)) {
      findings.push({
        ruleKey: "todo-debug-code",
        title: "Debug code or TODO left in diff",
        description: `${file.filename} contains an added line with TODO, FIXME, console.log, or debugger.`,
        filePath: file.filename,
        severity: "low",
        confidence: 0.9,
        source: "policy-engine",
        evidence: { file: file.filename },
      });
    }
  }
  return findings;
}

/** Dependency manifest changes, which should require explicit approval. */
function checkDependencyChange(files: PrFile[]): PolicyFinding | null {
  const manifests = files.filter((f) => /^package\.json$|^pnpm-lock\.yaml$|requirements\.txt$|go\.mod$/.test(f.filename));
  if (manifests.length === 0) return null;

  return {
    ruleKey: "dependency-change-detection",
    title: "Dependency manifest changed",
    description: "This PR modifies a dependency manifest. Confirm the new dependency is approved.",
    filePath: manifests[0].filename,
    severity: "medium",
    confidence: 0.75,
    source: "policy-engine",
    evidence: { files: manifests.map((f) => f.filename) },
  };
}

export function runPolicyChecks(files: PrFile[]): PolicyFinding[] {
  const findings: PolicyFinding[] = [];
  const missingTests = checkMissingTests(files);
  if (missingTests) findings.push(missingTests);
  findings.push(...checkDebugCode(files));
  const depChange = checkDependencyChange(files);
  if (depChange) findings.push(depChange);
  return findings;
}
