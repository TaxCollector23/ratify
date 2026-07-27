import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY_CONFIG, type PolicyCheckContext, type PolicyFileChange } from "../types.js";
import { missingTestsForPaymentsPaths } from "./missing-tests-for-payments-paths.js";
import { dependencyChangeDetection } from "./dependency-change-detection.js";
import { breakingApiChangeHeuristic } from "./breaking-api-change.js";
import { sensitiveAreaModification } from "./sensitive-area-modification.js";
import { todoDebugCodeDetection } from "./todo-debug-code.js";
import { codeownersBoundaryViolation } from "./codeowners-boundary-violation.js";
import type { SymbolTable } from "@ratify/parser";

function baseCtx(overrides: Partial<PolicyCheckContext> = {}): PolicyCheckContext {
  return {
    orgId: "org-1",
    repositoryId: "repo-1",
    pullRequestId: "pr-1",
    fileChanges: [],
    config: DEFAULT_POLICY_CONFIG,
    ...overrides,
  };
}

function fileChange(overrides: Partial<PolicyFileChange>): PolicyFileChange {
  return {
    filePath: "src/index.ts",
    status: "modified",
    additions: 1,
    deletions: 0,
    isBinary: false,
    ...overrides,
  };
}

describe("missingTestsForPaymentsPaths", () => {
  it("flags payments source changes without matching test changes", () => {
    const ctx = baseCtx({
      fileChanges: [fileChange({ filePath: "src/payments/charge.ts" })],
    });
    const findings = missingTestsForPaymentsPaths(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleKey).toBe("missing-tests-for-payments-paths");
    expect(findings[0]?.severity).toBe("high");
  });

  it("does not flag when a matching test file is also changed", () => {
    const ctx = baseCtx({
      fileChanges: [
        fileChange({ filePath: "src/payments/charge.ts" }),
        fileChange({ filePath: "src/payments/charge.test.ts" }),
      ],
    });
    expect(missingTestsForPaymentsPaths(ctx)).toHaveLength(0);
  });
});

describe("dependencyChangeDetection", () => {
  it("detects added, removed, and major version bumps", () => {
    const ctx = baseCtx({
      packageJsonDiff: {
        base: JSON.stringify({ dependencies: { left: "1.0.0", removeMe: "2.0.0" } }),
        head: JSON.stringify({ dependencies: { left: "2.0.0", newDep: "1.0.0" } }),
      },
    });
    const findings = dependencyChangeDetection(ctx);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.severity).toBe("medium"); // major bump left 1.x -> 2.x
  });

  it("returns nothing when package.json diff is absent", () => {
    expect(dependencyChangeDetection(baseCtx())).toHaveLength(0);
  });
});

describe("breakingApiChangeHeuristic", () => {
  const emptyTable = (): SymbolTable => ({
    filePath: "src/api.ts",
    language: "typescript",
    symbols: [],
    imports: [],
    exports: [],
    publicApiSurface: [],
    parseErrors: [],
    hasSyntaxError: false,
  });

  it("flags a removed export", () => {
    const oldTable = emptyTable();
    oldTable.symbols.push({
      kind: "function",
      name: "doThing",
      qualifiedName: "doThing",
      range: { startLine: 1, startColumn: 0, endLine: 3, endColumn: 1 },
      isExported: true,
      complexity: { cyclomatic: 1, maxNestingDepth: 0, lineCount: 3 },
    });
    const newTable = emptyTable();

    const ctx = baseCtx({
      fileChanges: [
        fileChange({ filePath: "src/api.ts", oldSymbolTable: oldTable, newSymbolTable: newTable }),
      ],
    });

    const findings = breakingApiChangeHeuristic(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("critical");
  });
});

describe("sensitiveAreaModification", () => {
  it("flags files under sensitive globs", () => {
    const ctx = baseCtx({ fileChanges: [fileChange({ filePath: "src/auth/login.ts" })] });
    const findings = sensitiveAreaModification(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("high");
  });
});

describe("todoDebugCodeDetection", () => {
  it("finds TODO and console.log in added lines only", () => {
    const patch = [
      "@@ -1,2 +1,4 @@",
      " unchanged line",
      "+// TODO: fix this later",
      "+console.log('debug')",
      "-removed line",
    ].join("\n");

    const ctx = baseCtx({ fileChanges: [fileChange({ filePath: "src/x.ts", patchText: patch })] });
    const findings = todoDebugCodeDetection(ctx);
    expect(findings.some((f) => f.title.includes("TODO"))).toBe(true);
    expect(findings.some((f) => f.title.includes("Debug"))).toBe(true);
  });
});

describe("codeownersBoundaryViolation", () => {
  it("flags unowned changed files", () => {
    const ctx = baseCtx({
      fileChanges: [fileChange({ filePath: "src/unowned/thing.ts" })],
      codeowners: [{ pathGlob: "src/owned/**", owners: ["@team-a"] }],
    });
    const findings = codeownersBoundaryViolation(ctx);
    expect(findings.some((f) => f.title.includes("no CODEOWNERS"))).toBe(true);
  });

  it("flags cross-boundary PRs spanning multiple owner groups", () => {
    const ctx = baseCtx({
      fileChanges: [fileChange({ filePath: "src/a/x.ts" }), fileChange({ filePath: "src/b/y.ts" })],
      codeowners: [
        { pathGlob: "src/a/**", owners: ["@team-a"] },
        { pathGlob: "src/b/**", owners: ["@team-b"] },
      ],
    });
    const findings = codeownersBoundaryViolation(ctx);
    expect(findings.some((f) => f.title.includes("multiple ownership boundaries"))).toBe(true);
  });
});
