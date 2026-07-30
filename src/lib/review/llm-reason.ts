import type { PrFile, PolicyFinding } from "./policy-checks";
import { aggregate, defaultSlots, type ConsensusVote, type ConsensusVerdict, type Decision } from "./trace-consensus";

export interface LlmFinding {
  ruleKey: string;
  title: string;
  description: string;
  filePath?: string;
  severity: "low" | "medium" | "high";
  confidence: number;
  source: "llm-reasoner";
}

export interface LlmReasoningResult {
  summary: string;
  findings: LlmFinding[];
  /** Panel consensus verdict — new. Backward compatible: existing callers
   *  that only read summary/findings continue to work. */
  verdict?: Decision;
  /** Per-model votes with reasoning, for the "not-a-black-box" review UI. */
  votes?: ConsensusVote[];
  /** Blended panel confidence [0,1], boosted by cross-model agreement. */
  consensusConfidence?: number;
}

export interface DoctrineRuleForPrompt {
  ruleText: string;
  category: string;
  strength: string;
}

/**
 * Runs Trace's 3-LLM consensus panel on this PR. Each model is asked for the
 * same shape (verdict + summary + findings); decisions feed the consensus
 * (with confident-dissent escalation), and the findings from the model that
 * matched the consensus are returned to the reviewer UI.
 *
 * Returns null (rather than throwing) when no OPENROUTER_API_KEY is
 * configured, so the pipeline degrades gracefully to policy-only.
 */
