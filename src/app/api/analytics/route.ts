import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { installations, reviewSessions, pullRequests, repositories, findings } from "@/lib/db/schema";
import { eq, sql, and, gte } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Aggregate over the current user's installations only.
  const installRows = await db
    .select({ id: installations.id })
    .from(installations)
    .where(eq(installations.ownerFirebaseUid, session.uid));

  if (installRows.length === 0) {
    return NextResponse.json({
      totalReviews: 0,
      avgRiskScore: null,
      findingsThisWeek: 0,
      severityBreakdown: { low: 0, medium: 0, high: 0 },
      volumeByDay: [],
    });
  }

  // Total reviews + avg risk score.
  const [aggregate] = await db
    .select({
      total: sql<number>`count(*)::int`,
      avgRisk: sql<number | null>`avg(${reviewSessions.riskScore})::float`,
    })
    .from(reviewSessions)
    .innerJoin(pullRequests, eq(reviewSessions.pullRequestId, pullRequests.id))
    .innerJoin(repositories, eq(pullRequests.repositoryId, repositories.id))
    .where(eq(repositories.installationId, installRows[0].id));

  // Findings this week + severity breakdown.
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const findingRows = await db
    .select({ severity: findings.severity, createdAt: findings.createdAt })
    .from(findings)
    .innerJoin(reviewSessions, eq(findings.reviewSessionId, reviewSessions.id))
    .innerJoin(pullRequests, eq(reviewSessions.pullRequestId, pullRequests.id))
    .innerJoin(repositories, eq(pullRequests.repositoryId, repositories.id))
    .where(and(eq(repositories.installationId, installRows[0].id), gte(findings.createdAt, oneWeekAgo)));

  const severityBreakdown = { low: 0, medium: 0, high: 0 };
  for (const f of findingRows) {
    if (f.severity in severityBreakdown) {
      severityBreakdown[f.severity as keyof typeof severityBreakdown]++;
    }
  }

  // Volume by day for the last 7 days.
  const volumeByDay: { day: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const iso = day.toISOString().slice(0, 10);
    const dayStart = new Date(day.setHours(0, 0, 0, 0));
    const dayEnd = new Date(day.setHours(23, 59, 59, 999));
    const count = findingRows.filter(
      (f) => f.createdAt >= dayStart && f.createdAt <= dayEnd,
    ).length;
    volumeByDay.push({ day: iso, count });
  }

  return NextResponse.json({
    totalReviews: aggregate?.total ?? 0,
    avgRiskScore: aggregate?.avgRisk ?? null,
    findingsThisWeek: findingRows.length,
    severityBreakdown,
    volumeByDay,
  });
}
