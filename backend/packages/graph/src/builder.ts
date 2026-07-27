import type { SymbolTable } from "@ratify/parser";
import { GraphRepository } from "./repository.js";

/**
 * Builds file + symbol + import graph nodes/edges from parser output.
 * This is the deterministic bridge between packages/parser and the
 * knowledge graph — no LLM involvement.
 */
export async function buildGraphFromSymbolTable(
  graph: GraphRepository,
  repositoryId: string,
  table: SymbolTable,
): Promise<void> {
  await graph.upsertNode({
    repositoryId,
    kind: "file",
    externalRef: table.filePath,
    label: table.filePath,
    metadata: { language: table.language, hasSyntaxError: table.hasSyntaxError },
  });

  for (const symbol of table.symbols) {
    const symbolRef = `${table.filePath}#${symbol.qualifiedName}`;
    await graph.upsertNode({
      repositoryId,
      kind: "symbol",
      externalRef: symbolRef,
      label: symbol.qualifiedName,
      metadata: {
        kind: symbol.kind,
        isExported: symbol.isExported,
        complexity: symbol.complexity,
        range: symbol.range,
      },
    });

    await graph.upsertEdge({
      repositoryId,
      kind: "depends_on",
      sourceExternalRef: { kind: "symbol", externalRef: symbolRef },
      targetExternalRef: { kind: "file", externalRef: table.filePath },
      metadata: { relation: "declared-in" },
    });

    for (const member of symbol.members ?? []) {
      const memberRef = `${table.filePath}#${member.qualifiedName}`;
      await graph.upsertNode({
        repositoryId,
        kind: "symbol",
        externalRef: memberRef,
        label: member.qualifiedName,
        metadata: { kind: member.kind, isExported: member.isExported, complexity: member.complexity },
      });
      await graph.upsertEdge({
        repositoryId,
        kind: "depends_on",
        sourceExternalRef: { kind: "symbol", externalRef: memberRef },
        targetExternalRef: { kind: "symbol", externalRef: symbolRef },
        metadata: { relation: "member-of" },
      });
    }
  }

  for (const imp of table.imports) {
    if (!imp.source.startsWith(".")) continue; // skip external package imports for the intra-repo graph
    const targetFile = resolveRelativeImport(table.filePath, imp.source);
    await graph.upsertNode({
      repositoryId,
      kind: "file",
      externalRef: targetFile,
      label: targetFile,
      metadata: { placeholder: true }, // will be enriched when that file is itself parsed
    });
    await graph.upsertEdge({
      repositoryId,
      kind: "imports",
      sourceExternalRef: { kind: "file", externalRef: table.filePath },
      targetExternalRef: { kind: "file", externalRef: targetFile },
      metadata: { importedNames: imp.importedNames },
    });
  }
}

/** Best-effort relative import resolution (extension-less, no real FS lookup here). */
function resolveRelativeImport(fromFile: string, specifier: string): string {
  const fromDir = fromFile.split("/").slice(0, -1);
  const parts = specifier.split("/");
  const stack = [...fromDir];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}
