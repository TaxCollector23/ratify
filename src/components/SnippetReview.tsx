"use client";

import { useState } from "react";

interface Finding {
  ruleKey: string;
  title: string;
  description: string;
  filePath?: string;
  severity: "low" | "medium" | "high";
  confidence: number;
  source: "policy-engine" | "llm-reasoner";
  modelId?: string;
  corroborated?: boolean;
  agreedBy?: string[];
}

interface Vote {
  provider: string;
  model: string;
  decision: "allow" | "warn" | "require_approval" | "block";
  confidence: number;
  reasoning: string;
  error: string | null;
}

interface ReviewResponse {
  ok: boolean;
  findings: Finding[];
  summary: string | null;
  verdict: "allow" | "warn" | "require_approval" | "block" | null;
  consensusConfidence: number | null;
  votes: Vote[];
  timing: { totalMs: number; deterministicMs: number; llmMs: number };
  filename: string;
  linesReviewed: number;
}

const EXAMPLES: Record<string, { code: string; language: string }> = {
  "TypeScript API handler": {
    language: "typescript",
    code: `import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const apiKey = "AKIAIOSFODNN7EXAMPLE";
  try {
    fetch("https://api.example.com/charge", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (err) {}

  return NextResponse.json({ ok: true });
}
`,
  },
  "React component with any": {
    language: "typescript",
    code: `import { useState } from "react";

export function UserProfile(props: any) {
  const [user, setUser] = useState<any>(null);

  const handleClick = (e: any) => {
    console.log("clicked", e);
    updateUser(props.id, user);
  };

  return <button onClick={handleClick}>Update</button>;
}
`,
  },
  "Payments logic": {
    language: "typescript",
    code: `export async function chargeCustomer(customerId: string, amountCents: number) {
  const customer = await db.query.customers.findFirst({ where: { id: customerId } });
  if (!customer) return null;

  const result = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    customer: customer.stripeId,
  });

  return result;
}
`,
  },
};

const SEVERITY_STYLES: Record<string, string> = {
  high: "bg-danger/10 text-danger border-danger/30",
  medium: "bg-warning/10 text-warning border-warning/30",
  low: "bg-muted/10 text-muted border-border",
};

const VERDICT_STYLES: Record<string, { label: string; className: string }> = {
  allow: { label: "Allow", className: "bg-success/10 text-success border-success/30" },
  warn: { label: "Warn", className: "bg-warning/10 text-warning border-warning/30" },
  require_approval: { label: "Requires human approval", className: "bg-warning/10 text-warning border-warning/30" },
  block: { label: "Block", className: "bg-danger/10 text-danger border-danger/30" },
};

