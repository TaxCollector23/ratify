import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { installations, doctrineRules, doctrineMiningRuns } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const [install] = await db
    .select({ id: installations.id })
    .from(installations)
    .where(eq(installations.ownerFirebaseUid, session.uid))
    .limit(1);

  if (!install) {
    return NextResponse.json({ rules: [], miningStatus: null });
  }

  const rules = await db
    .select()
    .from(doctrineRules)
    .where(eq(doctrineRules.installationId, install.id))
    .orderBy(desc(doctrineRules.confidence));

  const [latestRun] = await db
    .select()
    .from(doctrineMiningRuns)
    .where(eq(doctrineMiningRuns.installationId, install.id))
    .orderBy(desc(doctrineMiningRuns.startedAt))
    .limit(1);

  return NextResponse.json({
    rules,
    miningStatus: latestRun
      ? {
          status: latestRun.status,
          rulesFound: latestRun.rulesFound,
          prsAnalyzed: latestRun.prsAnalyzed,
          startedAt: latestRun.startedAt,
          completedAt: latestRun.completedAt,
          error: latestRun.error,
        }
      : null,
  });
}
