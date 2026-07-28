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
Only include findings that are NOT already covered by the deterministic checks above. Flag violations of any repository doctrine listed above. If there is nothing new to add, return an empty findings array.`;

  const model = process.env.OPENROUTER_MODEL ?? "google/gemma-4-26b-a4b-it:free";
  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // OpenRouter uses these to attribute traffic to the source app.
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
    console.error(`[llm-reason] network error calling OpenRouter (model=${model}):`, err);
    return null;
  }

  const responseText = await res.text();

  if (!res.ok) {
    console.error(`[llm-reason] OpenRouter ${res.status} for model=${model}: ${responseText.slice(0, 400)}`);
    return null;
  }

  let body: { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  try {
    body = JSON.parse(responseText);
  } catch {
    console.error(`[llm-reason] non-JSON response from OpenRouter: ${responseText.slice(0, 200)}`);
    return null;
  }

  if (body.error?.message) {
    console.error(`[llm-reason] OpenRouter reported error: ${body.error.message}`);
    return null;
  }

  const content = body.choices?.[0]?.message?.content ?? "";
  if (!content) {
    console.error(`[llm-reason] empty content from OpenRouter (model=${model})`);
    return null;
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
