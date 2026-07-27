import type { Octokit } from "@octokit/rest";

export type CheckRunConclusion = "success" | "failure" | "neutral" | "action_required" | "cancelled";

export interface FindingSummaryForPublish {
  title: string;
  severity: string;
}

export interface ReviewPublishInput {
  owner: string;
  repo: string;
  headSha: string;
  pullRequestNumber: number;
  riskScore: number; // 0..100
  severityCounts: Record<string, number>;
  topFindings: FindingSummaryForPublish[]; // pre-limited to top 1-3 by caller
  reportUrl: string;
  checkRunExternalId?: string; // pass to update an existing check run idempotently
}

export interface PublishResult {
  checkRunId: number;
  commentId?: number;
  conclusion: CheckRunConclusion;
}

/**
 * Publishes a concise GitHub check run (and optionally a short PR
 * comment) summarizing a review session. Per the GitHub comment policy:
 * overall status, risk score, finding counts, top 1-3 findings, and a
 * link to the full in-app report — never the full analysis body.
 */
export class ReviewPublisher {
  constructor(private readonly octokit: Octokit) {}

  async publishCheckRun(input: ReviewPublishInput): Promise<PublishResult> {
    const conclusion = conclusionForRiskScore(input.riskScore);
    const summary = buildConciseSummary(input);

    const checkRun = input.checkRunExternalId
      ? await this.octokit.checks.update({
          owner: input.owner,
          repo: input.repo,
          check_run_id: Number(input.checkRunExternalId),
          status: "completed",
          conclusion,
          output: {
            title: `Ratify review — risk score ${input.riskScore}/100`,
            summary,
          },
        })
      : await this.octokit.checks.create({
          owner: input.owner,
          repo: input.repo,
          name: "Ratify / doctrine review",
          head_sha: input.headSha,
          status: "completed",
          conclusion,
          output: {
            title: `Ratify review — risk score ${input.riskScore}/100`,
            summary,
          },
        });

    return { checkRunId: checkRun.data.id, conclusion };
  }

  async publishSummaryComment(input: ReviewPublishInput): Promise<number> {
    const body = buildConciseSummary(input);
    const comment = await this.octokit.issues.createComment({
      owner: input.owner,
      repo: input.repo,
      issue_number: input.pullRequestNumber,
      body,
    });
    return comment.data.id;
  }
}

function conclusionForRiskScore(score: number): CheckRunConclusion {
  if (score >= 75) return "failure";
  if (score >= 40) return "action_required";
  if (score >= 15) return "neutral";
  return "success";
}

/**
 * Builds the short, structured markdown body used for both the check-run
 * output and the PR comment. Intentionally terse — the full evidence lives
 * behind reportUrl, never inline in GitHub.
 */
function buildConciseSummary(input: ReviewPublishInput): string {
  const lines: string[] = [];
  lines.push(`**Risk score:** ${input.riskScore}/100`);

  const severityLine = Object.entries(input.severityCounts)
    .filter(([, count]) => count > 0)
    .map(([sev, count]) => `${count} ${sev}`)
    .join(", ");
  lines.push(`**Findings:** ${severityLine || "none"}`);

  if (input.topFindings.length > 0) {
    lines.push("", "**Top findings:**");
    for (const finding of input.topFindings.slice(0, 3)) {
      lines.push(`- [${finding.severity}] ${finding.title}`);
    }
  }

  lines.push("", `[View full report in Ratify](${input.reportUrl})`);
  return lines.join("\n");
}
