import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { reviewSessions, pullRequests, repositories, findings, reviewEvents, findingFeedback, installations } from "@/lib/db/schema";
import { and, eq, asc, inArray } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const authed = await getCurrentSession();
  if (!authed) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Ownership-gated fetch: only return this review session if the
  // installation it lives under is owned by the authenticated user's
  // Firebase UID. Anything else returns 404 (deliberately indistinguishable
  // from "doesn't exist" — don't reveal which UUIDs are real).
  const [session] = await db
    .select({
      id: reviewSessions.id,
      status: reviewSessions.status,
      headSha: reviewSessions.headSha,
      riskScore: reviewSessions.riskScore,
      filesChanged: reviewSessions.filesChanged,
      summary: reviewSessions.summary,
      createdAt: reviewSessions.createdAt,
      completedAt: reviewSessions.completedAt,
      checkRunId: reviewSessions.checkRunId,
      prTitle: pullRequests.title,
      prNumber: pullRequests.githubPrNumber,
      prAuthor: pullRequests.author,
      repoFullName: repositories.fullName,
      repoOwner: repositories.owner,
      repoName: repositories.name,
    })
    .from(reviewSessions)
    .innerJoin(pullRequests, eq(reviewSessions.pullRequestId, pullRequests.id))
    .innerJoin(repositories, eq(pullRequests.repositoryId, repositories.id))
    .innerJoin(installations, eq(repositories.installationId, installations.id))
    .where(and(eq(reviewSessions.id, id), eq(installations.ownerFirebaseUid, authed.uid)));

  if (!session) {
    return NextResponse.json({ error: "Review session not found." }, { status: 404 });
  }

  const sessionFindings = await db.select().from(findings).where(eq(findings.reviewSessionId, id));
  const timeline = await db
    .select()
    .from(reviewEvents)
    .where(eq(reviewEvents.reviewSessionId, id))
    .orderBy(asc(reviewEvents.createdAt));

  let myFeedback: Record<string, { verdict: string; comment: string | null; createdAt: Date }> = {};
  if (sessionFindings.length > 0) {
    const rows = await db
      .select()
      .from(findingFeedback)
      .where(inArray(findingFeedback.findingId, sessionFindings.map((f) => f.id)));
    myFeedback = Object.fromEntries(
      rows.filter((r) => r.firebaseUid === authed.uid).map((r) => [r.findingId, { verdict: r.verdict, comment: r.comment, createdAt: r.createdAt }]),
    );
  }

  return NextResponse.json({
    session,
    findings: sessionFindings,
    timeline,
    myFeedback,
  });
}
