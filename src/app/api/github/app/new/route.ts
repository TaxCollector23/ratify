import { NextRequest } from "next/server";
import { buildAppManifest } from "@/lib/github/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-time bootstrap route: visiting this redirects to GitHub to create the
// Ratify GitHub App from a manifest. Not linked from anywhere public — the
// operator visits this once, GitHub redirects back to /api/github/app/callback
// with the resulting app credentials.
export async function GET(req: NextRequest) {
  const baseUrl = `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const manifest = buildAppManifest(baseUrl);

  const html = `<!DOCTYPE html>
<html><body>
<form id="f" action="https://github.com/settings/apps/new" method="post">
  <input type="hidden" name="manifest" value='${JSON.stringify(manifest).replace(/'/g, "&#39;")}' />
</form>
<script>document.getElementById('f').submit();</script>
</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html" } });
}
