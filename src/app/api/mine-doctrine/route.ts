import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { installations, repositories, doctrineRules, doctrineMiningRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getInstallationToken } from "@/lib/github/app-auth";
import { mineDoctrine } from "@/lib/doctrine/miner";
import { verifyInstallationSignature } from "@/lib/doctrine/mining-signer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // allow up to 60s for LLM + GitHub round-trips

interface Body {
  installationId: string;
  signature: string; // HMAC over installationId
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.installationId || !verifyInstallationSignature(body.installationId, body.signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const [installation] = await db
    .select()
    .from(installations)
    .where(eq(installations.id, body.installationId));
  if (!installation) {
    return NextResponse.json({ error: "Installation not found" }, { status: 404 });
  }

  // Skip if there's already a mining run in the last 10 minutes.
  const recent = await db
    .select()
    .from(doctrineMiningRuns)
    .where(eq(doctrineMiningRuns.installationId, installation.id));
  const active = recent.find(
    (r) => r.status === "running" && Date.now() - new Date(r.startedAt).getTime() < 10 * 60 * 1000,
  );
  if (active) {
    return NextResponse.json({ status: "already-running", runId: active.id });
  }

  const [run] = await db
    .insert(doctrineMiningRuns)
    .values({ installationId: installation.id, status: "running" })
    .returning();

  try {
    const repos = await db
      .select()
      .from(repositories)
      .where(eq(repositories.installationId, installation.id));

    if (repos.length === 0) {
      await db
        .update(doctrineMiningRuns)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(doctrineMiningRuns.id, run.id));
      return NextResponse.json({ status: "no-repos", runId: run.id });
    }

    const token = await getInstallationToken(installation.githubInstallationId);
    let totalRules = 0;
    let totalPrs = 0;

    for (const repo of repos) {
      const result = await mineDoctrine(token, repo.owner, repo.name).catch((err) => {
        console.error(`Mining failed for ${repo.fullName}:`, err);
        return { rules: [], prsAnalyzed: 0 };
      });
      totalPrs += result.prsAnalyzed;

      for (const rule of result.rules) {
        await db
          .insert(doctrineRules)
          .values({
            installationId: installation.id,
            repositoryId: repo.id,
            ruleKey: rule.ruleKey,
            ruleText: rule.ruleText,
            category: rule.category,
            strength: rule.strength,
            confidence: rule.confidence,
            discoveredFrom: "history",
            supportingEvidence: rule.supportingEvidence,
          })
          // If the exact rule key already exists for this repo, skip.
          .onConflictDoNothing();
        totalRules++;
      }
    }

    await db
      .update(doctrineMiningRuns)
      .set({
        status: "completed",
        rulesFound: totalRules,
        prsAnalyzed: totalPrs,
        completedAt: new Date(),
      })
      .where(eq(doctrineMiningRuns.id, run.id));

    return NextResponse.json({ status: "completed", rulesFound: totalRules, prsAnalyzed: totalPrs, runId: run.id });
  } catch (err) {
    await db
      .update(doctrineMiningRuns)
      .set({ status: "failed", error: String(err), completedAt: new Date() })
      .where(eq(doctrineMiningRuns.id, run.id));
    return NextResponse.json({ status: "failed", error: String(err) }, { status: 500 });
  }
}

