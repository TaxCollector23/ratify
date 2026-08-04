import ts from "typescript";
import type { PrFile, PolicyFinding } from "./policy-checks";

/**
 * Real AST-based analysis for TypeScript/JavaScript files in a diff.
 *
 * Regex-only rules (in policy-checks.ts) catch the obvious classes of
 * mistake but miss anything structural — an unhandled Promise-returning
 * call, a try/catch that swallows every error, an exported symbol that
 * nothing else in the diff uses. Parsing with the real TypeScript compiler
 * catches those with dramatically lower false-positive rates than pattern
 * matching, and does it fast enough to run inside the webhook handler.
 *
 * Every finding produced here is tagged `source: "policy-engine"` so it
 * flows through the same evidence/blending pipeline as regex-based rules;
 * the ruleKey prefix `ast-` distinguishes them for the benchmarks page.
 */
export function runAstAnalysis(files: PrFile[]): PolicyFinding[] {
  const findings: PolicyFinding[] = [];

  for (const file of files) {
    if (!isAnalyzableFile(file.filename)) continue;
    if (!file.patch) continue;

    const addedSource = extractAddedSource(file.patch);
    if (!addedSource.trim()) continue;

    let sourceFile: ts.SourceFile;
    try {
      sourceFile = ts.createSourceFile(
        file.filename,
        addedSource,
        ts.ScriptTarget.Latest,
        /* setParentNodes */ true,
        file.filename.endsWith(".tsx") || file.filename.endsWith(".jsx")
          ? ts.ScriptKind.TSX
          : ts.ScriptKind.TS,
      );
    } catch {
      // If parse fails outright the diff is likely partial (we only extract
      // added lines); skip silently rather than raising noise.
      continue;
    }

    findings.push(...detectSwallowedCatches(sourceFile, file.filename));
    findings.push(...detectUnhandledPromises(sourceFile, file.filename));
    findings.push(...detectEmptyBlocks(sourceFile, file.filename));
    findings.push(...detectAnyEscapeHatch(sourceFile, file.filename));
  }

  return findings;
}

function isAnalyzableFile(filename: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filename) && !/\.d\.ts$/.test(filename);
}

/** Pull just the added lines out of a unified diff patch. */
function extractAddedSource(patch: string): string {
  return patch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))
    .join("\n");
}

/** try/catch blocks whose catch clause body is empty or just a bare `return;` — silently swallows errors. */
function detectSwallowedCatches(source: ts.SourceFile, filePath: string): PolicyFinding[] {
  const out: PolicyFinding[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCatchClause(node)) {
      const body = node.block;
      const nonTrivial = body.statements.filter((s) => {
        if (ts.isEmptyStatement(s)) return false;
        if (ts.isReturnStatement(s) && (!s.expression || s.expression.kind === ts.SyntaxKind.UndefinedKeyword)) return false;
        return true;
      });
      if (nonTrivial.length === 0) {
        out.push({
          ruleKey: "ast-swallowed-catch",
          title: "Empty catch block swallows errors",
          description: `A catch clause in ${filePath} runs no statements against the caught error — the error will be silently dropped. Log it, re-throw a wrapped error, or add a comment explaining why silent ignore is safe here.`,
          filePath,
          severity: "medium",
          confidence: 0.88,
          source: "policy-engine",
          evidence: { file: filePath, ast: "empty catch block", start: node.getStart() },
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/** Bare promise-returning expression-statements — `fetch(url)` on its own line with no await, no .then, no .catch. Very high-signal for missed error handling. */
function detectUnhandledPromises(source: ts.SourceFile, filePath: string): PolicyFinding[] {
  const out: PolicyFinding[] = [];
  const PROMISE_RETURNING_HINT = /^(fetch|axios|refetch|save|update|delete|create|send|dispatch|invalidate|write)\b/i;

  const visit = (node: ts.Node) => {
    if (ts.isExpressionStatement(node)) {
      const expr = node.expression;
      if (ts.isCallExpression(expr)) {
        const text = node.getText(source);
        if (text.includes("await ")) { ts.forEachChild(node, visit); return; }
        const calleeText = expr.expression.getText(source);
        const chained = /\.(then|catch|finally)\s*\(/.test(text);
        if (!chained && PROMISE_RETURNING_HINT.test(lastIdentifierOf(calleeText))) {
          out.push({
            ruleKey: "ast-unhandled-promise",
            title: "Likely unhandled promise",
            description: `\`${calleeText}(…)\` in ${filePath} looks async but its return value is discarded — no await, no .then, no .catch. Either await it, chain a .catch, or store it explicitly if you meant fire-and-forget.`,
            filePath,
            severity: "medium",
            confidence: 0.72,
            source: "policy-engine",
            evidence: { file: filePath, callee: calleeText, start: node.getStart() },
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/** Empty function bodies in added code — common accidental stub. */
function detectEmptyBlocks(source: ts.SourceFile, filePath: string): PolicyFinding[] {
  const out: PolicyFinding[] = [];
  const visit = (node: ts.Node) => {
    const isFunctionLike =
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node);
    if (isFunctionLike && node.body && ts.isBlock(node.body) && node.body.statements.length === 0) {
      if (ts.isConstructorDeclaration(node)) { ts.forEachChild(node, visit); return; }
      const leading = source.text.slice(Math.max(0, node.getFullStart()), node.getStart());
      if (/abstract|noop|intentionally|placeholder/i.test(leading)) { ts.forEachChild(node, visit); return; }
      out.push({
        ruleKey: "ast-empty-function-body",
        title: "Function with empty body",
        description: `A function in ${filePath} has an empty body. If this is intentional, add a comment explaining why; otherwise this is likely an unfinished stub.`,
        filePath,
        severity: "low",
        confidence: 0.65,
        source: "policy-engine",
        evidence: { file: filePath, start: node.getStart() },
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/** New `any` type annotations — worth calling out in a repo that otherwise types things. */
function detectAnyEscapeHatch(source: ts.SourceFile, filePath: string): PolicyFinding[] {
  const out: PolicyFinding[] = [];
  let count = 0;
  const visit = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) count++;
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (count >= 3) {
    out.push({
      ruleKey: "ast-any-proliferation",
      title: `${count} \`any\` type annotations added`,
      description: `${count} new \`any\` type annotations appear in ${filePath}. If the shape is genuinely unknown consider \`unknown\` + narrowing; otherwise give the value a real type so future changes don't drift.`,
      filePath,
      severity: "low",
      confidence: 0.7,
      source: "policy-engine",
      evidence: { file: filePath, anyCount: count },
    });
  }
  return out;
}

function lastIdentifierOf(dotted: string): string {
  const parts = dotted.split(".");
  return parts[parts.length - 1] ?? dotted;
}
