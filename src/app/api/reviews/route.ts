import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { reviewSessions, pullRequests, repositories } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET() {
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
    .orderBy(desc(reviewSessions.createdAt))
    .limit(25);

  return NextResponse.json({ sessions });
}
