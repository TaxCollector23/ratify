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

/** Returns null (rather than throwing) when no OPENROUTER_API_KEY is configured, so the pipeline degrades gracefully. */
export async function runLlmReasoning(
  prTitle: string,
  files: PrFile[],
  policyFindings: PolicyFinding[],
): Promise<LlmReasoningResult | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const diffSummary = files
    .slice(0, 20)
    .map((f) => `--- ${f.filename} (+${f.additions}/-${f.deletions}) ---\n${(f.patch ?? "").slice(0, 1500)}`)
    .join("\n\n");

  const prompt = `You are a senior engineer reviewing a pull request titled "${prTitle}".

Deterministic checks already found:
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
Only include findings that are NOT already covered by the deterministic checks above. If there is nothing new to add, return an empty findings array.`;

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
    console.error("OpenRouter call failed:", res.status, await res.text());
    return null;
  }

  const body = await res.json();
  const content: string = body?.choices?.[0]?.message?.content ?? "";

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as { summary: string; findings: Omit<LlmFinding, "source">[] };
    return {
      summary: parsed.summary,
      findings: (parsed.findings ?? []).map((f) => ({ ...f, source: "llm-reasoner" as const })),
    };
  } catch (err) {
    console.error("Failed to parse LLM response:", err, content);
    return null;
  }
}
