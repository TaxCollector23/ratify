/* eslint-disable @typescript-eslint/no-explicit-any */
// GitHub webhook payloads have hundreds of variant shapes depending on the
// event type and action. Typing every subfield is not worth the noise for a
// v1; the shapes we actually read are validated by presence checks at use.
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { verifyWebhookSignature } from "@/lib/github/signature";
import { signInstallationId } from "@/lib/doctrine/mining-signer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GhPayload = any;

import { db } from "@/lib/db/client";
import { organizations, installations, repositories, pullRequests, reviewSessions, findings, webhookEvents, users, doctrineRules } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getInstallationToken } from "@/lib/github/app-auth";
import { getPullRequestFiles, createCheckRun, createIssueComment } from "@/lib/github/api";
import { compareCommits, fetchCommitFiles, fetchPreviousDeployment } from "@/lib/github/deployments";
import { recordStage, timeStage } from "@/lib/review/timeline";
import { runPolicyChecks } from "@/lib/review/policy-checks";
import { runLlmReasoning } from "@/lib/review/llm-reason";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const deliveryId = req.headers.get("x-github-delivery") ?? crypto.randomUUID();
  const eventType = req.headers.get("x-github-event") ?? "unknown";
  const payload = JSON.parse(rawBody);
  const baseUrl = `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  const existing = await db.query.webhookEvents.findFirst({ where: eq(webhookEvents.githubDeliveryId, deliveryId) });
  if (existing) {
    return NextResponse.json({ status: "duplicate" });
  }
  await db.insert(webhookEvents).values({ githubDeliveryId: deliveryId, eventType });

  try {
    let installationJustCreated = false;
    let installationRowIdForMining: string | null = null;

    if (eventType === "installation" && (payload.action === "created" || payload.action === "new_permissions_accepted")) {
      await handleInstallationCreated(payload);
      installationJustCreated = true;
    } else if (eventType === "installation_repositories") {
      await handleRepositoriesAdded(payload);
      installationJustCreated = true;
    } else if (eventType === "pull_request" && ["opened", "synchronize", "reopened"].includes(payload.action)) {
      await handlePullRequest(payload);
    } else if (eventType === "deployment" && payload.deployment) {
      await handleDeployment(payload);
    }

    if (installationJustCreated && payload.installation?.id) {
      const [installRow] = await db
        .select({ id: installations.id })
        .from(installations)
        .where(eq(installations.githubInstallationId, payload.installation.id));
      installationRowIdForMining = installRow?.id ?? null;
    }

    await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.githubDeliveryId, deliveryId));

    // Kick off doctrine mining AFTER we've responded to GitHub — otherwise
    // we'd blow past the 10-second webhook budget.
    if (installationRowIdForMining) {
      const idForMining: string = installationRowIdForMining;
      after(async () => {
        try {
          const sig = signInstallationId(idForMining);
          await fetch(`${baseUrl}/api/mine-doctrine`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ installationId: idForMining, signature: sig }),
          });
        } catch (err) {
          console.error("Failed to trigger doctrine mining:", err);
        }
      });
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("Webhook processing failed:", err);
    await db.update(webhookEvents).set({ error: String(err) }).where(eq(webhookEvents.githubDeliveryId, deliveryId));
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}

async function handleInstallationCreated(payload: GhPayload) {
  const account = payload.installation.account;
  const [org] = await db
    .insert(organizations)
    .values({ githubLogin: account.login, githubAccountId: account.id })
    .onConflictDoUpdate({ target: organizations.githubLogin, set: { githubAccountId: account.id } })
    .returning();

  // If a Ratify user has already signed up with this github_login, link the
  // installation to them; otherwise it stays unlinked until they sign up.
  const [matchingUser] = await db.select().from(users).where(eq(users.githubLogin, account.login));

  await db
    .insert(installations)
    .values({
      organizationId: org.id,
      githubInstallationId: payload.installation.id,
      ownerFirebaseUid: matchingUser?.firebaseUid ?? null,
    })
    .onConflictDoUpdate({
      target: installations.githubInstallationId,
      set: { ownerFirebaseUid: matchingUser?.firebaseUid ?? null },
    });

  const repos: any[] = payload.repositories ?? [];
  if (repos.length > 0) {
    const [installRow] = await db
      .select()
      .from(installations)
      .where(eq(installations.githubInstallationId, payload.installation.id));
    for (const repo of repos) {
      await db
        .insert(repositories)
        .values({
          installationId: installRow.id,
          githubRepoId: repo.id,
          owner: account.login,
          name: repo.name,
          fullName: repo.full_name,
        })
        .onConflictDoNothing({ target: repositories.githubRepoId });
    }
  }
}

async function handleRepositoriesAdded(payload: GhPayload) {
  if (!payload.repositories_added) return;
  const [installRow] = await db
    .select()
    .from(installations)
    .where(eq(installations.githubInstallationId, payload.installation.id));
  if (!installRow) return;

  for (const repo of payload.repositories_added) {
    await db
      .insert(repositories)
      .values({
        installationId: installRow.id,
        githubRepoId: repo.id,
        owner: payload.installation.account.login,
        name: repo.name,
        fullName: repo.full_name,
      })
      .onConflictDoNothing({ target: repositories.githubRepoId });
  }
}

async function handlePullRequest(payload: GhPayload) {
  const ghInstallationId = payload.installation?.id;
  if (!ghInstallationId) return;

  const [installRow] = await db
    .select()
    .from(installations)
    .where(eq(installations.githubInstallationId, ghInstallationId));
  if (!installRow) return;

  const ghRepo = payload.repository;
  let [repoRow] = await db.select().from(repositories).where(eq(repositories.githubRepoId, ghRepo.id));
  if (!repoRow) {
    [repoRow] = await db
      .insert(repositories)
      .values({
        installationId: installRow.id,
        githubRepoId: ghRepo.id,
        owner: ghRepo.owner.login,
        name: ghRepo.name,
        fullName: ghRepo.full_name,
      })
      .returning();
  }

  const pr = payload.pull_request;
  let [prRow] = await db
    .select()
    .from(pullRequests)
    .where(eq(pullRequests.repositoryId, repoRow.id));
  if (prRow && prRow.githubPrNumber === pr.number) {
    await db.update(pullRequests).set({ headSha: pr.head.sha, updatedAt: new Date() }).where(eq(pullRequests.id, prRow.id));
  } else {
    [prRow] = await db
      .insert(pullRequests)
      .values({
        repositoryId: repoRow.id,
        githubPrNumber: pr.number,
        title: pr.title,
        author: pr.user.login,
        headSha: pr.head.sha,
        baseSha: pr.base.sha,
      })
      .returning();
  }

  // Idempotency: the same PR at the same head SHA should never produce two
  // parallel review sessions. GitHub retries webhooks aggressively (up to
  // ~8 times over 24h if we don't respond fast enough), and Vercel can
  // occasionally cold-start slow enough to trigger that. onConflict on the
  // unique (pull_request_id, head_sha) index turns the second-onwards
  // deliveries into no-ops.
  const inserted = await db
    .insert(reviewSessions)
    .values({ pullRequestId: prRow.id, headSha: pr.head.sha, status: "running" })
    .onConflictDoNothing({ target: [reviewSessions.pullRequestId, reviewSessions.headSha] })
    .returning();

  if (inserted.length === 0) {
    // Duplicate delivery for this exact (PR, SHA). Record the audit event
    // against the existing session and bail — the original run is either in
    // flight or already finished.
    const [existing] = await db
      .select()
      .from(reviewSessions)
      .where(and(eq(reviewSessions.pullRequestId, prRow.id), eq(reviewSessions.headSha, pr.head.sha)));
    if (existing) {
      await recordStage(existing.id, "skipped_duplicate", { reason: "duplicate webhook for same PR + head SHA" });
    }
    return;
  }

  const session = inserted[0];
  await recordStage(session.id, "webhook_received", {
    prNumber: pr.number,
    headSha: pr.head.sha,
    action: payload.action,
  });

  const token = await getInstallationToken(ghInstallationId);
  const files = await timeStage(
    session.id,
    "context_retrieved",
    () => getPullRequestFiles(token, ghRepo.owner.login, ghRepo.name, pr.number),
    (result) => ({ fileCount: result.length }),
  );

  const policyFindings = await timeStage(
    session.id,
    "policy_checks",
    async () => runPolicyChecks(files),
    (result) => ({ findingCount: result.length, ruleKeys: result.map((f) => f.ruleKey) }),
  );

  // Pull doctrine rules for this repo (fall back to installation-wide) so the
  // reviewer reasons against this repo's actual standards, not generic advice.
  const rulesForRepo = await db
    .select({
      ruleText: doctrineRules.ruleText,
      category: doctrineRules.category,
      strength: doctrineRules.strength,
    })
    .from(doctrineRules)
    .where(eq(doctrineRules.installationId, installRow.id));

  const llmResult = await timeStage(
    session.id,
    "llm_call",
    () => runLlmReasoning(pr.title, files, policyFindings, rulesForRepo),
    (result) => ({
      modelReturnedFindings: result?.findings.length ?? 0,
      hadResult: result !== null,
      doctrineRulesUsed: rulesForRepo.length,
    }),
  );

  const allFindings = [...policyFindings, ...(llmResult?.findings ?? [])];
  for (const f of allFindings) {
    await db.insert(findings).values({
      reviewSessionId: session.id,
      ruleKey: f.ruleKey,
      title: f.title,
      description: f.description,
      filePath: f.filePath,
      severity: f.severity,
      confidence: f.confidence,
      source: f.source,
      evidence: "evidence" in f ? f.evidence : {},
    });
  }

  const highCount = allFindings.filter((f) => f.severity === "high").length;
  const riskScore = Math.max(0, 100 - highCount * 30 - allFindings.filter((f) => f.severity === "medium").length * 10);
  const conclusion = highCount > 0 ? "failure" : allFindings.length > 0 ? "neutral" : "success";

  const summaryText =
    llmResult?.summary ??
    (allFindings.length === 0
      ? "No issues found by deterministic checks."
      : `${allFindings.length} finding(s) from deterministic checks.`);

  await recordStage(session.id, "evidence_generated", {
    findingCount: allFindings.length,
    highCount,
    mediumCount: allFindings.filter((f) => f.severity === "medium").length,
    lowCount: allFindings.filter((f) => f.severity === "low").length,
    riskScore,
    conclusion,
  });

  const checkText = allFindings.length > 0
    ? allFindings.map((f) => `**${severityBadge(f.severity)} ${f.title}** _(source: ${f.source}, confidence ${(f.confidence * 100).toFixed(0)}%)_\n${f.description}`).join("\n\n")
    : "All deterministic policy checks passed and no doctrine violations detected.";

  const publicUrl = process.env.RATIFY_PUBLIC_URL ?? "https://ratify-zeta-dusky.vercel.app";
  const dashboardLink = `${publicUrl}/dashboard`;

  const checkRunId = await timeStage(
    session.id,
    "published",
    () => createCheckRun(token, ghRepo.owner.login, ghRepo.name, pr.head.sha, {
      conclusion,
      title: `${allFindings.length} finding(s) · risk ${riskScore}%`,
      summary: summaryText,
      text: `${checkText}\n\n---\n[Open the full review in Ratify →](${dashboardLink})`,
    }),
    (id) => ({ checkRunId: id }),
  );

  if (allFindings.length > 0) {
    const top = allFindings.slice(0, 3);
    const comment = buildRichPrComment({
      summaryText,
      riskScore,
      allFindings,
      top,
      dashboardLink,
      doctrineRulesUsed: rulesForRepo.length,
    });
    await createIssueComment(token, ghRepo.owner.login, ghRepo.name, pr.number, comment);
  }

  await db
    .update(reviewSessions)
    .set({
      status: "completed",
      riskScore,
      filesChanged: files.length,
      summary: summaryText,
      checkRunId,
      completedAt: new Date(),
    })
    .where(eq(reviewSessions.id, session.id));
}

function severityBadge(severity: string): string {
  if (severity === "high") return "🔴";
  if (severity === "medium") return "🟠";
  return "🟡";
}

function buildRichPrComment(opts: {
  summaryText: string;
  riskScore: number;
  allFindings: Array<{ title: string; severity: string; description: string; source: string; confidence: number; filePath?: string | null }>;
  top: typeof opts.allFindings;
  dashboardLink: string;
  doctrineRulesUsed: number;
}): string {
  const { summaryText, riskScore, allFindings, top, dashboardLink, doctrineRulesUsed } = opts;
  const highN = allFindings.filter((f) => f.severity === "high").length;
  const medN = allFindings.filter((f) => f.severity === "medium").length;
  const lowN = allFindings.filter((f) => f.severity === "low").length;

  const header = `## <img src="https://ratify-zeta-dusky.vercel.app/favicon.svg" width="18" align="center"/> Ratify review

