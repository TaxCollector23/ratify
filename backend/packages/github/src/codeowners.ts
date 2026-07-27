export interface CodeownersEntry {
  pathGlob: string;
  owners: string[];
}

/** Parses CODEOWNERS file syntax (GitHub's format) into structured entries. */
export function parseCodeowners(content: string): CodeownersEntry[] {
  const entries: CodeownersEntry[] = [];
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const pathGlob = parts[0];
    const owners = parts.slice(1);
    if (pathGlob && owners.length > 0) {
      entries.push({ pathGlob: normalizeGlob(pathGlob), owners });
    }
  }
  return entries;
}

function normalizeGlob(pattern: string): string {
  const unrooted = pattern.startsWith("/") ? pattern.slice(1) : pattern;
  // CODEOWNERS treats a trailing "/" as "everything under this directory"
  if (unrooted.endsWith("/")) return `${unrooted}**`;
  if (!unrooted.includes("*") && !unrooted.includes(".")) return `${unrooted}/**`;
  return unrooted;
}
