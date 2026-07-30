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
const TEST_PATH_PATTERN = /\.(test|spec)\.[jt]sx?$|__tests__\/|\/tests?\//;
const DEBUG_PATTERN = /^\+.*\b(TODO|FIXME|console\.log|debugger)\b/m;
const HANDLER_PATH_PATTERN = /\/(api|handlers|routes|controllers)\//;

// Secret-scan patterns. Deliberately conservative — false positives on a
// review comment ping the developer for no reason. Every pattern here is
// something that, if it lands in a real diff, is almost certainly a secret.
const SECRET_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "AWS secret access key", re: /aws_secret_access_key\s*=\s*['"][A-Za-z0-9/+=]{40}['"]/i },
  { label: "GitHub personal access token", re: /\bghp_[A-Za-z0-9]{36,}\b/ },
  { label: "GitHub fine-grained PAT", re: /\bgithub_pat_[A-Za-z0-9_]{80,}\b/ },
  { label: "OpenAI API key", re: /\bsk-[A-Za-z0-9]{20,}[A-Za-z0-9]{20,}\b/ },
  { label: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9\-_]{50,}\b/ },
  { label: "Slack bot token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { label: "OpenRouter API key", re: /\bsk-or-v1-[a-f0-9]{60,}\b/ },
  { label: "Private key PEM", re: /-----BEGIN (RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/ },
  { label: "Google API key", re: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
];

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
  const manifests = files.filter((f) => /^package\.json$|^pnpm-lock\.yaml$|requirements\.txt$|go\.mod$|Cargo\.toml$|Gemfile$/.test(f.filename));
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

/**
 * Hardcoded secrets in ADDED lines. High-precision patterns only — an AWS
 * access key ID or a GitHub PAT in a diff is almost never a false positive.
 * We only scan lines starting with "+" so removed/context lines don't fire.
 */
function checkSecrets(files: PrFile[]): PolicyFinding[] {
  const findings: PolicyFinding[] = [];
  for (const file of files) {
    if (!file.patch) continue;
    // Skip files that are obviously credential examples (test fixtures documenting
    // the shape of a token) — reduces false-positive noise.
    if (/\.(example|sample|fixture|template)\b|\/fixtures?\//.test(file.filename)) continue;
    const addedLines = file.patch.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
    const addedText = addedLines.join("\n");
    for (const { label, re } of SECRET_PATTERNS) {
      if (re.test(addedText)) {
        findings.push({
          ruleKey: "secret-in-diff",
          title: `Possible ${label} committed`,
          description: `An added line in ${file.filename} matches the pattern for a ${label}. If it's real, rotate immediately and remove from the diff. If it's a fixture, move it under a fixtures/ path.`,
          filePath: file.filename,
          severity: "high",
          confidence: 0.9,
          source: "policy-engine",
          evidence: { file: file.filename, patternLabel: label },
        });
      }
    }
  }
  return findings;
}

/** Deletion of a test file — usually a red flag on any repo that values test coverage. */
function checkRemovedTests(files: PrFile[]): PolicyFinding[] {
  const removed = files.filter((f) => f.status === "removed" && TEST_PATH_PATTERN.test(f.filename));
  return removed.map((f) => ({
    ruleKey: "removed-test-file",
    title: "Test file deleted",
    description: `${f.filename} was removed. Confirm the covered behavior is either gone or exercised by another test.`,
    filePath: f.filename,
    severity: "medium",
    confidence: 0.8,
    source: "policy-engine",
    evidence: { file: f.filename },
  }));
}

/** Unusually large single-file change (>500 lines). Big diffs are harder to review and more likely to hide issues. */
function checkLargeFileChange(files: PrFile[]): PolicyFinding[] {
  const large = files.filter((f) => (f.additions + f.deletions) > 500 && !/\bpnpm-lock\.yaml|package-lock\.json|yarn\.lock\b/.test(f.filename));
  return large.map((f) => ({
    ruleKey: "large-single-file-change",
    title: "Large single-file change",
    description: `${f.filename} changed ${f.additions + f.deletions} lines in one file. Consider splitting into smaller PRs or, if unavoidable, calling out the intent in the description.`,
    filePath: f.filename,
    severity: "low",
    confidence: 0.7,
    source: "policy-engine",
    evidence: { file: f.filename, changes: f.additions + f.deletions },
  }));
}

/** Direct database access inside an HTTP handler path — typically violates the service-layer pattern used in most non-trivial repos. */
function checkDirectDbAccessInHandler(files: PrFile[]): PolicyFinding[] {
  const findings: PolicyFinding[] = [];
  for (const file of files) {
    if (!file.patch) continue;
    if (!HANDLER_PATH_PATTERN.test(file.filename)) continue;
    const added = file.patch.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).join("\n");
    // Look for common raw-DB tells in added lines.
    if (/\b(prisma|drizzle|knex|pg|mysql2)\.(query|execute|\$queryRaw|\$executeRaw)\b|\bnew Pool\(|\bawait sql`/i.test(added)) {
      findings.push({
        ruleKey: "direct-db-access-in-handler",
        title: "Handler talks to the database directly",
        description: `${file.filename} lives on an HTTP handler path and issues a raw database call in this diff. Most repos abstract this behind a service/repository layer for testability and consistency — confirm this is intentional.`,
        filePath: file.filename,
        severity: "medium",
        confidence: 0.65,
        source: "policy-engine",
        evidence: { file: file.filename },
      });
    }
  }
  return findings;
}

/** SQL migration files added — worth surfacing so a reviewer explicitly acknowledges them. */
function checkMigrationAdded(files: PrFile[]): PolicyFinding[] {
  const migrations = files.filter((f) =>
    f.status === "added" &&
    /\.(sql|migration\.[jt]s)$/i.test(f.filename) &&
    /\/(migrations?|drizzle|alembic\/versions|prisma\/migrations)\//i.test(f.filename),
  );
  if (migrations.length === 0) return [];
  return [{
    ruleKey: "migration-added",
    title: `${migrations.length} new database migration${migrations.length === 1 ? "" : "s"}`,
    description: `Migration files change production schema. Confirm they're safe under concurrent writes (adding NOT NULL columns without defaults, dropping columns, renaming, etc. all deserve extra scrutiny).`,
    filePath: migrations[0].filename,
    severity: "medium",
    confidence: 0.85,
    source: "policy-engine",
    evidence: { files: migrations.map((f) => f.filename) },
  }];
}

// Swallowed exceptions in added lines: catch(...) {} or catch(...) { // ignore }.
function checkSwallowedCatch(files: PrFile[]): PolicyFinding[] {
  const findings: PolicyFinding[] = [];
  const swallowRe = /^\+.*\bcatch\s*\([^)]*\)\s*\{\s*(\/\/[^\n]*|\/\*[^*]*\*\/)?\s*\}/m;
  for (const file of files) {
    if (!file.patch) continue;
    if (swallowRe.test(file.patch)) {
      findings.push({
        ruleKey: "swallowed-catch",
        title: "Empty catch block introduced",
        description: `${file.filename} adds a catch block that swallows the error without logging or rethrowing. Confirm this is intentional; consider at least logging so the incident can be traced.`,
        filePath: file.filename,
        severity: "medium",
        confidence: 0.85,
        source: "policy-engine",
        evidence: { file: file.filename },
      });
    }
  }
  return findings;
}

/** Hardcoded localhost/dev URLs in production paths. */
function checkHardcodedLocalhost(files: PrFile[]): PolicyFinding[] {
  const findings: PolicyFinding[] = [];
  for (const file of files) {
    if (!file.patch) continue;
    // Skip files that legitimately contain localhost (tests, docs, config templates).
    if (TEST_PATH_PATTERN.test(file.filename)) continue;
    if (/\.(md|mdx|txt|example|sample|template)$/i.test(file.filename)) continue;
    if (/\/(docs?|examples?)\//.test(file.filename)) continue;
    const added = file.patch.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).join("\n");
    if (/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(added)) {
      findings.push({
        ruleKey: "hardcoded-localhost",
        title: "Hardcoded localhost URL",
        description: `${file.filename} adds a hardcoded localhost/127.0.0.1 URL. Move it to a config/env var before shipping to production.`,
        filePath: file.filename,
        severity: "medium",
        confidence: 0.8,
        source: "policy-engine",
        evidence: { file: file.filename },
      });
    }
  }
  return findings;
}

export function runPolicyChecks(files: PrFile[]): PolicyFinding[] {
  const findings: PolicyFinding[] = [];
  const missingTests = checkMissingTests(files);
  if (missingTests) findings.push(missingTests);
  findings.push(...checkDebugCode(files));
  const depChange = checkDependencyChange(files);
  if (depChange) findings.push(depChange);

  // Newly added rules
  findings.push(...checkSecrets(files));
  findings.push(...checkRemovedTests(files));
  findings.push(...checkLargeFileChange(files));
  findings.push(...checkDirectDbAccessInHandler(files));
  findings.push(...checkMigrationAdded(files));
  findings.push(...checkSwallowedCatch(files));
  findings.push(...checkHardcodedLocalhost(files));

  return findings;
}
