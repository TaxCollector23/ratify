import { App } from "@octokit/app";
import type { Octokit } from "@octokit/rest";

export interface GitHubAppConfig {
  appId: string;
  privateKey: string; // PEM contents; never log this
  webhookSecret: string;
  clientId?: string;
  clientSecret?: string;
}

/**
 * Thin wrapper around @octokit/app for GitHub App auth. Tokens are
 * requested per-installation and are short-lived by design (GitHub Apps
 * issue installation access tokens valid for ~1 hour) — we never persist
 * raw tokens; GithubInstallation.encryptedTokenRef instead points at a
 * secrets-manager entry or is left null and tokens are minted on demand.
 */
export class GitHubAppClient {
  private readonly app: App;

  constructor(config: GitHubAppConfig) {
    this.app = new App({
      appId: config.appId,
      privateKey: config.privateKey,
      webhooks: { secret: config.webhookSecret },
      oauth: config.clientId && config.clientSecret ? { clientId: config.clientId, clientSecret: config.clientSecret } : undefined,
    });
  }

  /** Returns an Octokit instance scoped to a single installation (least-privilege). */
  async getInstallationClient(installationId: number): Promise<Octokit> {
    return (await this.app.getInstallationOctokit(installationId)) as unknown as Octokit;
  }

  /** Verifies the app's own JWT-signing capability is configured (smoke check, no network). */
  get appIdConfigured(): boolean {
    return Boolean(this.app);
  }
}

let cachedClient: GitHubAppClient | undefined;

export function getGitHubAppClient(): GitHubAppClient {
  if (cachedClient) return cachedClient;
  cachedClient = new GitHubAppClient({
    appId: process.env.GITHUB_APP_ID ?? "",
    privateKey: (process.env.GITHUB_APP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? "",
    clientId: process.env.GITHUB_APP_CLIENT_ID,
    clientSecret: process.env.GITHUB_APP_CLIENT_SECRET,
  });
  return cachedClient;
}

/**
 * Least-privilege permission set requested for the Ratify GitHub App.
 * Documented here so infra/app-manifest config stays traceable to code.
 */
export const REQUIRED_GITHUB_APP_PERMISSIONS = {
  contents: "read",
  metadata: "read",
  pull_requests: "write", // to post PR comments
  checks: "write", // to publish check runs
  issues: "read", // for linked issue context
} as const;

export const REQUIRED_GITHUB_APP_EVENTS = [
  "installation",
  "installation_repositories",
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment",
  "push",
] as const;