export async function runLlmReasoning(
  prTitle: string,
  files: PrFile[],
  policyFindings: PolicyFinding[],
  doctrineRules: DoctrineRuleForPrompt[] = [],
): Promise<LlmReasoningResult | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const diffSummary = files
    .slice(0, 20)
    .map((f) => `--- ${f.filename} (+${f.additions}/-${f.deletions}) ---\n${(f.patch ?? "").slice(0, 1500)}`)
    .join("\n\n");

  const doctrineSection =
    doctrineRules.length > 0
      ? `Repository doctrine (mined from this repo's own review history — evaluate the diff against these first):\n${doctrineRules
          .slice(0, 20)
          .map((r) => `- [${r.strength} · ${r.category}] ${r.ruleText}`)
          .join("\n")}\n\n`
      : "";

  const prompt = `You are one of three independent reviewers on a Trace Ratification panel judging a pull request titled "${prTitle}".
Judge it on its own merits — you do not know what the other two reviewers will say. Your verdict feeds a consensus.

${doctrineSection}Deterministic checks already found:
${policyFindings.length > 0 ? policyFindings.map((f) => `- ${f.title}: ${f.description}`).join("\n") : "(none)"}

Diff:
${diffSummary}

Respond with ONLY a JSON object of this exact shape, no prose outside the JSON:
{
  "verdict": "allow|warn|require_approval|block",
  "confidence": 0.0-1.0,
  "summary": "one or two sentence overall assessment",
  "findings": [
    { "ruleKey": "short-kebab-key", "title": "short title", "description": "one sentence", "filePath": "optional", "severity": "low|medium|high", "confidence": 0.0-1.0 }
  ]
}

Verdict rubric:
- allow: no material issues; ship as-is.
- warn: minor issue worth flagging (todos, small style violations) but not worth blocking.
- require_approval: architectural concern, contract change without doc update, or plausible misunderstanding — a human should confirm.
- block: actively dangerous — removed auth/tests, committed secrets, obvious data-loss risk, SQL injection/XSS/path-traversal.

Severity grading for findings (be strict):
- HIGH: removed/disabled authentication or authorization; secrets/API keys/tokens committed; SQL injection, XSS, or path-traversal risk; deletion of payment/billing safeguards; removal of an existing test on sensitive code; obvious data-loss risk in a migration.
- MEDIUM: architectural violation; new external dependency without a stated rationale; API contract change without a doc/CHANGELOG update; race condition or memory leak.
- LOW: TODO/debug leftovers; minor style/naming; missing JSDoc on new exports.

Only include findings that are NOT already covered by the deterministic checks above. Flag violations of any repository doctrine listed above. If nothing new to add, return an empty findings array.`;

  interface PanelPayload {
    vote: ConsensusVote;
    summary: string;
    findings: LlmFinding[];
  }

  const slots = defaultSlots();
  const results = await Promise.all(
    slots.map(async (slot): Promise<PanelPayload> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      const baseVote: ConsensusVote = {
        provider: slot.provider,
        model: slot.model,
        decision: "allow",
        confidence: 0,
        reasoning: "",
        error: null,
      };
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.RATIFY_PUBLIC_URL ?? "https://ratify-zeta-dusky.vercel.app",
            "X-Title": "Trace Ratification",
          },
          body: JSON.stringify({
            model: slot.model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
          }),
        });
        const text = await res.text();
        if (!res.ok) {
          return { vote: { ...baseVote, error: `HTTP ${res.status}: ${text.slice(0, 200)}` }, summary: "", findings: [] };
        }
        const parsed = JSON.parse(text) as {
          choices?: Array<{ message?: { content?: string } }>;
          error?: { message?: string };
        };
        if (parsed.error?.message) {
          return { vote: { ...baseVote, error: parsed.error.message }, summary: "", findings: [] };
        }
        const content = parsed.choices?.[0]?.message?.content ?? "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          return { vote: { ...baseVote, error: `no JSON in output: ${content.slice(0, 200)}` }, summary: "", findings: [] };
        }
        const model = JSON.parse(jsonMatch[0]) as {
          verdict?: string;
          confidence?: number;
          summary?: string;
          findings?: Omit<LlmFinding, "source">[];
        };
        const decision = normalizeDecision(model.verdict);
        const findings = (model.findings ?? []).map((f) => ({ ...f, source: "llm-reasoner" as const }));
        return {
          vote: {
            ...baseVote,
            decision,
            confidence: Math.max(0, Math.min(1, Number(model.confidence ?? 0.5))),
            reasoning: model.summary ?? "",
          },
          summary: model.summary ?? "",
          findings,
        };
      } catch (err) {
        return { vote: { ...baseVote, error: String(err) }, summary: "", findings: [] };
      } finally {
        clearTimeout(timeout);
      }
    }),
  );

  const verdict: ConsensusVerdict = aggregate(results.map((r) => r.vote));
  if (verdict.votes.every((v) => v.error !== null)) {
    console.error(`[llm-reason] every model in panel failed:`, verdict.votes.map((v) => `${v.model}: ${v.error}`).join("; "));
    return null;
  }

  // Prefer the summary/findings from a successful vote that matched the
  // consensus. If none do (rare — only happens when the strong-dissent
  // escalation swings the verdict), fall back to the highest-confidence
  // successful vote so the reviewer still gets rich findings.
  const successful = results.filter((r) => r.vote.error === null);
  const matching = successful.find((r) => r.vote.decision === verdict.consensus);
  const chosen = matching ?? successful.sort((a, b) => b.vote.confidence - a.vote.confidence)[0];

  return {
    summary: chosen.summary || verdict.summary,
    findings: dedupeFindings(successful.flatMap((r) => r.findings)),
    verdict: verdict.consensus,
    votes: verdict.votes,
    consensusConfidence: verdict.confidence,
  };
}

function normalizeDecision(s: string | undefined): Decision {
  if (!s) return "allow";
  const v = s.trim().toLowerCase();
  if (v === "block") return "block";
  if (v === "require_approval" || v === "require-approval") return "require_approval";
  if (v === "warn") return "warn";
  return "allow";
}

/** When two or more models flag the same rule on the same file, keep one
 *  copy but boost its confidence — cross-model corroboration mirrors the
 *  consensus boost applied to the verdict. */
function dedupeFindings(all: LlmFinding[]): LlmFinding[] {
  const bucket = new Map<string, LlmFinding[]>();
  for (const f of all) {
    const key = `${f.ruleKey}::${f.filePath ?? ""}`;
    const arr = bucket.get(key) ?? [];
    arr.push(f);
    bucket.set(key, arr);
  }
  return Array.from(bucket.values()).map((group) => {
    const best = group.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    if (group.length === 1) return best;
    const boost = Math.min(0.15, 0.05 * (group.length - 1));
    return { ...best, confidence: Math.min(1, best.confidence + boost) };
  });
}
