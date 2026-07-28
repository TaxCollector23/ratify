interface PullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

async function githubApi(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res;
}

export async function getPullRequestFiles(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestFile[]> {
  const res = await githubApi(`/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`, token);
  return res.json();
}

export async function createCheckRun(
  token: string,
  owner: string,
  repo: string,
  headSha: string,
  params: {
    conclusion: "success" | "neutral" | "failure";
    title: string;
    summary: string;
    text: string;
  },
) {
  const res = await githubApi(`/repos/${owner}/${repo}/check-runs`, token, {
    method: "POST",
    body: JSON.stringify({
      name: "Ratify",
      head_sha: headSha,
      status: "completed",
      conclusion: params.conclusion,
      output: {
        title: params.title,
        summary: params.summary,
        text: params.text,
      },
    }),
  });
  const body = (await res.json()) as { id: number };
  return body.id;
}

export async function createIssueComment(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
) {
  await githubApi(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, token, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}
