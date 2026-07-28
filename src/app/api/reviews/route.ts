import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { reviewSessions, pullRequests, repositories, installations } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const sessions = await db
    .select({
      id: reviewSessions.id,
      status: reviewSessions.status,
      riskScore: reviewSessions.riskScore,
      filesChanged: reviewSessions.filesChanged,
      summary: reviewSessions.summary,
      createdAt: reviewSessions.createdAt,
      prTitle: pullRequests.title,
      prNumber: pullRequests.githubPrNumber,
      prAuthor: pullRequests.author,
      repoFullName: repositories.fullName,
    })
    .from(reviewSessions)
    .innerJoin(pullRequests, eq(reviewSessions.pullRequestId, pullRequests.id))
    .innerJoin(repositories, eq(pullRequests.repositoryId, repositories.id))
    .innerJoin(installations, eq(repositories.installationId, installations.id))
    .where(eq(installations.ownerFirebaseUid, session.uid))
    .orderBy(desc(reviewSessions.createdAt))
    .limit(50);

  return NextResponse.json({ sessions });
}
