import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { users, installations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ authed: false });
  }
  const [user] = await db.select().from(users).where(eq(users.firebaseUid, session.uid));
  const linked = await db
    .select({ id: installations.id })
    .from(installations)
    .where(eq(installations.ownerFirebaseUid, session.uid))
    .limit(1);
  return NextResponse.json({
    authed: true,
    uid: session.uid,
    email: session.email,
    githubLogin: user?.githubLogin ?? null,
    hasInstallation: linked.length > 0,
  });
}