**Risk score: ${riskScore}%** · ${allFindings.length} finding${allFindings.length === 1 ? "" : "s"} ` +
    `(${highN} high, ${medN} medium, ${lowN} low)` +
    (doctrineRulesUsed > 0 ? ` · evaluated against ${doctrineRulesUsed} repository doctrine rule${doctrineRulesUsed === 1 ? "" : "s"}` : "");

  const body = summaryText;

  const findingsBlock = top
    .map((f) => {
      const src = f.source === "policy-engine" ? "deterministic" : "reasoning";
      const path = f.filePath ? ` — \`${f.filePath}\`` : "";
      return `<details><summary><b>${severityBadge(f.severity)} ${f.title}</b> · ${src}${path}</summary>\n\n${f.description}\n\n</details>`;
    })
    .join("\n\n");

  const footer =
    (allFindings.length > 3 ? `\n\n_Showing top 3 of ${allFindings.length} findings._` : "") +
    `\n\n[Open the full review](${dashboardLink}) · React 👍/👎 on any finding to teach Ratify what your team considers a real issue.`;

  return `${header}\n\n> ${body}\n\n${findingsBlock}${footer}`;
}

/**
 * Deployment gating: when a GitHub Deployment is created, run the same
 * doctrine + policy pipeline against the deployment's target SHA and post
 * a check_run to it. If a previous successful deployment to the same
 * environment exists, review the delta between the two; otherwise review
 * the target commit itself.
 */
