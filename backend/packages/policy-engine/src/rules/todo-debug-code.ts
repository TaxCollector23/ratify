import type { PolicyCheckContext, PolicyFinding } from "../types.js";

const TODO_PATTERN = /\b(TODO|FIXME|HACK|XXX)\b[:\s]/;
const DEBUG_PATTERNS: RegExp[] = [
  /console\.(log|debug|trace)\(/,
  /debugger;?/,
  /\bpdb\.set_trace\(\)/,
  /\bbinding\.pry\b/,
];

/**
 * Scans added lines of the diff patch for TODO/FIXME/HACK markers and
 * leftover debug statements (console.log, debugger, etc). Only inspects
 * *added* lines (lines beginning with "+" in a unified diff, excluding
 * the "+++" file header) so it doesn't flag pre-existing code.
 */
export function todoDebugCodeDetection(ctx: PolicyCheckContext): PolicyFinding[] {
  const findings: PolicyFinding[] = [];

  for (const fc of ctx.fileChanges) {
    if (!fc.patchText || fc.isBinary) continue;

    const addedLines = extractAddedLines(fc.patchText);
    for (const { lineNumber, text } of addedLines) {
      if (TODO_PATTERN.test(text)) {
        findings.push(
          buildFinding(fc.filePath, lineNumber, text, "todo-marker", "TODO/FIXME marker introduced", "medium", 0.9),
        );
      }
      if (DEBUG_PATTERNS.some((p) => p.test(text))) {
        findings.push(
          buildFinding(fc.filePath, lineNumber, text, "debug-statement", "Debug statement introduced", "low", 0.85),
        );
      }
    }
  }

  return findings;
}

function buildFinding(
  filePath: string,
  lineNumber: number,
  text: string,
  subtype: string,
  label: string,
  severity: PolicyFinding["severity"],
  confidence: number,
): PolicyFinding {
  return {
    ruleKey: "todo-fixme-debug-code",
    title: `${label} in ${filePath}:${lineNumber}`,
    description: `Added line matches the ${subtype} pattern: "${text.trim()}"`,
    severity,
    confidence,
    filePath,
    lineStart: lineNumber,
    lineEnd: lineNumber,
    evidence: [{ kind: "file-line", ref: `${filePath}#L${lineNumber}`, excerpt: text.trim() }],
    remediation:
      subtype === "todo-marker"
        ? "Resolve the TODO before merging, or link it to a tracked issue."
        : "Remove debug statements before merging to production.",
  };
}

interface AddedLine {
  lineNumber: number;
  text: string;
}

/** Parses a unified diff patch and returns only newly-added lines with their new-file line numbers. */
function extractAddedLines(patchText: string): AddedLine[] {
  const lines = patchText.split("\n");
  const result: AddedLine[] = [];
  let currentNewLine = 0;

  for (const line of lines) {
    const hunkHeader = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunkHeader) {
      currentNewLine = Number.parseInt(hunkHeader[1] ?? "0", 10);
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      result.push({ lineNumber: currentNewLine, text: line.slice(1) });
      currentNewLine++;
    } else if (!line.startsWith("-")) {
      currentNewLine++;
    }
  }
  return result;
}
