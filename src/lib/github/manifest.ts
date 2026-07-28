export function buildAppManifest(baseUrl: string) {
  return {
    name: "Ratify Reviews",
    url: baseUrl,
    hook_attributes: {
      url: `${baseUrl}/api/webhooks/github`,
    },
    redirect_url: `${baseUrl}/api/github/app/callback`,
    public: true,
    default_permissions: {
      contents: "read",
      pull_requests: "write",
      checks: "write",
      metadata: "read",
    },
    default_events: ["pull_request"],
  };
}
