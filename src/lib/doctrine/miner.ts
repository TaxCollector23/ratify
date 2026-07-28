import { fetchRecentMergedPrs, fetchPrReviewComments, fetchPrIssueComments } from "@/lib/github/history";

export interface MinedRule {
  ruleKey: string;
  ruleText: string;
  category: string;
  strength: "hard-rule" | "soft-norm" | "likely-preference";
  confidence: number;
  supportingEvidence: string[];
}

interface MiningResult {
  rules: MinedRule[];
  prsAnalyzed: number;
}

/**
 * Mines doctrine from a repository's recent history by:
 *   1. Fetching the N most recent merged PRs.
 *   2. Fetching every review comment on those PRs.
 *   3. Sending the aggregated review-comment corpus to a model with a
 *      schema-constrained prompt asking for structured rule extraction.
 *
 * The result is a small set of confidence-scored rules that reflect what
 * *this* repository actually enforces, not generic best practices. If no
 * LLM key is configured, returns an empty result rather than throwing.
 */
export async function mineDoctrine(
  installationToken: string,
  owner: string,
  repo: string,
  prSampleSize = 12,
): Promise<MiningResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  // Even if there's no LLM, still fetch history so we get an accurate prsAnalyzed count.
  const prs = await fetchRecentMergedPrs(installationToken, owner, repo, prSampleSize);
  if (prs.length === 0) {
    return { rules: [], prsAnalyzed: 0 };
  }

  // Collect review + issue comments in parallel.
  const commentBatches = await Promise.all(
    prs.map(async (pr) => {
      const [review, issue] = await Promise.all([
        fetchPrReviewComments(installationToken, owner, repo, pr.number).catch(() => []),
        fetchPrIssueComments(installationToken, owner, repo, pr.number).catch(() => []),
      ]);
      return { pr, review, issue };
    }),
  );

  if (!apiKey) {
    return { rules: [], prsAnalyzed: prs.length };
  }

  // Compact corpus. Cap total comment volume to keep the prompt within
  // budget (~1500 chars per PR × ~12 PRs = 18k chars ceiling).
  const corpus = commentBatches
    .map(({ pr, review, issue }) => {
      const lines = [
        `## PR #${pr.number}: ${pr.title}`,
        ...review.slice(0, 6).map((c) => `- [review] ${c.user.login}: ${c.body.slice(0, 300)}`),
        ...issue.slice(0, 4).map((c) => `- [issue] ${c.user.login}: ${c.body.slice(0, 300)}`),
      ];
      return lines.join("\n");
    })
    .join("\n\n")
    .slice(0, 22000);

  const prompt = `You are analyzing merged pull request review comments from a single repository to extract that repository's *engineering doctrine* — the recurring rules and norms this team actually enforces during code review. Focus on patterns that appear more than once or are asserted with confidence, not one-off preferences.

Repository: ${owner}/${repo}

Review comment corpus (most recent ${prs.length} merged PRs):
${corpus}

Respond with ONLY a JSON object of this exact shape, no prose outside the JSON:
{
  "rules": [
    {
      "ruleKey": "kebab-case-identifier",
      "ruleText": "One-sentence rule as it would be written in a style guide, imperative voice.",
      "category": "one of: testing | architecture | documentation | dependencies | naming | security | performance | other",
      "strength": "hard-rule | soft-norm | likely-preference",
      "confidence": 0.0 to 1.0,
      "supportingEvidence": ["PR #XXX: brief quote", "PR #YYY: brief quote"]
    }
  ]
}

Extract at most 8 rules. Only include a rule if you have at least one concrete review comment supporting it. If you can't find any confident rules, return {"rules": []}.`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? "anthropic/claude-3.5-haiku",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter mining call failed: ${res.status} ${await res.text()}`);
  }

  const body = await res.json();
  const content: string = body?.choices?.[0]?.message?.content ?? "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { rules: [], prsAnalyzed: prs.length };

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { rules: MinedRule[] };
    const rules = (parsed.rules ?? []).filter(
      (r) => r.ruleKey && r.ruleText && r.category && r.strength,
    );
    return { rules, prsAnalyzed: prs.length };
  } catch {
    return { rules: [], prsAnalyzed: prs.length };
  }
}
