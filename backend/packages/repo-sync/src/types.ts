/**
 * Types for the repo-sync package: cloning/updating a git working copy,
 * computing merge-base + diffs between two refs, and producing a
 * content-addressed snapshot description that repo.parse / repo.graph_build
 * consume.
 */

export interface RepoSyncOptions {
  /** Absolute or https clone URL (e.g. GitHub App installation token URL). */
  cloneUrl: string;
  /** Ref to sync to (branch name, tag, or SHA). Defaults to the remote HEAD. */
  ref?: string;
  /** Root directory under which per-repository working copies are cached. */
  workDir: string;
  /** Stable cache key for the working copy directory, e.g. `${owner}/${repo}`. */
  cacheKey: string;
  /** Shallow clone (depth=1) for fast indexing; set false for history-mining flows that need full log. */
  shallow?: boolean;
  /** Depth to use for a shallow clone. Ignored when shallow is false. */
  depth?: number;
}

export interface RepoSyncResult {
  /** Absolute path to the synced working directory on local disk. */
  workingDirectory: string;
  /** Resolved commit SHA the working directory now points at. */
  commitSha: string;
  /** Ref that was requested (branch/tag/sha), echoed back for traceability. */
  ref: string;
  /** Whether the sync was a shallow clone. */
  isShallow: boolean;
  /** All tracked file paths in the working tree at commitSha (relative to repo root). */
  filePaths: string[];
  /** Total on-disk size of tracked files, in bytes. */
  sizeBytes: number;
  /** Content-addressed hash of the full tree state (see hashTree). */
  contentHash: string;
}

export interface DiffFileChange {
  filePath: string;
  previousFilePath?: string;
  status: "added" | "modified" | "removed" | "renamed" | "copied";
  additions: number;
  deletions: number;
  patchText: string;
  isBinary: boolean;
}

export interface RepoDiffResult {
  baseSha: string;
  headSha: string;
  mergeBaseSha: string | null;
  files: DiffFileChange[];
  /** Directories touched, most-common-first — cheap "blast radius" summary for downstream context. */
  touchedAreaSummary: { directory: string; fileCount: number }[];
}
