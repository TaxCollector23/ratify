import { createHmac, timingSafeEqual } from "node:crypto";

export function signInstallationId(installationId: string): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) throw new Error("AUTH_SESSION_SECRET missing");
  return createHmac("sha256", secret).update(installationId).digest("hex");
}

export function verifyInstallationSignature(installationId: string, provided: string): boolean {
  try {
    const expected = signInstallationId(installationId);
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
