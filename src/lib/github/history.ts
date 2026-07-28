interface GhSearchPr {
  number: number;
  title: string;
  html_url: string;
  merged_at: string | null;
  user: { login: string };
}

interface GhReviewComment {
  body: string;
  user: { login: string };
  path?: string;
  html_url: string;
}

async function api<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub ${path}: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

/** Fetches the N most recent merged PRs on the default branch. */
export async function fetchRecentMergedPrs(
  token: string,
  owner: string,
  repo: string,
  limit: number,
): Promise<GhSearchPr[]> {
  // GET /repos/{owner}/{repo}/pulls?state=closed&sort=updated&direction=desc
  const list = await api<GhSearchPr[]>(
    `/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${limit}`,
    token,
  );
  return list.filter((pr) => pr.merged_at !== null).slice(0, limit);
}

/** Fetches review comments (line-level) on a PR. */
export async function fetchPrReviewComments(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<GhReviewComment[]> {
  return api<GhReviewComment[]>(
    `/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=100`,
    token,
  );
}

/** Fetches issue-level (top-level) comments on a PR. */
export async function fetchPrIssueComments(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<{ body: string; user: { login: string } }[]> {
  return api<{ body: string; user: { login: string } }[]>(
    `/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=50`,
    token,
  );
}
