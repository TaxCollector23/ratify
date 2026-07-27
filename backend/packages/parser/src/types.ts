/**
 * Structural symbol table types produced by parsing. These are the
 * deterministic, structural facts about source code that the rest of
 * Ratify (graph-builder, policy-engine, retrieval, LLM context assembly)
 * relies on — never inferred by an LLM.
 */

export type SymbolKind =
  | "function"
  | "class"
  | "method"
  | "interface"
  | "enum"
  | "type-alias"
  | "variable"
  | "constant";

export interface SourceRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface ParsedSymbol {
  kind: SymbolKind;
  name: string;
  /** Qualified name including enclosing class/namespace, e.g. "UserService.create" */
  qualifiedName: string;
  range: SourceRange;
  isExported: boolean;
  isAsync?: boolean;
  isDefault?: boolean;
  parameters?: ParsedParameter[];
  returnTypeText?: string;
  extends?: string[];
  implementsInterfaces?: string[];
  members?: ParsedSymbol[]; // methods/properties nested inside a class/interface
  complexity: ComplexityHeuristics;
  docComment?: string;
}

export interface ParsedParameter {
  name: string;
  typeText?: string;
  optional: boolean;
  hasDefault: boolean;
}

export interface ComplexityHeuristics {
  /** Approximate cyclomatic complexity: 1 + count of branching constructs. */
  cyclomatic: number;
  /** Max nesting depth of control-flow blocks. */
  maxNestingDepth: number;
  /** Line count of the symbol body. */
  lineCount: number;
}

export type ImportKind = "named" | "default" | "namespace" | "side-effect" | "re-export";

export interface ParsedImport {
  kind: ImportKind;
  source: string; // module specifier
  importedNames: string[]; // local binding names (or ["*"] for namespace)
  range: SourceRange;
}

export type ExportKind = "named" | "default" | "re-export-all" | "re-export-named";

export interface ParsedExport {
  kind: ExportKind;
  name?: string;
  source?: string; // present for re-exports
  range: SourceRange;
}

export interface SymbolTable {
  filePath: string;
  language: string;
  symbols: ParsedSymbol[];
  imports: ParsedImport[];
  exports: ParsedExport[];
  /** Names considered part of the module's public API surface (exported top-level symbols). */
  publicApiSurface: string[];
  parseErrors: string[];
  hasSyntaxError: boolean;
}

/**
 * Language plugin interface: implement this to add parsing support for
 * a new language beyond the built-in TypeScript/JavaScript plugin.
 */
export interface LanguagePlugin {
  readonly id: string;
  readonly extensions: string[];
  init(): Promise<void>;
  parse(filePath: string, sourceText: string): Promise<SymbolTable>;
}
