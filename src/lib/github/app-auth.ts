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

/** Exchanges the App JWT for a short-lived installation access token. */
export async function getInstallationToken(githubInstallationId: number): Promise<string> {
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

  const body = (await res.json()) as { token: string };
  return body.token;
}
