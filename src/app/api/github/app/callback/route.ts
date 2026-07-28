import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ManifestConversion {
  id: number;
  slug: string;
  client_id: string;
  client_secret: string;
  webhook_secret: string;
  pem: string;
  html_url: string;
}

// One-time bootstrap callback: GitHub redirects here after the operator
// creates the app from the manifest at /api/github/app/new. Exchanges the
// code for real app credentials and displays them once so they can be
// stored as environment variables. This page is only ever reached by
// whoever just completed that GitHub flow.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return new Response("Missing code", { status: 400 });
  }

  const res = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json" },
  });

  if (!res.ok) {
    const text = await res.text();
    return new Response(`GitHub conversion failed: ${res.status} ${text}`, { status: 500 });
  }

  const app = (await res.json()) as ManifestConversion;
  const pemBase64 = Buffer.from(app.pem, "utf-8").toString("base64");

  const html = `<!DOCTYPE html>
<html><body style="font-family: monospace; white-space: pre-wrap; padding: 24px; max-width: 900px;">
<h2>Ratify GitHub App created: ${app.slug}</h2>
<p>Store these as environment variables, then discard this page.</p>
GITHUB_APP_ID=${app.id}
GITHUB_APP_SLUG=${app.slug}
GITHUB_APP_CLIENT_ID=${app.client_id}
GITHUB_APP_CLIENT_SECRET=${app.client_secret}
GITHUB_APP_WEBHOOK_SECRET=${app.webhook_secret}
GITHUB_APP_PRIVATE_KEY_BASE64=${pemBase64}

<p>Install URL for end users: https://github.com/apps/${app.slug}/installations/new</p>
</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html" } });
}
