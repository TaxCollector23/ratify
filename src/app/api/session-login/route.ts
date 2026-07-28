import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseIdToken } from "@/lib/auth/firebase-verify";
import { createSessionToken, SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { users, installations } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { organizations } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  idToken?: string;
  githubLogin?: string;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { idToken, githubLogin } = body;
  if (!idToken) {
    return NextResponse.json({ error: "Missing Firebase ID token." }, { status: 400 });
  }

  let verified;
  try {
    verified = await verifyFirebaseIdToken(idToken);
  } catch (err) {
    return NextResponse.json(
      { error: "Could not verify your sign-in with Firebase. Please try again.", detail: String(err) },
      { status: 401 },
    );
  }

  // Upsert user record. If they've never signed in before, we require them to
  // have passed a githubLogin (from the sign-up form).
  const existing = await db.select().from(users).where(eq(users.firebaseUid, verified.uid));
  if (existing.length === 0) {
    if (!githubLogin) {
      return NextResponse.json(
        { error: "New account: your GitHub username is required so we can link your installations." },
        { status: 400 },
      );
    }
    const cleanedLogin = githubLogin.trim().replace(/^@/, "");
    if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(cleanedLogin)) {
      return NextResponse.json(
        { error: "That doesn't look like a valid GitHub username." },
        { status: 400 },
      );
    }
    await db.insert(users).values({
      firebaseUid: verified.uid,
      email: verified.email ?? "",
      githubLogin: cleanedLogin,
    });

    // Retroactive link: if the user already installed the app on GitHub before
    // this Ratify account existed, wire it up now.
    await linkExistingInstallations(cleanedLogin, verified.uid);
  } else if (githubLogin) {
    // Existing user — allow updating github login if they explicitly provided one.
    const cleanedLogin = githubLogin.trim().replace(/^@/, "");
    if (cleanedLogin && cleanedLogin !== existing[0].githubLogin) {
      await db.update(users).set({ githubLogin: cleanedLogin }).where(eq(users.firebaseUid, verified.uid));
      await linkExistingInstallations(cleanedLogin, verified.uid);
    }
  }

  const sessionToken = await createSessionToken({ uid: verified.uid, email: verified.email });
  const res = NextResponse.json({ ok: true, uid: verified.uid });
  res.cookies.set(SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions());
  return res;
}

async function linkExistingInstallations(githubLogin: string, firebaseUid: string) {
  // Find any org whose GitHub login matches, then link its unclaimed installations.
  const orgs = await db.select().from(organizations).where(eq(organizations.githubLogin, githubLogin));
  for (const org of orgs) {
    await db
      .update(installations)
      .set({ ownerFirebaseUid: firebaseUid })
      .where(and(eq(installations.organizationId, org.id), isNull(installations.ownerFirebaseUid)));
  }
}
