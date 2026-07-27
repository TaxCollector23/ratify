import { simpleGit } from "simple-git";
import type { DiffFileChange, RepoDiffResult } from "./types.js";

/**
 * Computes the merge-base between two refs and the file-level diff
 * (status + hunks) between merge-base and headRef. This mirrors what
 * GitHub's compare API returns but works against a purely local clone,
 * so PR analysis doesn't require live GitHub API access to keep working
 * (see backend/ASSUMPTIONS.md).
 */
export async function diffAgainstMergeBase(
  workingDirectory: string,
  baseRef: string,
  headRef: string,
): Promise<RepoDiffResult> {
  const git = simpleGit(workingDirectory);

  let mergeBaseSha: string | null = null;
  try {
    mergeBaseSha = (await git.raw(["merge-base", baseRef, headRef])).trim();
  } catch {
    mergeBaseSha = null;
  }

  const diffBase = mergeBaseSha ?? baseRef;
  const rawNumstat = await git.raw(["diff", "--numstat", "-M", "-C", `${diffBase}..${headRef}`]);
  const rawNameStatus = await git.raw(["diff", "--name-status", "-M", "-C", `${diffBase}..${headRef}`]);
  const rawPatch = await git.raw(["diff", "-M", "-C", `${diffBase}..${headRef}`]);

  const headSha = (await git.revparse([headRef])).trim();
  const baseSha = (await git.revparse([diffBase])).trim();

  const statusByPath = parseNameStatus(rawNameStatus);
  const files = parseNumstat(rawNumstat, statusByPath);
  const patchByPath = splitUnifiedDiffByFile(rawPatch);

  for (const file of files) {
    file.patchText = patchByPath.get(file.filePath) ?? patchByPath.get(file.previousFilePath ?? "") ?? "";
  }

  return {
    baseSha,
    headSha,
    mergeBaseSha,
    files,
    touchedAreaSummary: summarizeTouchedAreas(files),
  };
}

/** Parses `git diff --name-status -M -C` output into a status/rename map keyed by new path. */
export function parseNameStatus(raw: string): Map<string, { status: DiffFileChange["status"]; previousFilePath?: string }> {
  const result = new Map<string, { status: DiffFileChange["status"]; previousFilePath?: string }>();
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const code = parts[0] ?? "";
    if (code.startsWith("R")) {
      const [, oldPath, newPath] = parts;
      if (newPath && oldPath) result.set(newPath, { status: "renamed", previousFilePath: oldPath });
    } else if (code.startsWith("C")) {
      const [, oldPath, newPath] = parts;
      if (newPath && oldPath) result.set(newPath, { status: "copied", previousFilePath: oldPath });
    } else {
      const [, path] = parts;
      if (!path) continue;
      const status = code === "A" ? "added" : code === "D" ? "removed" : "modified";
      result.set(path, { status });
    }
  }
  return result;
}

/** Parses `git diff --numstat -M -C` output (additions/deletions per file, "-" for binary). */
export function parseNumstat(
  raw: string,
  statusByPath: Map<string, { status: DiffFileChange["status"]; previousFilePath?: string }>,
): DiffFileChange[] {
  const files: DiffFileChange[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const additionsRaw = parts[0] ?? "0";
    const deletionsRaw = parts[1] ?? "0";
    const pathField = parts[2] ?? "";

    const isBinary = additionsRaw === "-" || deletionsRaw === "-";
    // numstat renders renames as "old => new" or "{old => new}/path" — normalize to the new path.
    const { newPath, oldPath } = splitRenamePath(pathField);

    const statusEntry = statusByPath.get(newPath);
    files.push({
      filePath: newPath,
      previousFilePath: statusEntry?.previousFilePath ?? oldPath,
      status: statusEntry?.status ?? (oldPath ? "renamed" : "modified"),
      additions: isBinary ? 0 : Number(additionsRaw),
      deletions: isBinary ? 0 : Number(deletionsRaw),
      patchText: "",
      isBinary,
    });
  }
  return files;
}

function splitRenamePath(pathField: string): { newPath: string; oldPath?: string } {
  const braceMatch = pathField.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
  if (braceMatch) {
    const [, prefix, oldSeg, newSeg, suffix] = braceMatch;
    return { oldPath: `${prefix}${oldSeg}${suffix}`, newPath: `${prefix}${newSeg}${suffix}` };
  }
  const arrowMatch = pathField.match(/^(.*) => (.*)$/);
  if (arrowMatch) {
    const [, oldPath, newPath] = arrowMatch;
    return { oldPath, newPath: newPath ?? pathField };
  }
  return { newPath: pathField };
}

/** Splits a full unified diff into per-file patch text, keyed by the file's new path. */
export function splitUnifiedDiffByFile(rawPatch: string): Map<string, string> {
  const result = new Map<string, string>();
  const sections = rawPatch.split(/(?=^diff --git )/m).filter(Boolean);
  for (const section of sections) {
    const headerMatch = section.match(/^diff --git a\/(.+?) b\/(.+?)\n/);
    if (!headerMatch) continue;
    const newPath = headerMatch[2] ?? headerMatch[1];
    if (newPath) result.set(newPath, section.trim());
  }
  return result;
}

/** Cheap "blast radius" summary — directories touched, ordered by file count descending. */
export function summarizeTouchedAreas(files: DiffFileChange[]): { directory: string; fileCount: number }[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const dir = directoryOf(file.filePath);
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([directory, fileCount]) => ({ directory, fileCount }))
    .sort((a, b) => b.fileCount - a.fileCount || a.directory.localeCompare(b.directory));
}

function directoryOf(filePath: string): string {
  const idx = filePath.lastIndexOf("/");
  return idx === -1 ? "." : filePath.slice(0, idx);
}
