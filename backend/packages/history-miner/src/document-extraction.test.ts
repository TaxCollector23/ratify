import { describe, expect, it } from "vitest";
import { buildMinedDocument, classifyDocumentPath, deriveDocumentTitle, extractAdrFrontMatter } from "./document-extraction.js";

describe("classifyDocumentPath", () => {
  it("classifies ADR files under docs/adr/", () => {
    expect(classifyDocumentPath("docs/adr/0001-use-postgres.md")).toBe("adr");
  });

  it("classifies ADR files under a bare adr/ directory", () => {
    expect(classifyDocumentPath("adr/0002-use-bullmq.md")).toBe("adr");
  });

  it("classifies RFC files", () => {
    expect(classifyDocumentPath("rfcs/2024-01-new-auth-flow.md")).toBe("rfc");
  });

  it("classifies CODEOWNERS regardless of directory", () => {
    expect(classifyDocumentPath(".github/CODEOWNERS")).toBe("codeowners");
    expect(classifyDocumentPath("CODEOWNERS")).toBe("codeowners");
  });

  it("classifies CI config paths", () => {
    expect(classifyDocumentPath(".github/workflows/ci.yml")).toBe("ci-config");
    expect(classifyDocumentPath(".circleci/config.yml")).toBe("ci-config");
  });

  it("classifies README and CHANGELOG", () => {
    expect(classifyDocumentPath("README.md")).toBe("readme");
    expect(classifyDocumentPath("CHANGELOG.md")).toBe("changelog");
  });

  it("classifies generic docs under docs/", () => {
    expect(classifyDocumentPath("docs/deployment.md")).toBe("doc");
  });

  it("returns null for unrelated source files", () => {
    expect(classifyDocumentPath("src/index.ts")).toBeNull();
  });
});

describe("extractAdrFrontMatter", () => {
  it("extracts YAML front matter", () => {
    const content = ["---", "title: Use Postgres", "status: accepted", "date: 2024-01-01", "---", "", "Body text."].join("\n");
    const fm = extractAdrFrontMatter(content);
    expect(fm).toEqual({ title: "Use Postgres", status: "accepted", date: "2024-01-01" });
  });

  it("extracts MADR-style H1 title and Status section", () => {
    const content = ["# 12. Use Postgres for storage", "", "## Status", "", "Accepted", "", "## Date", "", "2024-02-02"].join(
      "\n",
    );
    const fm = extractAdrFrontMatter(content);
    expect(fm.title).toBe("12. Use Postgres for storage");
    expect(fm.status).toBe("Accepted");
    expect(fm.date).toBe("2024-02-02");
  });

  it("returns nulls when no recognizable structure is present", () => {
    const fm = extractAdrFrontMatter("Just some prose with no headers.");
    expect(fm).toEqual({ title: null, status: null, date: null });
  });
});

describe("deriveDocumentTitle", () => {
  it("prefers front-matter title", () => {
    const content = "---\ntitle: Explicit Title\n---\nBody";
    expect(deriveDocumentTitle("docs/adr/0001-x.md", content)).toBe("Explicit Title");
  });

  it("falls back to a title-cased filename", () => {
    expect(deriveDocumentTitle("docs/deployment-guide.md", "no headers here")).toBe("Deployment Guide");
  });
});

describe("buildMinedDocument", () => {
  it("returns null for unrecognized paths", () => {
    expect(buildMinedDocument("src/index.ts", "content", "abc123")).toBeNull();
  });

  it("builds a MinedDocument for a recognized ADR path", () => {
    const doc = buildMinedDocument("docs/adr/0003-use-redis.md", "# Use Redis\n\nRationale...", "abc123");
    expect(doc).toMatchObject({
      filePath: "docs/adr/0003-use-redis.md",
      kind: "adr",
      title: "Use Redis",
      commitSha: "abc123",
    });
  });
});
