import type { MinedDocument, DocumentArtifactKind } from "./types.js";

/**
 * Heuristic classification of a repository file into a DocumentArtifact
 * kind, based on path conventions widely used in real repos (ADR tooling
 * like adr-tools/log4brains, RFC directories, CODEOWNERS, CI configs).
 * Deterministic and explainable — no LLM guessing.
 */
export function classifyDocumentPath(filePath: string): DocumentArtifactKind | null {
  const lower = filePath.toLowerCase();
  const base = lower.split("/").pop() ?? lower;

  if (base === "codeowners" || lower.endsWith(".github/codeowners")) return "codeowners";
  if (base === "changelog.md" || base === "changelog") return "changelog";
  if (base === "readme.md" || base === "readme") return "readme";

  if (isCiConfigPath(lower)) return "ci-config";

  if (isAdrPath(lower)) return "adr";
  if (isRfcPath(lower)) return "rfc";

  if (lower.startsWith("docs/") && lower.endsWith(".md")) return "doc";

  return null;
}

function isCiConfigPath(lower: string): boolean {
  return (
    lower.startsWith(".github/workflows/") ||
    lower === ".gitlab-ci.yml" ||
    lower === "circle.yml" ||
    lower.startsWith(".circleci/") ||
    lower === "azure-pipelines.yml" ||
    lower === "jenkinsfile"
  );
}

function isAdrPath(lower: string): boolean {
  // Common ADR directory conventions: docs/adr/, doc/adr/, adr/, docs/architecture/decisions/
  return (
    /(^|\/)docs?\/adr\//.test(lower) ||
    /(^|\/)adr\//.test(lower) ||
    /(^|\/)docs?\/architecture\/decisions\//.test(lower) ||
    /\d{4}-.*\.md$/.test(lower.split("/").pop() ?? "") && lower.includes("adr")
  );
}

function isRfcPath(lower: string): boolean {
  return /(^|\/)rfcs?\//.test(lower) || (lower.startsWith("rfc-") && lower.endsWith(".md"));
}

export interface AdrFrontMatter {
  title: string | null;
  status: string | null;
  date: string | null;
}

/**
 * Extracts ADR/RFC front-matter from common formats:
 *   - Markdown H1 title ("# 12. Use Postgres for storage")
 *   - MADR-style "## Status" / "## Date" sections
 *   - YAML front-matter block (--- status: accepted ---)
 */
export function extractAdrFrontMatter(content: string): AdrFrontMatter {
  const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (yamlMatch) {
    const yaml = yamlMatch[1] ?? "";
    return {
      title: extractYamlField(yaml, "title"),
      status: extractYamlField(yaml, "status"),
      date: extractYamlField(yaml, "date"),
    };
  }

  const titleMatch = content.match(/^#\s+(.+)$/m);
  const statusMatch = content.match(/^#{1,3}\s*Status\s*\n+\s*(.+)$/im);
  const dateMatch = content.match(/^#{1,3}\s*Date\s*\n+\s*(.+)$/im);

  return {
    title: titleMatch ? titleMatch[1]!.trim() : null,
    status: statusMatch ? statusMatch[1]!.trim() : null,
    date: dateMatch ? dateMatch[1]!.trim() : null,
  };
}

function extractYamlField(yaml: string, field: string): string | null {
  const match = yaml.match(new RegExp(`^${field}:\\s*(.+)$`, "im"));
  return match ? match[1]!.trim().replace(/^["']|["']$/g, "") : null;
}

/**
 * Derives a human-readable title for a mined document: explicit front
 * matter title first, then first H1, then a title-cased filename.
 */
export function deriveDocumentTitle(filePath: string, content: string): string {
  const frontMatter = extractAdrFrontMatter(content);
  if (frontMatter.title) return frontMatter.title;
  const fileName = filePath.split("/").pop() ?? filePath;
  return fileName
    .replace(/\.(md|mdx|txt)$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Builds a MinedDocument from a classified path + raw content, or null if the path isn't a recognized doc kind. */
export function buildMinedDocument(filePath: string, content: string, commitSha: string): MinedDocument | null {
  const kind = classifyDocumentPath(filePath);
  if (!kind) return null;
  return {
    filePath,
    kind,
    title: deriveDocumentTitle(filePath, content),
    content,
    commitSha,
  };
}
