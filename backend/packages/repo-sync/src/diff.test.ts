import { describe, expect, it } from "vitest";
import { parseNameStatus, parseNumstat, splitUnifiedDiffByFile, summarizeTouchedAreas } from "./diff.js";
import type { DiffFileChange } from "./types.js";

describe("parseNameStatus", () => {
  it("parses added/modified/removed files", () => {
    const raw = ["A\tsrc/new.ts", "M\tsrc/existing.ts", "D\tsrc/gone.ts"].join("\n");
    const result = parseNameStatus(raw);
    expect(result.get("src/new.ts")?.status).toBe("added");
    expect(result.get("src/existing.ts")?.status).toBe("modified");
    expect(result.get("src/gone.ts")?.status).toBe("removed");
  });

  it("parses renames with similarity score prefix", () => {
    const raw = "R100\tsrc/old-name.ts\tsrc/new-name.ts";
    const result = parseNameStatus(raw);
    expect(result.get("src/new-name.ts")).toEqual({ status: "renamed", previousFilePath: "src/old-name.ts" });
  });

  it("parses copies", () => {
    const raw = "C90\tsrc/original.ts\tsrc/copy.ts";
    const result = parseNameStatus(raw);
    expect(result.get("src/copy.ts")).toEqual({ status: "copied", previousFilePath: "src/original.ts" });
  });

  it("ignores blank lines", () => {
    const result = parseNameStatus("\n\nM\tsrc/foo.ts\n");
    expect(result.size).toBe(1);
  });
});

describe("parseNumstat", () => {
  it("parses additions/deletions and merges in status", () => {
    const statusByPath = parseNameStatus("M\tsrc/foo.ts");
    const raw = "5\t2\tsrc/foo.ts";
    const files = parseNumstat(raw, statusByPath);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ filePath: "src/foo.ts", additions: 5, deletions: 2, status: "modified", isBinary: false });
  });

  it("marks binary files (numstat uses '-' for additions/deletions)", () => {
    const raw = "-\t-\tassets/logo.png";
    const files = parseNumstat(raw, new Map());
    expect(files[0]).toMatchObject({ filePath: "assets/logo.png", additions: 0, deletions: 0, isBinary: true });
  });

  it("normalizes numstat rename arrow syntax", () => {
    const raw = "3\t1\told/path.ts => new/path.ts";
    const files = parseNumstat(raw, new Map());
    expect(files[0]?.filePath).toBe("new/path.ts");
    expect(files[0]?.previousFilePath).toBe("old/path.ts");
  });

  it("normalizes numstat brace rename syntax", () => {
    const raw = "1\t1\tsrc/{old => new}/file.ts";
    const files = parseNumstat(raw, new Map());
    expect(files[0]?.filePath).toBe("src/new/file.ts");
    expect(files[0]?.previousFilePath).toBe("src/old/file.ts");
  });
});

describe("splitUnifiedDiffByFile", () => {
  it("splits a multi-file unified diff into per-file sections", () => {
    const raw = [
      "diff --git a/src/a.ts b/src/a.ts",
      "index 111..222 100644",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "diff --git a/src/b.ts b/src/b.ts",
      "index 333..444 100644",
      "--- a/src/b.ts",
      "+++ b/src/b.ts",
      "@@ -1 +1 @@",
      "-x",
      "+y",
      "",
    ].join("\n");

    const sections = splitUnifiedDiffByFile(raw);
    expect(sections.size).toBe(2);
    expect(sections.get("src/a.ts")).toContain("-old");
    expect(sections.get("src/b.ts")).toContain("+y");
  });
});

describe("summarizeTouchedAreas", () => {
  it("counts files per directory, sorted descending by count", () => {
    const files: DiffFileChange[] = [
      { filePath: "src/payments/a.ts", status: "modified", additions: 1, deletions: 0, patchText: "", isBinary: false },
      { filePath: "src/payments/b.ts", status: "modified", additions: 1, deletions: 0, patchText: "", isBinary: false },
      { filePath: "src/auth/c.ts", status: "modified", additions: 1, deletions: 0, patchText: "", isBinary: false },
      { filePath: "README.md", status: "modified", additions: 1, deletions: 0, patchText: "", isBinary: false },
    ];
    const summary = summarizeTouchedAreas(files);
    expect(summary[0]).toEqual({ directory: "src/payments", fileCount: 2 });
    expect(summary.find((s) => s.directory === ".")).toEqual({ directory: ".", fileCount: 1 });
  });
});
