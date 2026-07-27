import type { Octokit } from "@octokit/rest";

export interface PullRequestDiffSummary {
  headSha: string;
  baseSha: string;
  mergeBaseSha: string | null;
  files: {
    filename: string;
    previousFilename?: string;
    status: "added" | "modified" | "removed" | "renamed" | "copied" | "changed" | "unchanged";
    additions: number;
    deletions: number;
    patch?: string;
  }[];
}

/**
 * Higher-level GitHub read operations used by repository-sync and
 * history-miner, wrapping raw Octokit calls with the shapes Ratify needs.
 * All calls are scoped to a single installation-authenticated Octokit
 * instance (see app-auth.ts) — never a repo-unscoped PAT.
 */
export class GitHubApiClient {
  constructor(private readonly octokit: Octokit) {}

  async getPullRequestDiff(owner: string, repo: string, pullNumber: number): Promise<PullRequestDiffSummary> {
    const [pr, files] = await Promise.all([
      this.octokit.pulls.get({ owner, repo, pull_number: pullNumber }),
      this.octokit.paginate(this.octokit.pulls.listFiles, { owner, repo, pull_number: pullNumber, per_page: 100 }),
    ]);

    return {
      headSha: pr.data.head.sha,
      baseSha: pr.data.base.sha,
      mergeBaseSha: pr.data.merge_commit_sha ?? null,
      files: files.map((f) => ({
        filename: f.filename,
        previousFilename: f.previous_filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      })),
    };
  }

  async getFileContent(owner: string, repo: string, path: string, ref: string): Promise<string | null> {
    try {
      const res = await this.octokit.repos.getContent({ owner, repo, path, ref });
      if (!Array.isArray(res.data) && res.data.type === "file" && res.data.content) {
        return Buffer.from(res.data.content, res.data.encoding as BufferEncoding).toString("utf-8");
      }
      return null;
    } catch {
      return null;
    }
  }

  async listMergedPullRequests(owner: string, repo: string, since?: string) {
    const results = await this.octokit.paginate(this.octokit.pulls.list, {
      owner,
      repo,
      state: "closed",
      sort: "updated",
      direction: "desc",
      per_page: 100,
    });
    return results.filter((pr) => pr.merged_at && (!since || pr.merged_at > since));
  }

  async listReviewComments(owner: string, repo: string, pullNumber: number) {
    return this.octokit.paginate(this.octokit.pulls.listReviewComments, {
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    });
  }

  async getCodeownersFile(owner: string, repo: string, ref: string): Promise<string | null> {
    for (const path of [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"]) {
      const content = await this.getFileContent(owner, repo, path, ref);
      if (content) return content;
    }
    return null;
  }
}
