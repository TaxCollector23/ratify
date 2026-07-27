import Parser from "web-tree-sitter";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type {
  ComplexityHeuristics,
  LanguagePlugin,
  ParsedExport,
  ParsedImport,
  ParsedParameter,
  ParsedSymbol,
  SourceRange,
  SymbolKind,
  SymbolTable,
} from "./types.js";

const require = createRequire(import.meta.url);

const BRANCHING_NODE_TYPES = new Set([
  "if_statement",
  "for_statement",
  "for_in_statement",
  "while_statement",
  "do_statement",
  "case_clause",
  "catch_clause",
  "ternary_expression",
  "binary_expression", // approximation: && / || short-circuit branches counted loosely below
]);

const NESTING_NODE_TYPES = new Set([
  "if_statement",
  "for_statement",
  "for_in_statement",
  "while_statement",
  "do_statement",
  "try_statement",
  "switch_statement",
  "block",
]);

function toRange(node: Parser.SyntaxNode): SourceRange {
  return {
    startLine: node.startPosition.row + 1,
    startColumn: node.startPosition.column,
    endLine: node.endPosition.row + 1,
    endColumn: node.endPosition.column,
  };
}

function computeComplexity(node: Parser.SyntaxNode): ComplexityHeuristics {
  let cyclomatic = 1;
  let maxDepth = 0;

  const walk = (n: Parser.SyntaxNode, depth: number) => {
    if (BRANCHING_NODE_TYPES.has(n.type)) {
      if (n.type === "binary_expression") {
        const op = n.child(1)?.text;
        if (op === "&&" || op === "||") cyclomatic += 1;
      } else {
        cyclomatic += 1;
      }
    }
    const nextDepth = NESTING_NODE_TYPES.has(n.type) ? depth + 1 : depth;
    maxDepth = Math.max(maxDepth, nextDepth);
    for (let i = 0; i < n.namedChildCount; i++) {
      const child = n.namedChild(i);
      if (child) walk(child, nextDepth);
    }
  };
  walk(node, 0);

  const lineCount = node.endPosition.row - node.startPosition.row + 1;
  return { cyclomatic, maxNestingDepth: maxDepth, lineCount };
}

function findDocComment(node: Parser.SyntaxNode): string | undefined {
  let prev = node.previousSibling;
  while (prev && prev.type === "comment") {
    if (prev.text.startsWith("/**")) {
      return prev.text;
    }
    prev = prev.previousSibling;
  }
  return undefined;
}

function isExported(node: Parser.SyntaxNode): { exported: boolean; isDefault: boolean } {
  const parent = node.parent;
  if (!parent) return { exported: false, isDefault: false };
  if (parent.type === "export_statement") {
    const isDefault = parent.children.some((c) => c?.type === "default");
    return { exported: true, isDefault };
  }
  return { exported: false, isDefault: false };
}

function extractParameters(paramsNode: Parser.SyntaxNode | null): ParsedParameter[] {
  if (!paramsNode) return [];
  const params: ParsedParameter[] = [];
  for (let i = 0; i < paramsNode.namedChildCount; i++) {
    const child = paramsNode.namedChild(i);
    if (!child) continue;
    if (child.type === "required_parameter" || child.type === "optional_parameter" || child.type === "identifier") {
      const patternNode = child.childForFieldName("pattern") ?? child;
      const typeNode = child.childForFieldName("type");
      const valueNode = child.childForFieldName("value");
      params.push({
        name: patternNode.text.replace(/[:?].*$/s, "").trim(),
        typeText: typeNode?.text,
        optional: child.type === "optional_parameter",
        hasDefault: Boolean(valueNode),
      });
    }
  }
  return params;
}

function extractHeritage(classNode: Parser.SyntaxNode): { extends: string[]; implementsInterfaces: string[] } {
  const heritage = classNode.childForFieldName("heritage") ?? classNode.children.find((c) => c?.type === "class_heritage");
  const extendsList: string[] = [];
  const implementsList: string[] = [];
  if (heritage) {
    for (let i = 0; i < heritage.namedChildCount; i++) {
      const clause = heritage.namedChild(i);
      if (!clause) continue;
      if (clause.type === "extends_clause") {
        for (let j = 0; j < clause.namedChildCount; j++) {
          const n = clause.namedChild(j);
          if (n) extendsList.push(n.text);
        }
      } else if (clause.type === "implements_clause") {
        for (let j = 0; j < clause.namedChildCount; j++) {
          const n = clause.namedChild(j);
          if (n) implementsList.push(n.text);
        }
      }
    }
  }
  return { extends: extendsList, implementsInterfaces: implementsList };
}

/**
 * TypeScript/JavaScript language plugin backed by web-tree-sitter (WASM),
 * chosen for portability — no native compilation toolchain required.
 * Grammar WASM files are resolved from the `tree-sitter-typescript` and
 * `tree-sitter-javascript` npm packages at runtime.
 */
export class TypeScriptPlugin implements LanguagePlugin {
  readonly id = "typescript";
  readonly extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

  private tsParser?: Parser;
  private tsxParser?: Parser;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await Parser.init();

