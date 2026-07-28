interface CommitResponse {
  files?: Array<{ filename: string; status: string; additions: number; deletions: number; changes: number; patch?: string }>;
  commit: { message: string; author: { name: string; email: string } };
}

interface CompareResponse {
  files?: Array<{ filename: string; status: string; additions: number; deletions: number; changes: number; patch?: string }>;
  ahead_by: number;
  behind_by: number;
}

async function api<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${path}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** Files changed between two refs. Used when we have a previous deployment to compare against. */
export async function compareCommits(
  token: string,
  owner: string,
  repo: string,
  base: string,
  head: string,
): Promise<NonNullable<CompareResponse["files"]>> {
  const data = await api<CompareResponse>(
    `/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
    token,
  );
  return data.files ?? [];
}

/** Files changed in a single commit. Used when there's no previous deployment. */
export async function fetchCommitFiles(
  token: string,
  owner: string,
  repo: string,
  sha: string,
): Promise<{
  files: NonNullable<CommitResponse["files"]>;
  message: string;
}> {
  const data = await api<CommitResponse>(`/repos/${owner}/${repo}/commits/${sha}`, token);
  return { files: data.files ?? [], message: data.commit.message };
}

interface DeploymentListItem {
  id: number;
  sha: string;
  environment: string;
  created_at: string;
}

/** The most recent successful deployment to a given environment, if any. */
export async function fetchPreviousDeployment(
  token: string,
  owner: string,
  repo: string,
  environment: string,
  currentDeploymentId: number,
): Promise<DeploymentListItem | null> {
  const list = await api<DeploymentListItem[]>(
    `/repos/${owner}/${repo}/deployments?environment=${encodeURIComponent(environment)}&per_page=10`,
    token,
  );
  const previous = list.find((d) => d.id !== currentDeploymentId);
  return previous ?? null;
}