export default function SnippetReview() {
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState<"typescript" | "javascript" | "python" | "go" | "rust" | "auto">("typescript");
  const [filename, setFilename] = useState("snippet.ts");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResponse | null>(null);

  const loadExample = (name: string) => {
    const ex = EXAMPLES[name];
    if (!ex) return;
    setCode(ex.code);
    setLanguage(ex.language as typeof language);
    setFilename(`example.${ex.language === "typescript" ? "ts" : "js"}`);
  };

  const submit = async () => {
    if (!code.trim()) {
      setError("Paste some code first.");
      return;
    }
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/review-snippet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, filename, language }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setResult(body);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[1fr_1fr] gap-8">
      {/* Left: input */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-semibold text-muted uppercase tracking-wider">Your code</label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Try an example:</span>
            {Object.keys(EXAMPLES).map((k) => (
              <button
                key={k}
                onClick={() => loadExample(k)}
                className="text-xs text-primary hover:text-primary-hover"
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          <input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="filename.ts"
            className="flex-1 text-sm px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:border-primary/50"
          />
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as typeof language)}
            className="text-sm px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:border-primary/50"
          >
            <option value="typescript">TypeScript</option>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="go">Go</option>
            <option value="rust">Rust</option>
            <option value="auto">Auto-detect</option>
          </select>
        </div>

        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Paste code here…"
          spellCheck={false}
          className="w-full h-[500px] font-mono text-[13px] leading-relaxed p-4 rounded-xl border border-border bg-white focus:outline-none focus:border-primary/50 resize-none"
        />

        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-muted">
            {code.length.toLocaleString()} chars · {code.split("\n").length} lines
          </span>
          <button
            onClick={submit}
            disabled={loading || !code.trim()}
            className="inline-flex items-center justify-center text-sm font-medium text-white bg-primary hover:bg-primary-hover px-6 py-2.5 rounded-lg disabled:opacity-50"
          >
            {loading ? "Reviewing…" : "Review"}
          </button>
        </div>
      </div>

      {/* Right: results */}
      <div>
        <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 block">Findings</label>

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/[0.04] p-4 text-sm text-danger">{error}</div>
        )}

        {loading && !result && (
          <div className="rounded-xl border border-border p-6 text-sm text-secondary">
            Running deterministic policy checks + AST analysis + 3-LLM consensus panel in parallel. Usually 5–20 seconds…
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Verdict card */}
            <div className="rounded-xl border border-border bg-white p-5">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="text-xs text-muted">
                  {result.linesReviewed} lines · {(result.timing.totalMs / 1000).toFixed(1)}s total
                </div>
                <div className="text-xs text-muted">
                  deterministic {result.timing.deterministicMs}ms · reasoning {(result.timing.llmMs / 1000).toFixed(1)}s
                </div>
              </div>
              {result.verdict && (
                <div className="flex items-center gap-3 mb-3">
                  <span className={`text-xs font-medium uppercase tracking-wider px-2.5 py-1 rounded border ${VERDICT_STYLES[result.verdict]?.className ?? SEVERITY_STYLES.low}`}>
                    Consensus: {VERDICT_STYLES[result.verdict]?.label ?? result.verdict}
                  </span>
                  {result.consensusConfidence !== null && (
                    <span className="text-xs text-secondary">
                      confidence {(result.consensusConfidence * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              )}
              {result.summary && <p className="text-sm text-foreground leading-relaxed mb-3">{result.summary}</p>}
              {result.votes.length > 0 && (
                <div className="space-y-1.5 pt-3 border-t border-border">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Panel votes</div>
                  {result.votes.map((v) => (
                    <div key={`${v.provider}/${v.model}`} className="flex items-start gap-3 text-xs">
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${VERDICT_STYLES[v.decision]?.className ?? SEVERITY_STYLES.low}`}>
                        {v.decision}
                      </span>
                      <code className="text-muted shrink-0">{v.model}</code>
                      <span className="text-secondary tabular-nums shrink-0">{(v.confidence * 100).toFixed(0)}%</span>
                      {v.error ? <span className="text-danger truncate">· {v.error}</span> : v.reasoning && <span className="text-secondary truncate">· {v.reasoning}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {result.findings.length === 0 ? (
              <div className="rounded-xl border border-success/20 bg-success/[0.03] p-6 text-sm text-secondary">
                No findings. Every check passed and the model panel didn&apos;t raise anything.
              </div>
            ) : (
              result.findings.map((f, i) => (
                <div key={i} className="rounded-xl border border-border bg-white p-4">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[11px] font-medium uppercase tracking-wider px-2 py-0.5 rounded border ${SEVERITY_STYLES[f.severity] ?? SEVERITY_STYLES.low}`}>
                      {f.severity}
                    </span>
                    <span className="text-[11px] text-muted">
                      {f.source === "policy-engine"
                        ? (f.ruleKey.startsWith("ast-") ? "AST analysis" : "policy engine")
                        : "model panel"}
                      {" · "}confidence {(f.confidence * 100).toFixed(0)}%
                      {f.corroborated && f.agreedBy && f.agreedBy.length > 1 && (
                        <> · <span className="text-success">{f.agreedBy.length} models agreed</span></>
                      )}
                      {f.modelId && !f.corroborated && (
                        <> · flagged by <code>{f.modelId.split("/").pop()}</code></>
                      )}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">{f.title}</h3>
                  <p className="text-sm text-secondary leading-relaxed">{f.description}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
