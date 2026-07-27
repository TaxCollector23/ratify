import type { RawHistorySignal } from "@ratify/doctrine";
import { buildMinedDocument } from "./document-extraction.js";
import { extractPrecedentFromCommit, extractPrecedentFromPullRequest } from "./precedent-extraction.js";
import {
  signalFromCommit,
  signalFromDocument,
  signalFromMergedPr,
  signalsFromCodeowners,
  signalsFromReviewComments,
} from "./doctrine-signals.js";
import type { CommitInput, MergedPullRequestInput, MineHistoryResult, MinedDocument } from "./types.js";

export interface MineHistoryInput {
  mergedPullRequests: MergedPullRequestInput[];
  commits: CommitInput[];
  /** (filePath, content, commitSha) tuples for candidate doc files already read off disk. */
  candidateDocuments: { filePath: string; content: string; commitSha: string }[];
  codeownersContent?: string | null;
}

/**
 * Pure orchestration: combines merged-PR history, commit history, and
 * on-disk documents into HistoricalPrecedent + DocumentArtifact candidates
 * plus RawHistorySignals for `@ratify/doctrine`'s inference pass. No I/O
 * here — callers (apps/worker) are responsible for reading files/PRs and
 * for persisting the result via HistoryMinerStore.
 */
export function mineHistory(input: MineHistoryInput): MineHistoryResult {
  const documents: MinedDocument[] = [];
  for (const candidate of input.candidateDocuments) {
    const doc = buildMinedDocument(candidate.filePath, candidate.content, candidate.commitSha);
    if (doc) documents.push(doc);
  }

  const precedents = [
    ...input.mergedPullRequests.map(extractPrecedentFromPullRequest),
    ...input.commits.map(extractPrecedentFromCommit),
  ];

  const doctrineSignals: RawHistorySignal[] = [
    ...input.mergedPullRequests.map(signalFromMergedPr),
    ...input.mergedPullRequests.flatMap(signalsFromReviewComments),
    ...input.commits.map(signalFromCommit),
    ...documents.map(signalFromDocument).filter((s): s is RawHistorySignal => s !== null),
    ...(input.codeownersContent ? signalsFromCodeowners(input.codeownersContent) : []),
  ];

  return { documents, precedents, doctrineSignals };
}
