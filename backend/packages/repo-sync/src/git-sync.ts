import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";
import type { RepoSyncOptions, RepoSyncResult } from "./types.js";

/**
 * Clones (or fast-forward updates) a git working copy on local disk.
 * Idempotent: re-running against an existing cacheKey directory reuses
 * the repository and just fetches + checks out the requested ref, which
 * is both faster and network-cheaper than a fresh clone every time.
 */
export async function syncRepository(options: RepoSyncOptions): Promise<RepoSyncResult> {
  const { cloneUrl, workDir, cacheKey, shallow = true, depth = 1 } = options;
  const ref = options.ref ?? "HEAD";

  const repoPath = join(workDir, sanitizeCacheKey(cacheKey));
  await mkdir(workDir, { recursive: true });

  const alreadyCloned = await pathExists(join(repoPath, ".git"));
  const git: SimpleGit = simpleGit();

  if (!alreadyCloned) {
    const cloneArgs = shallow ? ["--depth", String(depth), "--no-single-branch"] : [];
    await git.clone(cloneUrl, repoPath, cloneArgs);
  }

  const repoGit = simpleGit(repoPath);

  // Always fetch the specific ref so subsequent checkout works whether ref is a branch,
  // tag, or bare SHA, without needing to know in advance which kind it is.
  await repoGit.fetch(["origin", ref, "--force"]).catch(async () => {
    // ref might already be a local SHA reachable via a shallow history; fall back to a full fetch.
    await repoGit.fetch(["origin"]).catch(() => undefined);
  });

  await repoGit.checkout(["FETCH_HEAD"]).catch(async () => {
    await repoGit.checkout([ref]);
  });

  const resolvedSha = (await repoGit.revparse(["HEAD"])).trim();
  const filePaths = await listTrackedFiles(repoGit);
  const { sizeBytes, contentHash } = await hashTree(repoPath, filePaths);

  return {
    workingDirectory: repoPath,
    commitSha: resolvedSha,
    ref,
    isShallow: shallow,
    filePaths,
    sizeBytes,
    contentHash,
  };
}

/** Lists all git-tracked files (relative paths) in the current checkout. */
async function listTrackedFiles(git: SimpleGit): Promise<string[]> {
  const raw = await git.raw(["ls-files"]);
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Public helper: lists tracked files for an already-synced working directory (no clone/fetch performed). */
export async function listTrackedFilesInWorkingDirectory(workingDirectory: string): Promise<string[]> {
  return listTrackedFiles(simpleGit(workingDirectory));
}

export interface WorkingDirectoryCommit {
  sha: string;
  message: string;
  touchedFilePaths: string[];
}

/**
 * Lists recent commits (with per-commit touched-file paths) from an
 * already-synced working directory. Used by history-mine to build commit
 * precedents/doctrine signals purely from local git log, without needing
 * live GitHub API access.
 */
export async function listRecentCommits(
  workingDirectory: string,
  options: { maxCount?: number; sinceCommitSha?: string } = {},
): Promise<WorkingDirectoryCommit[]> {
  const { maxCount = 200, sinceCommitSha } = options;
  const git = simpleGit(workingDirectory);

  try {
    const log = await git.log({
      maxCount,
      from: sinceCommitSha,
    });

    const commits: WorkingDirectoryCommit[] = [];
    for (const entry of log.all) {
      const nameOnly = await git.raw(["show", "--name-only", "--pretty=format:", entry.hash]).catch(() => "");
      const touchedFilePaths = nameOnly
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      commits.push({ sha: entry.hash, message: entry.message, touchedFilePaths });
    }
    return commits;
  } catch {
    return [];
  }
}

/**
 * Content-addressed hash of the working tree: sha256 over the sorted list
 * of (path, per-file sha256) pairs. Deterministic regardless of filesystem
 * mtimes, so identical tree states always produce identical snapshot hashes
 * — this is what RepositorySnapshot.contentHash is keyed on.
 */
async function hashTree(repoPath: string, filePaths: string[]): Promise<{ sizeBytes: number; contentHash: string }> {
  const treeHash = createHash("sha256");
  let sizeBytes = 0;

  const sortedPaths = [...filePaths].sort();
  for (const relPath of sortedPaths) {
    const absPath = join(repoPath, relPath);
    try {
      const buf = await readFile(absPath);
      sizeBytes += buf.byteLength;
      const fileHash = createHash("sha256").update(buf).digest("hex");
      treeHash.update(`${relPath}:${fileHash}\n`);
    } catch {
      // File may have been a submodule pointer or got removed between ls-files and read; skip.
      continue;
    }
  }

  return { sizeBytes, contentHash: `sha256:${treeHash.digest("hex")}` };
}

function sanitizeCacheKey(cacheKey: string): string {
  return cacheKey.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Reads file content relative to a synced working directory. Used by parser/history-miner stages. */
export async function readWorkingTreeFile(workingDirectory: string, relPath: string): Promise<string | null> {
  try {
    return await readFile(join(workingDirectory, relPath), "utf-8");
  } catch {
    return null;
  }
}

/** Reads a file's content as of a specific ref/commit (not necessarily the current checkout), via `git show`. */
export async function readFileAtRef(workingDirectory: string, relPath: string, ref: string): Promise<string | null> {
  try {
    return await simpleGit(workingDirectory).show([`${ref}:${relPath}`]);
  } catch {
    return null;
  }
}

export function toAbsolutePath(workingDirectory: string, relPath: string): string {
  return join(workingDirectory, relPath);
}

export function toRelativePath(workingDirectory: string, absPath: string): string {
  return relative(workingDirectory, absPath);
}
