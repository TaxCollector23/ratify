import type { Database } from "@ratify/db";
import { schema } from "@ratify/db";
import { and, eq } from "drizzle-orm";
import { getDefaultParserRegistry } from "@ratify/parser";
import { diffAgainstMergeBase, readFileAtRef, readWorkingTreeFile } from "@ratify/repo-sync";
import { parseCodeowners } from "@ratify/github";
import type { PolicyCheckContext, PolicyFileChange, CodeownersEntry, PolicyEngineConfig } from "@ratify/policy-engine";
import { RatifyError } from "@ratify/shared";
import { localWorkingDirectoryFor } from "./snapshot.js";

/**
 * Shared context assembly used by both pr.policy_check (to build
 * PolicyCheckContext) and pr.context_retrieve/pr.llm_reason (which need
 * the same touched-file list + diff). Kept in one place so all PR-analysis
 * stages agree on exactly which files/refs are in scope for a given
 * ReviewSession, rather than re-deriving it inconsistently per stage.
 */
export interface AssembledPullRequestContext {
  workingDirectory: string;
  touchedFilePaths: string[];
  fileChanges: PolicyFileChange[];
  codeownersEntries: CodeownersEntry[];
  packageJsonDiff: { base: string | null; head: string | null } | undefined;
  baseSha: string;
  headSha: string;
  mergeBaseSha: string | null;
}

export async function assemblePullRequestContext(
  db: Database,
  repositoryId: string,
  pullRequestId: string,
): Promise<AssembledPullRequestContext> {
  const repository = await db.query.repositories.findFirst({ where: eq(schema.repositories.id, repositoryId) });
  if (!repository) throw new RatifyError({ code: "NOT_FOUND", message: `Repository ${repositoryId} not found` });

  const pullRequest = await db.query.pullRequests.findFirst({ where: eq(schema.pullRequests.id, pullRequestId) });
  if (!pullRequest) throw new RatifyError({ code: "NOT_FOUND", message: `Pull request ${pullRequestId} not found` });

  const snapshot = await db.query.repositorySnapshots.findFirst({
    where: and(eq(schema.repositorySnapshots.repositoryId, repositoryId), eq(schema.repositorySnapshots.syncStatus, "ready")),
    orderBy: (t, { desc }) => desc(t.createdAt),
  });
  if (!snapshot) {
    throw new RatifyError({ code: "NOT_FOUND", message: `No ready snapshot for repository ${repositoryId}; run repo.sync first` });
  }

  const workingDirectory = localWorkingDirectoryFor(snapshot.objectStorageKey);
  const diff = await diffAgainstMergeBase(workingDirectory, pullRequest.baseRef, pullRequest.headSha);

  const registry = getDefaultParserRegistry();
  const fileChanges: PolicyFileChange[] = [];

  for (const file of diff.files) {
    let newSymbolTable = null;
    let oldSymbolTable = null;
    if (!file.isBinary && registry.pluginFor(file.filePath) && file.status !== "removed") {
      const newContent = await readWorkingTreeFile(workingDirectory, file.filePath);
      if (newContent !== null) newSymbolTable = await registry.parseFile(file.filePath, newContent);
    }

    fileChanges.push({
      filePath: file.filePath,
      previousFilePath: file.previousFilePath,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      patchText: file.patchText,
      isBinary: file.isBinary,
      newSymbolTable,
      oldSymbolTable,
    });
  }

  const codeownersContent = await readWorkingTreeFile(workingDirectory, ".github/CODEOWNERS");
  const codeownersEntries = codeownersContent ? parseCodeowners(codeownersContent) : [];

  const packageJsonChanged = diff.files.some((f) => f.filePath === "package.json");
  const packageJsonDiff = packageJsonChanged
    ? {
        head: await readWorkingTreeFile(workingDirectory, "package.json"),
        base: await readFileAtRef(workingDirectory, "package.json", diff.mergeBaseSha ?? diff.baseSha),
      }
    : undefined;

  return {
    workingDirectory,
    touchedFilePaths: diff.files.map((f) => f.filePath),
    fileChanges,
    codeownersEntries,
    packageJsonDiff,
    baseSha: diff.baseSha,
    headSha: diff.headSha,
    mergeBaseSha: diff.mergeBaseSha,
  };
}

export function buildPolicyCheckContext(
  orgId: string,
  repositoryId: string,
  pullRequestId: string,
  assembled: AssembledPullRequestContext,
  config: PolicyEngineConfig,
): PolicyCheckContext {
  return {
    orgId,
    repositoryId,
    pullRequestId,
    fileChanges: assembled.fileChanges,
    packageJsonDiff: assembled.packageJsonDiff,
    codeowners: assembled.codeownersEntries,
    config,
  };
}
