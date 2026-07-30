// 3-LLM consensus panel — ported from Trace's Rust `trace-core/src/judge.rs`
// so Ratify's PR grading uses the same intelligence backbone as Trace's local
// agent-action review. Same OpenRouter key, three independent models in
// parallel, one consensus verdict with confident-dissent escalation.
//
// The consensus math and safety properties match the Rust implementation
// tests (see judge.rs::tests): agreement > individual confidence,
// escalation is one-directional (never de-escalates), single-model panel
// is discounted, empty panel degrades gracefully to allow+0.

export type Decision = "allow" | "warn" | "require_approval" | "block";

export interface ConsensusVote {
  provider: string;
  model: string;
  decision: Decision;
  confidence: number;
  reasoning: string;
  error: string | null;
}

export interface ConsensusVerdict {
  votes: ConsensusVote[];
  consensus: Decision;
  /** Blended confidence [0,1]. Agreement between independent models is
   *  worth more than any single model's raw confidence. */
  confidence: number;
  /** Fraction of successful votes that matched the consensus decision. */
  agreement: number;
  summary: string;
}

interface Slot {
  provider: string;
  model: string;
}

/** The default panel: three different labs' free models on OpenRouter so a
 *  fresh install works with no credits. Override via `TRACE_JUDGE_MODELS`
 *  (comma-separated) to run on paid frontier models. */
export function defaultSlots(): Slot[] {
  const env = process.env.TRACE_JUDGE_MODELS;
  if (env) {
    return env
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean)
      .map((model) => ({ provider: "openrouter", model }));
  }
  return [
    { provider: "openrouter", model: "openai/gpt-oss-20b:free" },
    { provider: "openrouter", model: "google/gemma-4-31b-it:free" },
    { provider: "openrouter", model: "cohere/north-mini-code:free" },
  ];
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

interface RawVerdict {
  decision: string;
  confidence: number;
  reasoning: string;
}

function parseDecision(s: string): Decision {
  const v = s.trim().toLowerCase();
  if (v === "block") return "block";
  if (v === "require_approval" || v === "require-approval") return "require_approval";
  if (v === "warn") return "warn";
  return "allow";
}

function decisionRank(d: Decision): number {
  return { allow: 0, warn: 1, require_approval: 2, block: 3 }[d];
}

function extractJson(text: string): RawVerdict | null {
  const cleaned = text.trim().replace(/^```json/, "").replace(/^```/, "").replace(/```$/, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const p = JSON.parse(match[0]) as Partial<RawVerdict>;
    if (typeof p.decision !== "string" || typeof p.confidence !== "number" || typeof p.reasoning !== "string") {
      return null;
    }
    return { decision: p.decision, confidence: p.confidence, reasoning: p.reasoning };
  } catch {
    return null;
  }
}

async function callSlot(slot: Slot, prompt: string, apiKey: string): Promise<ConsensusVote> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(OPENROUTER_URL, {
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
      return { ...slot, decision: "allow", confidence: 0, reasoning: "", error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const parsed = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    if (parsed.error?.message) {
      return { ...slot, decision: "allow", confidence: 0, reasoning: "", error: parsed.error.message };
    }
    const content = parsed.choices?.[0]?.message?.content ?? "";
    const raw = extractJson(content);
    if (!raw) {
      return { ...slot, decision: "allow", confidence: 0, reasoning: "", error: `unparseable model output: ${content.slice(0, 200)}` };
    }
    return {
      ...slot,
      decision: parseDecision(raw.decision),
      confidence: Math.max(0, Math.min(1, raw.confidence)),
      reasoning: raw.reasoning,
      error: null,
    };
  } catch (err) {
    return { ...slot, decision: "allow", confidence: 0, reasoning: "", error: String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

/** Aggregate matches Rust `judge::aggregate` exactly. Ties break toward the
 *  more cautious option; a single strongly-confident dissenter (≥0.85) that
 *  votes MORE cautious than the majority overrides the tally — deliberately
 *  one-directional, since the panel exists to catch a real problem the
 *  majority might have missed. Confident-dissent can never DE-escalate. */
export function aggregate(votes: ConsensusVote[]): ConsensusVerdict {
  const successful = votes.filter((v) => v.error === null);
  if (successful.length === 0) {
    return {
      votes,
      consensus: "allow",
      confidence: 0,
      agreement: 0,
      summary: "Judge panel unavailable — no successful votes; falling back to deterministic checks only.",
    };
  }

  const tally = new Map<Decision, { count: number; sumConfidence: number }>();
  for (const v of successful) {
    const cur = tally.get(v.decision) ?? { count: 0, sumConfidence: 0 };
    cur.count += 1;
    cur.sumConfidence += v.confidence;
    tally.set(v.decision, cur);
  }
  let consensus: Decision = "allow";
  let bestCount = -1;
  for (const [d, t] of tally) {
    if (t.count > bestCount || (t.count === bestCount && decisionRank(d) > decisionRank(consensus))) {
      consensus = d;
      bestCount = t.count;
    }
  }

  const STRONG_DISSENT_THRESHOLD = 0.85;
  const strongDissenters = successful
    .filter((v) => decisionRank(v.decision) > decisionRank(consensus) && v.confidence >= STRONG_DISSENT_THRESHOLD)
    .sort((a, b) => decisionRank(b.decision) - decisionRank(a.decision));
  if (strongDissenters.length > 0) {
    consensus = strongDissenters[0].decision;
  }

  const agreeing = successful.filter((v) => v.decision === consensus);
  const agreement = agreeing.length / successful.length;
  const avgAgreeingConfidence = agreeing.reduce((s, v) => s + v.confidence, 0) / agreeing.length;
  const corroborationBoost = agreeing.length > 1 ? 0.15 : 0;
  const singleSourceDiscount = successful.length === 1 ? 0.1 : 0;
  const confidence = Math.max(0, Math.min(1, avgAgreeingConfidence + corroborationBoost - singleSourceDiscount));

  const summary =
    agreement >= 0.999
      ? `All ${successful.length} reviewers agreed: ${consensus.replace(/_/g, " ")}.`
      : `${agreeing.length}/${successful.length} reviewers landed on ${consensus.replace(/_/g, " ")} (panel split); most cautious reasoning: ${
          successful.slice().sort((a, b) => decisionRank(b.decision) - decisionRank(a.decision))[0].reasoning
        }`;

  return { votes, consensus, confidence, agreement, summary };
}

/** Fan out to N slots in parallel and consense the results. Returns null
 *  if OPENROUTER_API_KEY is unset so the caller can degrade gracefully. */
export async function runConsensus(prompt: string, slots: Slot[] = defaultSlots()): Promise<ConsensusVerdict | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const votes = await Promise.all(slots.map((s) => callSlot(s, prompt, apiKey)));
  return aggregate(votes);
}
