import { jwtVerify, importX509, decodeProtectedHeader } from "jose";
import { FIREBASE_PROJECT_ID } from "../firebase/client";

// Firebase ID tokens are signed by Google's securetoken service. Google
// serves the public certificates at this URL as PEM-encoded X.509 certs
// keyed by kid. We can verify tokens against these without needing a
// service account — the certs are public and rotate every ~6 hours, so we
// cache with a soft TTL.
const CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let certCache: { fetchedAt: number; certs: Record<string, string> } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — well under Google's ~6h rotation window

async function fetchCerts(): Promise<Record<string, string>> {
  if (certCache && Date.now() - certCache.fetchedAt < CACHE_TTL_MS) {
    return certCache.certs;
  }
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error(`Failed to fetch Firebase certs: ${res.status}`);
  const certs = (await res.json()) as Record<string, string>;
  certCache = { fetchedAt: Date.now(), certs };
  return certs;
}

export interface VerifiedFirebaseUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser> {
  const header = decodeProtectedHeader(idToken);
  if (!header.kid || header.alg !== "RS256") {
    throw new Error("Invalid token header");
  }
  const certs = await fetchCerts();
  const pem = certs[header.kid];
  if (!pem) throw new Error("Unknown signing key id (token may be from rotated cert)");

  const publicKey = await importX509(pem, "RS256");
  const { payload } = await jwtVerify(idToken, publicKey, {
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID,
  });

  const uid = (payload.user_id as string | undefined) ?? (payload.sub as string | undefined);
  if (!uid) throw new Error("Token missing uid");

  return {
    uid,
    email: (payload.email as string | undefined) ?? null,
    emailVerified: Boolean(payload.email_verified),
  };
}
