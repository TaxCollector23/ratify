import type { PolicyCheckContext, PolicyFinding } from "../types.js";

/**
 * Heuristic breaking-API-change detector: compares the exported symbol
 * surface between the old and new parsed content of each changed file.
 * A symbol is a likely breaking change if it was exported before and is
 * no longer exported (removed) or if its parameter count/shape shrank in
 * a way that isn't backward compatible (fewer optional trailing params).
 */
export function breakingApiChangeHeuristic(ctx: PolicyCheckContext): PolicyFinding[] {
  const findings: PolicyFinding[] = [];

  for (const fc of ctx.fileChanges) {
    if (!fc.oldSymbolTable || !fc.newSymbolTable) continue;

    const oldPublic = new Map(fc.oldSymbolTable.symbols.filter((s) => s.isExported).map((s) => [s.qualifiedName, s]));
    const newPublic = new Map(fc.newSymbolTable.symbols.filter((s) => s.isExported).map((s) => [s.qualifiedName, s]));

    const removedExports: string[] = [];
    for (const name of oldPublic.keys()) {
      if (!newPublic.has(name)) removedExports.push(name);
    }

    if (removedExports.length > 0) {
      findings.push({
        ruleKey: "breaking-api-change",
        title: `Public API symbol(s) removed in ${fc.filePath}`,
        description: `The following previously-exported symbols are no longer exported: ${removedExports.join(", ")}. Any downstream consumer importing them will break at build or runtime.`,
        severity: "critical",
        confidence: 0.7,
        filePath: fc.filePath,
        evidence: removedExports.map((name) => ({
          kind: "file-line" as const,
          ref: `${fc.filePath}#${name}`,
          excerpt: `export ${name} present in base, absent in head`,
        })),
        remediation: "If this removal is intentional, bump the major version and document it in the changelog/ADR.",
      });
    }

    for (const [name, oldSym] of oldPublic) {
      const newSym = newPublic.get(name);
      if (!newSym || oldSym.kind !== "function" || newSym.kind !== "function") continue;

      const oldRequired = (oldSym.parameters ?? []).filter((p) => !p.optional && !p.hasDefault).length;
      const newRequired = (newSym.parameters ?? []).filter((p) => !p.optional && !p.hasDefault).length;

      if (newRequired > oldRequired) {
        findings.push({
          ruleKey: "breaking-api-change",
          title: `Function signature narrowed for ${name} in ${fc.filePath}`,
          description: `${name} previously required ${oldRequired} parameter(s); it now requires ${newRequired}. Existing call sites passing fewer arguments will fail to type-check or throw at runtime.`,
          severity: "high",
          confidence: 0.55,
          filePath: fc.filePath,
          lineStart: newSym.range.startLine,
          lineEnd: newSym.range.endLine,
          evidence: [
            {
              kind: "file-line",
              ref: `${fc.filePath}#L${newSym.range.startLine}-L${newSym.range.endLine}`,
              excerpt: `required params: ${oldRequired} -> ${newRequired}`,
            },
          ],
          remediation: "Consider making new parameters optional or providing overloads/defaults to preserve compatibility.",
        });
      }
    }
  }

  return findings;
}