async function handleDeployment(payload: GhPayload) {
  const deployment = payload.deployment;
  const ghRepo = payload.repository;
  const ghInstallationId = payload.installation?.id;
  if (!deployment || !ghRepo || !ghInstallationId) return;

  const [installRow] = await db
    .select()
    .from(installations)
    .where(eq(installations.githubInstallationId, ghInstallationId));
  if (!installRow) return;

  // Ensure the repo record exists (installations added later may skip it).
  let [repoRow] = await db.select().from(repositories).where(eq(repositories.githubRepoId, ghRepo.id));
  if (!repoRow) {
    [repoRow] = await db
      .insert(repositories)
      .values({
        installationId: installRow.id,
        githubRepoId: ghRepo.id,
        owner: ghRepo.owner.login,
        name: ghRepo.name,
        fullName: ghRepo.full_name,
      })
      .returning();
  }

  const token = await getInstallationToken(ghInstallationId);
  const owner = ghRepo.owner.login;
  const repo = ghRepo.name;
  const sha: string = deployment.sha;
  const environment: string = deployment.environment ?? "unknown";

  // Find files-changed: prefer delta against the last successful deployment.
  let files: Array<{ filename: string; status: string; additions: number; deletions: number; changes: number; patch?: string }> = [];
  let deltaSource: string;
  try {
    const previous = await fetchPreviousDeployment(token, owner, repo, environment, deployment.id);
    if (previous) {
      files = await compareCommits(token, owner, repo, previous.sha, sha);
      deltaSource = `${previous.sha.slice(0, 7)}..${sha.slice(0, 7)}`;
    } else {
      const commit = await fetchCommitFiles(token, owner, repo, sha);
      files = commit.files;
      deltaSource = `commit ${sha.slice(0, 7)}`;
    }
  } catch (err) {
    console.error("Deployment diff fetch failed:", err);
    // Post a neutral check even when we can't fetch the diff — better than silence.
    await createCheckRun(token, owner, repo, sha, {
      conclusion: "neutral",
      title: "Ratify: diff unavailable",
      summary: `Could not compute the deployment diff (${String(err).slice(0, 200)}).`,
      text: "Ratify skipped this deployment review because it could not fetch the file diff from GitHub.",
    });
    return;
  }

  const policyFindings = runPolicyChecks(files);

  const rulesForRepo = await db
    .select({
      ruleText: doctrineRules.ruleText,
      category: doctrineRules.category,
      strength: doctrineRules.strength,
    })
    .from(doctrineRules)
    .where(eq(doctrineRules.installationId, installRow.id));

  const llmResult = await runLlmReasoning(
    `Deployment to ${environment} at ${sha.slice(0, 7)}`,
    files,
    policyFindings,
    rulesForRepo,
  );

  const allFindings = [...policyFindings, ...(llmResult?.findings ?? [])];
  const highCount = allFindings.filter((f) => f.severity === "high").length;
  const mediumCount = allFindings.filter((f) => f.severity === "medium").length;
  const riskScore = Math.max(0, 100 - highCount * 30 - mediumCount * 10);
  const conclusion = highCount > 0 ? "failure" : allFindings.length > 0 ? "neutral" : "success";

  const summary =
    llmResult?.summary ??
    (allFindings.length === 0
      ? "No issues found for this deployment."
      : `${allFindings.length} finding(s) against repository doctrine.`);

  const text =
    `**Deployment target:** \`${environment}\`\n**Delta:** ${deltaSource}\n**Files changed:** ${files.length}\n\n` +
    (allFindings.length > 0
      ? allFindings.map((f) => `**${f.title}** (${f.severity})\n${f.description}`).join("\n\n")
      : "All deterministic policy checks passed and no doctrine violations detected.");

  await createCheckRun(token, owner, repo, sha, {
    conclusion,
    title: `Deployment · ${allFindings.length} finding(s) · risk ${riskScore}%`,
    summary,
    text,
  });
}