    this.tsParser = new Parser();
    this.tsParser.setLanguage(await Parser.Language.load(this.resolveWasm("tree-sitter-typescript.wasm")));

    this.tsxParser = new Parser();
    this.tsxParser.setLanguage(await Parser.Language.load(this.resolveWasm("tree-sitter-tsx.wasm")));

    this.initialized = true;
  }

  private resolveWasm(file: string): string {
    const pkgJsonPath = require.resolve("tree-sitter-wasms/package.json");
    return join(dirname(pkgJsonPath), "out", file);
  }

  async parse(filePath: string, sourceText: string): Promise<SymbolTable> {
    if (!this.initialized) await this.init();
    const isTsx = filePath.endsWith(".tsx") || filePath.endsWith(".jsx");
    const parser = isTsx ? this.tsxParser! : this.tsParser!;

    const tree = parser.parse(sourceText);
    const root = tree.rootNode;

    const symbols: ParsedSymbol[] = [];
    const imports: ParsedImport[] = [];
    const exports: ParsedExport[] = [];
    const parseErrors: string[] = [];

    const collectErrors = (node: Parser.SyntaxNode) => {
      if (node.type === "ERROR" || node.isMissing) {
        parseErrors.push(`Syntax error near line ${node.startPosition.row + 1}`);
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) collectErrors(child);
      }
    };
    collectErrors(root);

    const visit = (node: Parser.SyntaxNode, enclosingClass?: string) => {
      switch (node.type) {
        case "function_declaration": {
          const nameNode = node.childForFieldName("name");
          if (nameNode) symbols.push(this.buildFunctionSymbol(node, nameNode.text, sourceText));
          break;
        }
        case "class_declaration": {
          const nameNode = node.childForFieldName("name");
          if (nameNode) {
            const classSymbol = this.buildClassSymbol(node, nameNode.text, sourceText);
            symbols.push(classSymbol);
            for (let i = 0; i < node.namedChildCount; i++) {
              const child = node.namedChild(i);
              if (child) visit(child, nameNode.text);
            }
            return; // don't fall through to generic recursion (avoid duplicate visits)
          }
          break;
        }
        case "interface_declaration": {
          const nameNode = node.childForFieldName("name");
          if (nameNode) symbols.push(this.buildInterfaceSymbol(node, nameNode.text));
          break;
        }
        case "enum_declaration": {
          const nameNode = node.childForFieldName("name");
          if (nameNode) symbols.push(this.buildSimpleSymbol(node, nameNode.text, "enum"));
          break;
        }
        case "type_alias_declaration": {
          const nameNode = node.childForFieldName("name");
          if (nameNode) symbols.push(this.buildSimpleSymbol(node, nameNode.text, "type-alias"));
          break;
        }
        case "method_definition": {
          const nameNode = node.childForFieldName("name");
          if (nameNode && enclosingClass) {
            const methodSymbol = this.buildFunctionSymbol(
              node,
              nameNode.text,
              sourceText,
              "method",
              `${enclosingClass}.${nameNode.text}`,
            );
            const parent = symbols.find((s) => s.name === enclosingClass && s.kind === "class");
            parent?.members?.push(methodSymbol);
          }
          break;
        }
        case "lexical_declaration":
        case "variable_declaration": {
          for (let i = 0; i < node.namedChildCount; i++) {
            const declarator = node.namedChild(i);
            if (declarator?.type !== "variable_declarator") continue;
            const nameNode = declarator.childForFieldName("name");
            const valueNode = declarator.childForFieldName("value");
            if (!nameNode) continue;
            const isArrowFn = valueNode?.type === "arrow_function" || valueNode?.type === "function_expression";
            if (isArrowFn && valueNode) {
              symbols.push(this.buildFunctionSymbol(node, nameNode.text, sourceText, "function", nameNode.text, valueNode));
            } else {
              const isConst = node.type === "lexical_declaration" && node.text.startsWith("const");
              const { exported } = isExported(node);
              symbols.push({
                kind: isConst ? "constant" : "variable",
                name: nameNode.text,
                qualifiedName: nameNode.text,
                range: toRange(node),
                isExported: exported,
                complexity: { cyclomatic: 1, maxNestingDepth: 0, lineCount: 1 },
              });
            }
          }
          break;
        }
        case "import_statement": {
          imports.push(...this.buildImports(node));
          break;
        }
        case "export_statement": {
          exports.push(...this.buildExports(node));
          break;
        }
      }

      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child) visit(child, enclosingClass);
      }
    };

    visit(root);

    const publicApiSurface = symbols.filter((s) => s.isExported).map((s) => s.name);

    return {
      filePath,
      language: isTsx ? "tsx" : "typescript",
      symbols,
      imports,
      exports,
      publicApiSurface,
      parseErrors,
      hasSyntaxError: parseErrors.length > 0,
    };
  }

  private buildFunctionSymbol(
    node: Parser.SyntaxNode,
    name: string,
    sourceText: string,
    kind: SymbolKind = "function",
    qualifiedName: string = name,
    bodyNode: Parser.SyntaxNode = node,
  ): ParsedSymbol {
    const { exported, isDefault } = isExported(node);
    const paramsNode =
      bodyNode.childForFieldName("parameters") ?? node.childForFieldName("parameters") ?? null;
    const returnTypeNode = bodyNode.childForFieldName("return_type") ?? node.childForFieldName("return_type");
    const asyncKeyword = node.children.find((c) => c?.type === "async");

    return {
      kind,
      name,
      qualifiedName,
      range: toRange(node),
      isExported: exported,
      isDefault,
      isAsync: Boolean(asyncKeyword),
      parameters: extractParameters(paramsNode),
      returnTypeText: returnTypeNode?.text,
      complexity: computeComplexity(bodyNode),
      docComment: findDocComment(node),
      members: kind === "method" ? undefined : undefined,
    };
  }

  private buildClassSymbol(node: Parser.SyntaxNode, name: string, sourceText: string): ParsedSymbol {
    const { exported, isDefault } = isExported(node);
    const heritage = extractHeritage(node);
    return {
      kind: "class",
      name,
      qualifiedName: name,
      range: toRange(node),
      isExported: exported,
      isDefault,
      extends: heritage.extends,
      implementsInterfaces: heritage.implementsInterfaces,
      members: [],
      complexity: computeComplexity(node),
      docComment: findDocComment(node),
    };
  }

  private buildInterfaceSymbol(node: Parser.SyntaxNode, name: string): ParsedSymbol {
    const { exported, isDefault } = isExported(node);
    const heritage = extractHeritage(node);
    return {
      kind: "interface",
      name,
      qualifiedName: name,
      range: toRange(node),
      isExported: exported,
      isDefault,
      extends: heritage.extends,
      members: [],
      complexity: { cyclomatic: 1, maxNestingDepth: 0, lineCount: node.endPosition.row - node.startPosition.row + 1 },
    };
  }

  private buildSimpleSymbol(node: Parser.SyntaxNode, name: string, kind: SymbolKind): ParsedSymbol {
    const { exported, isDefault } = isExported(node);
    return {
      kind,
      name,
      qualifiedName: name,
      range: toRange(node),
      isExported: exported,
      isDefault,
      complexity: { cyclomatic: 1, maxNestingDepth: 0, lineCount: node.endPosition.row - node.startPosition.row + 1 },
    };
  }

  private buildImports(node: Parser.SyntaxNode): ParsedImport[] {
    const sourceNode = node.childForFieldName("source");
    const source = sourceNode ? sourceNode.text.replace(/^['"]|['"]$/g, "") : "";
    const clause = node.namedChildren.find((c) => c?.type === "import_clause");

    if (!clause) {
      return [{ kind: "side-effect", source, importedNames: [], range: toRange(node) }];
    }

    const results: ParsedImport[] = [];
    for (let i = 0; i < clause.namedChildCount; i++) {
      const part = clause.namedChild(i);
      if (!part) continue;
      if (part.type === "identifier") {
        results.push({ kind: "default", source, importedNames: [part.text], range: toRange(node) });
      } else if (part.type === "namespace_import") {
        const alias = part.namedChild(0)?.text ?? "*";
        results.push({ kind: "namespace", source, importedNames: [alias], range: toRange(node) });
      } else if (part.type === "named_imports") {
        const names: string[] = [];
        for (let j = 0; j < part.namedChildCount; j++) {
          const spec = part.namedChild(j);
          if (spec?.type === "import_specifier") {
            names.push(spec.text);
          }
        }
        results.push({ kind: "named", source, importedNames: names, range: toRange(node) });
      }
    }
    return results.length > 0 ? results : [{ kind: "side-effect", source, importedNames: [], range: toRange(node) }];
  }

  private buildExports(node: Parser.SyntaxNode): ParsedExport[] {
    const sourceNode = node.childForFieldName("source");
    const source = sourceNode ? sourceNode.text.replace(/^['"]|['"]$/g, "") : undefined;
    const isDefault = node.children.some((c) => c?.type === "default");

    if (source) {
      const namedExportsNode = node.namedChildren.find((c) => c?.type === "export_clause");
      if (namedExportsNode) {
        const results: ParsedExport[] = [];
        for (let i = 0; i < namedExportsNode.namedChildCount; i++) {
          const spec = namedExportsNode.namedChild(i);
          if (spec) results.push({ kind: "re-export-named", name: spec.text, source, range: toRange(node) });
        }
        return results;
      }
      return [{ kind: "re-export-all", source, range: toRange(node) }];
    }

    if (isDefault) {
      return [{ kind: "default", range: toRange(node) }];
    }

    // export { a, b } or export const/function/class ... (declaration handled elsewhere;
    // this branch covers bare `export { ... }` clauses without a source)
    const exportClause = node.namedChildren.find((c) => c?.type === "export_clause");
    if (exportClause) {
      const results: ParsedExport[] = [];
      for (let i = 0; i < exportClause.namedChildCount; i++) {
        const spec = exportClause.namedChild(i);
        if (spec) results.push({ kind: "named", name: spec.text, range: toRange(node) });
      }
      return results;
    }

    return [];
  }
}
