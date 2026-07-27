import type { schema } from "@ratify/db";
import type { RawHistorySignal } from "@ratify/doctrine";

export type DocumentArtifactKind = (typeof schema.documentArtifactKindEnum.enumValues)[number];

/** A document discovered on disk during history mining, before it is persisted. */
export interface MinedDocument {
  filePath: string;
  kind: DocumentArtifactKind;
  title: string | null;
  content: string;
  commitSha: string;
}

export type HistoricalPrecedentOutcome = "approved-with-changes" | "rejected" | "exception-granted" | "merged" | null;

/** A precedent discovered from a merged PR, before it is persisted. */
export interface MinedPrecedent {
  title: string;
  summary: string;
  sourcePrNumber?: string;
  sourceCommitSha?: string;
  relatedPathGlobs: string[];
  outcome: HistoricalPrecedentOutcome;
  tags: string[];
}

/** Minimal shape of a merged PR as consumed by the miner (works from either GitHub API or local git log). */
export interface MergedPullRequestInput {
  number?: number;
  title: string;
  body?: string | null;
  mergeCommitSha?: string | null;
  mergedAt?: string | null;
  touchedFilePaths: string[];
  reviewComments?: { body: string }[];
  labels?: string[];
}

/** Minimal shape of a commit as consumed by the miner. */
export interface CommitInput {
  sha: string;
  message: string;
  touchedFilePaths: string[];
}

export interface MineHistoryResult {
  documents: MinedDocument[];
  precedents: MinedPrecedent[];
  doctrineSignals: RawHistorySignal[];
}
