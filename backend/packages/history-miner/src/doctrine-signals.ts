import type { RawHistorySignal } from "@ratify/doctrine";
import { parseCodeowners } from "@ratify/github";
import { classifyDocumentPath, extractAdrFrontMatter } from "./document-extraction.js";
import { parseCommitConvention } from "./precedent-extraction.js";
import type { CommitInput, MergedPullRequestInput, MinedDocument } from "./types.js";

/**
 * Converts mined raw material (PRs, commits, docs, CODEOWNERS) into
 * `RawHistorySignal`s consumable by `@ratify/doctrine`'s
 * `mineDoctrineCandidates`. This is the bridge between "things we found
 * in repo history" and "structured doctrine evidence" — each signal
 * carries the concrete ref it came from so DoctrineSource stays linkable.
 */

export function signalsFromReviewComments(pr: MergedPullRequestInput): RawHistorySignal[] {
  return (pr.reviewComments ?? [])
    .map((c) => c.body.trim())
    .filter((body) => body.length > 12 && body.length < 400) // skip trivial/very long comments
    .map((body) => ({
      kind: "review-comment" as const,
      ref: pr.number !== undefined ? `pr#${pr.number}` : (pr.mergeCommitSha ?? "unknown"),
      text: body,
      scopeGlobs: [],
    }));
}

export function signalFromMergedPr(pr: MergedPullRequestInput): RawHistorySignal {
  return {
    kind: "merged-pr",
    ref: pr.number !== undefined ? `pr#${pr.number}` : (pr.mergeCommitSha ?? "unknown"),
    text: pr.title,
    scopeGlobs: [],
  };
}

export function signalFromCommit(commit: CommitInput): RawHistorySignal {
  const convention = parseCommitConvention(commit.message);
  return {
    kind: "commit-message",
    ref: commit.sha,
    text: convention.subject,
    scopeGlobs: [],
  };
}

export function signalsFromCodeowners(content: string): RawHistorySignal[] {
  const entries = parseCodeowners(content);
  return entries.map((entry) => ({
    kind: "codeowners" as const,
    ref: ".github/CODEOWNERS",
    text: `Changes under ${entry.pathGlob} require review from ${entry.owners.join(", ")}`,
    scopeGlobs: [entry.pathGlob],
  }));
}

export function signalFromDocument(doc: MinedDocument): RawHistorySignal | null {
  if (doc.kind === "ci-config") {
    return {
      kind: "ci-config",
      ref: doc.filePath,
      text: `CI enforces configuration defined in ${doc.filePath}`,
      scopeGlobs: [],
    };
  }
  if (doc.kind === "adr" || doc.kind === "rfc") {
    const frontMatter = extractAdrFrontMatter(doc.content);
    const status = frontMatter.status ? ` (status: ${frontMatter.status})` : "";
    return {
      kind: "adr",
      ref: doc.filePath,
      text: `${frontMatter.title ?? doc.title ?? doc.filePath}${status}`,
      scopeGlobs: [],
    };
  }
  if (doc.kind === "readme") {
    return { kind: "readme", ref: doc.filePath, text: firstMeaningfulLine(doc.content), scopeGlobs: [] };
  }
  if (doc.kind === "doc") {
    return { kind: "doc", ref: doc.filePath, text: doc.title ?? doc.filePath, scopeGlobs: [] };
  }
  return null;
}

function firstMeaningfulLine(content: string): string {
  const line = content
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("#"));
  return line ?? content.slice(0, 200);
}

/** Re-export so callers only need to depend on this package for classification. */
export { classifyDocumentPath };
