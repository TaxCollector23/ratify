import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { reviewSessions, pullRequests, repositories, findings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [session] = await db
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
    .where(eq(reviewSessions.id, id));

  if (!session) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const sessionFindings = await db.select().from(findings).where(eq(findings.reviewSessionId, id));

  return NextResponse.json({ session, findings: sessionFindings });
}
