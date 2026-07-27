import { z } from "zod";
import { EvidencePointerSchema, SeverityEnum } from "@ratify/shared";
import type { SymbolTable } from "@ratify/parser";

export const PolicyFindingSchema = z.object({
  ruleKey: z.string(),
  title: z.string(),
  description: z.string(),
  severity: SeverityEnum,
  confidence: z.number().min(0).max(1),
  filePath: z.string().optional(),
  lineStart: z.number().int().optional(),
  lineEnd: z.number().int().optional(),
  evidence: z.array(EvidencePointerSchema),
  remediation: z.string().optional(),
});
export type PolicyFinding = z.infer<typeof PolicyFindingSchema>;

/** A single file change as seen by the policy engine (diff-level facts only). */
export interface PolicyFileChange {
  filePath: string;
  previousFilePath?: string;
  status: "added" | "modified" | "removed" | "renamed" | "copied";
  additions: number;
  deletions: number;
  patchText?: string; // unified diff hunk text, when available
  isBinary: boolean;
  /** Symbol table for the file's new content, if it's a parseable language. */
  newSymbolTable?: SymbolTable | null;
  /** Symbol table for the file's old content (base ref), for API-diffing. */
  oldSymbolTable?: SymbolTable | null;
}

export interface PolicyCheckContext {
  orgId: string;
  repositoryId: string;
  pullRequestId: string;
  fileChanges: PolicyFileChange[];
  /** Raw text content of package.json at base and head, if changed. */
  packageJsonDiff?: { base: string | null; head: string | null };
  codeowners?: CodeownersEntry[];
  config: PolicyEngineConfig;
}

export interface CodeownersEntry {
  pathGlob: string;
  owners: string[];
}

export interface PolicyEngineConfig {
  sensitivePathGlobs: string[];
  paymentsPathGlobs: string[];
  requiredTestGlobsFor: (sourceGlob: string) => string[];
}

export type PolicyRule = (ctx: PolicyCheckContext) => PolicyFinding[] | Promise<PolicyFinding[]>;

export const DEFAULT_POLICY_CONFIG: PolicyEngineConfig = {
  sensitivePathGlobs: [
    "**/auth/**",
    "**/security/**",
    "**/*secret*",
    "**/*credential*",
    "**/infra/**",
    "**/migrations/**",
    "**/.github/workflows/**",
  ],
  paymentsPathGlobs: ["**/payments/**", "**/billing/**", "**/checkout/**", "**/*payment*"],
  requiredTestGlobsFor: (sourceGlob: string) => {
    // naive convention: src/foo/bar.ts -> test/foo/bar.test.ts or __tests__ sibling
    return [sourceGlob.replace(/\.(ts|tsx|js|jsx)$/, ".test.$1"), sourceGlob.replace(/\.(ts|tsx|js|jsx)$/, ".spec.$1")];
  },
};
