import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies a GitHub webhook's HMAC-SHA256 signature (X-Hub-Signature-256
 * header) against GITHUB_WEBHOOK_SECRET. Uses a constant-time comparison
 * to avoid timing side-channel leaks. This MUST run before the payload
 * body is parsed or trusted in any way.
 */
export function verifyGitHubSignature(params: {
  payloadBody: Buffer | string;
  signatureHeader: string | undefined | null;
  secret: string;
}): boolean {
  const { payloadBody, signatureHeader, secret } = params;

  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const expectedDigest = createHmac("sha256", secret)
    .update(typeof payloadBody === "string" ? Buffer.from(payloadBody, "utf-8") : payloadBody)
    .digest("hex");
  const expectedHeader = `sha256=${expectedDigest}`;

  const expectedBuf = Buffer.from(expectedHeader, "utf-8");
  const actualBuf = Buffer.from(signatureHeader, "utf-8");

  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, actualBuf);
}

export function computeGitHubSignature(payloadBody: Buffer | string, secret: string): string {
  const digest = createHmac("sha256", secret)
    .update(typeof payloadBody === "string" ? Buffer.from(payloadBody, "utf-8") : payloadBody)
    .digest("hex");
  return `sha256=${digest}`;
}
