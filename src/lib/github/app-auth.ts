import jwt from "jsonwebtoken";

function getPrivateKey(): string {
  const b64 = process.env.GITHUB_APP_PRIVATE_KEY_BASE64;
  if (!b64) throw new Error("GITHUB_APP_PRIVATE_KEY_BASE64 is not set");
  return Buffer.from(b64, "base64").toString("utf-8");
}

/** Signs a short-lived JWT identifying the GitHub App itself (not an installation). */
export function signAppJwt(): string {
  const appId = process.env.GITHUB_APP_ID;
  if (!appId) throw new Error("GITHUB_APP_ID is not set");

  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iat: now - 60, exp: now + 9 * 60, iss: appId },
    getPrivateKey(),
    { algorithm: "RS256" },
  );
}

// Installation tokens are valid for ~1 hour. Re-minting one costs an
// extra ~150ms round-trip to api.github.com every webhook. Cache them in
// the module scope with a conservative 50-minute TTL — Vercel serverless
// warm containers reuse this cache across invocations, and cold starts
// just mint a fresh token (which we'd have to do anyway).
interface CachedToken {
  token: string;
  expiresAt: number; // ms epoch
}
const tokenCache = new Map<number, CachedToken>();
const CACHE_TTL_MS = 50 * 60 * 1000;

/** Exchanges the App JWT for a short-lived installation access token, cached per installation. */
export async function getInstallationToken(githubInstallationId: number): Promise<string> {
  const cached = tokenCache.get(githubInstallationId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const appJwt = signAppJwt();
  const res = await fetch(
    `https://api.github.com/app/installations/${githubInstallationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: "application/vnd.github+json",
      },
    },
  );

  if (!res.ok) {
    throw new Error(`Failed to get installation token: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as { token: string; expires_at?: string };
  // Use GitHub's own expiry if present, else fall back to our TTL.
  const expiresAt = body.expires_at ? Date.parse(body.expires_at) - 60_000 : Date.now() + CACHE_TTL_MS;
  tokenCache.set(githubInstallationId, { token: body.token, expiresAt });
  return body.token;
}

/** For testing / debugging. */
export function clearInstallationTokenCache(): void {
  tokenCache.clear();
}
