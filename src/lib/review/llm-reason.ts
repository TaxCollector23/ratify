import type { PrFile, PolicyFinding } from "./policy-checks";

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
}

export interface DoctrineRuleForPrompt {
  ruleText: string;
  category: string;
  strength: string;
}

/** Returns null (rather than throwing) when no OPENROUTER_API_KEY is configured, so the pipeline degrades gracefully. */
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

  const prompt = `You are a senior engineer reviewing a pull request titled "${prTitle}".

${doctrineSection}Deterministic checks already found:
${policyFindings.length > 0 ? policyFindings.map((f) => `- ${f.title}: ${f.description}`).join("\n") : "(none)"}

Diff:
${diffSummary}

Respond with ONLY a JSON object of this exact shape, no prose outside the JSON:
{
  "summary": "one or two sentence overall assessment",
  "findings": [
    { "ruleKey": "short-kebab-key", "title": "short title", "description": "one sentence", "filePath": "optional", "severity": "low|medium|high", "confidence": 0.0-1.0 }
  ]
}

Severity grading (be strict):
- HIGH: removed/disabled authentication or authorization; secrets/API keys/tokens committed; SQL injection, XSS, or path-traversal risk; deletion of payment/billing safeguards; removal of an existing test on sensitive code; obvious data-loss risk in a migration.
- MEDIUM: architectural violation (e.g. handler talking directly to the database when the repo uses a service layer); new external dependency without a stated rationale; API contract change without a corresponding doc/CHANGELOG update; introduction of a race condition or memory leak.
- LOW: TODO/debug leftovers; minor style/naming; missing JSDoc on new exports.

Only include findings that are NOT already covered by the deterministic checks above. Flag violations of any repository doctrine listed above. If there is nothing new to add, return an empty findings array.`;

  // Fallback chain: primary (large/best) → secondary (broadly-available) →
  // tertiary. All are currently-free on OpenRouter. If the primary is rate
  // limited (NVIDIA Nemotron caps at ~32 concurrent workers) we transparently
  // fall through instead of returning null. Env var overrides just the head.
  const primary = process.env.OPENROUTER_MODEL ?? "nvidia/nemotron-3-ultra-550b-a55b:free";
  const chain = Array.from(new Set([primary, "google/gemma-4-26b-a4b-it:free", "openai/gpt-oss-20b:free"]));

  const callOnce = async (model: string): Promise<{ content: string; model: string } | { error: string; retriable: boolean }> => {
    let res: Response;
    try {
      res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.RATIFY_PUBLIC_URL ?? "https://ratify-zeta-dusky.vercel.app",
          "X-Title": "Ratify",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
        }),
      });
    } catch (err) {
      return { error: `network: ${String(err)}`, retriable: true };
    }

    const text = await res.text();
    if (!res.ok) return { error: `HTTP ${res.status}: ${text.slice(0, 200)}`, retriable: res.status >= 500 || res.status === 429 };

    let parsed: { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    try { parsed = JSON.parse(text); }
    catch { return { error: `non-JSON: ${text.slice(0, 120)}`, retriable: false }; }

    if (parsed.error?.message) {
      const msg = parsed.error.message;
      const retriable = /rate limit|resource ?exhaust|worker.*(local|limit)|temporarily|try again/i.test(msg);
      return { error: msg, retriable };
    }

    const c = parsed.choices?.[0]?.message?.content ?? "";
    if (!c) return { error: "empty content", retriable: true };
    return { content: c, model };
  };

  let winner: { content: string; model: string } | null = null;
  for (const m of chain) {
    const result = await callOnce(m);
    if ("content" in result) {
      winner = result;
      break;
    }
    console.error(`[llm-reason] model=${m} failed: ${result.error}${result.retriable ? " — falling through" : " — non-retriable, still trying next"}`);
  }

  if (!winner) {
    console.error(`[llm-reason] every model in fallback chain failed`);
    return null;
  }
  const { content, model: usedModel } = winner;
  if (usedModel !== primary) {
    console.warn(`[llm-reason] primary=${primary} unavailable; used fallback=${usedModel}`);
  }

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`[llm-reason] no JSON object found in model output (first 200 chars): ${content.slice(0, 200)}`);
      return null;
    }
    const parsed = JSON.parse(jsonMatch[0]) as { summary?: string; findings?: Omit<LlmFinding, "source">[] };
    return {
      summary: parsed.summary ?? "",
      findings: (parsed.findings ?? []).map((f) => ({ ...f, source: "llm-reasoner" as const })),
    };
  } catch (err) {
    console.error(`[llm-reason] JSON parse failed:`, err, `content: ${content.slice(0, 200)}`);
    return null;
  }
}
