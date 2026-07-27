import type { CommitInput, MergedPullRequestInput, MinedPrecedent } from "./types.js";

/**
 * Conventional-commit-style prefixes we recognize for tagging precedents
 * and doctrine signals (e.g. "revert:" is a strong negative-precedent
 * signal, "feat!:"/"BREAKING CHANGE" flags breaking-change precedents).
 */
const CONVENTIONAL_COMMIT_RE = /^(?<type>\w+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s*(?<subject>.+)$/;

export interface CommitConvention {
  type: string | null;
  scope: string | null;
  isBreaking: boolean;
  subject: string;
}

/** Parses a commit message's first line for Conventional Commits structure, if present. */
export function parseCommitConvention(message: string): CommitConvention {
  const firstLine = message.split("\n")[0]?.trim() ?? "";
  const match = firstLine.match(CONVENTIONAL_COMMIT_RE);
  const isBreakingTrailer = /BREAKING[ -]CHANGE/i.test(message);

  if (!match?.groups) {
    return { type: null, scope: null, isBreaking: isBreakingTrailer, subject: firstLine };
  }

  return {
    type: match.groups.type?.toLowerCase() ?? null,
    scope: match.groups.scope ?? null,
    isBreaking: Boolean(match.groups.breaking) || isBreakingTrailer,
    subject: match.groups.subject ?? firstLine,
  };
}

/** Derives glob patterns representative of an area from a list of touched file paths (top-level dirs, capped). */
export function pathsToGlobs(paths: string[]): string[] {
  const dirs = new Set<string>();
  for (const path of paths) {
    const parts = path.split("/");
    if (parts.length > 1) {
      dirs.add(`${parts.slice(0, Math.min(2, parts.length - 1)).join("/")}/**`);
    } else {
      dirs.add(path);
    }
  }
  return [...dirs].slice(0, 20);
}

const OUTCOME_KEYWORDS: { pattern: RegExp; outcome: MinedPrecedent["outcome"] }[] = [
  { pattern: /\brevert(ed|s)?\b/i, outcome: "rejected" },
  { pattern: /\bexception\b|\bgranted\b|\bwaiver\b/i, outcome: "exception-granted" },
  { pattern: /\brequested changes?\b|\bchanges? requested\b/i, outcome: "approved-with-changes" },
];

function inferOutcome(text: string): MinedPrecedent["outcome"] {
  for (const { pattern, outcome } of OUTCOME_KEYWORDS) {
    if (pattern.test(text)) return outcome;
  }
  return "merged";
}

/**
 * Turns a merged pull request into a HistoricalPrecedent candidate.
 * Precedents are the concrete "what happened last time" evidence used by
 * both doctrine inference and the LLM reasoner's context.
 */
export function extractPrecedentFromPullRequest(pr: MergedPullRequestInput): MinedPrecedent {
  const commentsText = (pr.reviewComments ?? []).map((c) => c.body).join(" \n ");
  const combinedText = [pr.title, pr.body ?? "", commentsText].join(" \n ");

  return {
    title: pr.title,
    summary: summarize(pr.body ?? pr.title, 500),
    sourcePrNumber: pr.number !== undefined ? String(pr.number) : undefined,
    sourceCommitSha: pr.mergeCommitSha ?? undefined,
    relatedPathGlobs: pathsToGlobs(pr.touchedFilePaths),
    outcome: inferOutcome(combinedText),
    tags: dedupe([...(pr.labels ?? []), ...inferTagsFromText(combinedText)]),
  };
}

/** Turns a commit into a lightweight precedent, used when PR metadata isn't available (pure git history). */
export function extractPrecedentFromCommit(commit: CommitInput): MinedPrecedent {
  const convention = parseCommitConvention(commit.message);
  const tags = dedupe([convention.type, convention.scope, convention.isBreaking ? "breaking-change" : null].filter(
    (t): t is string => Boolean(t),
  ));

  return {
    title: convention.subject || commit.message.split("\n")[0] || commit.sha,
    summary: summarize(commit.message, 500),
    sourceCommitSha: commit.sha,
    relatedPathGlobs: pathsToGlobs(commit.touchedFilePaths),
    outcome: convention.type === "revert" ? "rejected" : convention.isBreaking ? "merged" : "merged",
    tags,
  };
}

function inferTagsFromText(text: string): string[] {
  const tags: string[] = [];
  if (/\bbreaking change\b/i.test(text)) tags.push("breaking-change");
  if (/\bsecurity\b/i.test(text)) tags.push("security");
  if (/\bmigration\b/i.test(text)) tags.push("migration");
  if (/\bperformance\b|\bperf\b/i.test(text)) tags.push("performance");
  return tags;
}

function summarize(text: string, maxLen: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen - 1)}…` : trimmed;
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}
