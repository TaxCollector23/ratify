"use client";

import { useEffect, useState } from "react";

interface Rule {
  id: string;
  ruleText: string;
  category: string;
  strength: string;
  confidence: number;
  supportingEvidence: string[] | null;
}

interface MiningStatus {
  status: string;
  rulesFound: number;
  prsAnalyzed: number;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

export default function DoctrineViewer() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [miningStatus, setMiningStatus] = useState<MiningStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;

    async function load() {
      try {
        const res = await fetch("/api/doctrine", { cache: "no-store" });
        if (!res.ok) {
          setError("Could not load doctrine.");
          return;
        }
        const data = await res.json();
        if (stopped) return;
        setRules(data.rules ?? []);
        setMiningStatus(data.miningStatus ?? null);
      } catch {
        setError("Network error loading doctrine.");
      }
    }

    void load();

    // If mining is running, poll every 5s until it settles.
    const interval = setInterval(() => {
      if (miningStatus?.status === "running") void load();
    }, 5000);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [miningStatus?.status]);

  if (error) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/[0.04] p-4 text-sm text-danger">{error}</div>
    );
  }

  if (rules === null) {
    return <p className="text-sm text-secondary">Loading doctrine…</p>;
  }

  if (miningStatus?.status === "running") {
    return (
      <div className="rounded-2xl border border-border p-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <p className="text-sm font-medium text-foreground">Mining doctrine…</p>
        </div>
        <p className="text-sm text-secondary">
          Ratify is analyzing your repository&apos;s recent merged pull requests to extract
          the rules your team already enforces. This takes about 30 seconds.
        </p>
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="rounded-2xl border border-border p-6">
        <p className="text-sm text-secondary">
          No doctrine rules discovered yet. This can happen on very new repos, repos with
          few merged PRs, or when the OpenRouter API key is not configured.
        </p>
        {miningStatus?.status === "failed" && miningStatus.error && (
          <p className="text-xs text-danger mt-2">Last mining attempt failed: {miningStatus.error.slice(0, 200)}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {miningStatus?.status === "completed" && (
        <p className="text-xs text-muted">
          Analyzed {miningStatus.prsAnalyzed} merged PRs · {rules.length} rule
          {rules.length === 1 ? "" : "s"} discovered
        </p>
      )}
      {rules.map((rule) => (
        <div key={rule.id} className="rounded-xl border border-border bg-white p-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="text-sm font-medium text-foreground">{rule.ruleText}</p>
            <span
              className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
                rule.strength === "hard-rule"
                  ? "bg-danger/10 text-danger"
                  : rule.strength === "soft-norm"
                  ? "bg-primary/10 text-primary"
                  : "bg-surface text-muted border border-border"
              }`}
            >
              {rule.strength.replace("-", " ")}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="uppercase tracking-wider">{rule.category}</span>
            <span>·</span>
            <span>{Math.round(rule.confidence * 100)}% confidence</span>
          </div>
          {rule.supportingEvidence && rule.supportingEvidence.length > 0 && (
            <details className="mt-3">
              <summary className="text-xs text-primary cursor-pointer">
                {rule.supportingEvidence.length} supporting {rule.supportingEvidence.length === 1 ? "quote" : "quotes"}
              </summary>
              <ul className="mt-2 space-y-1.5">
                {rule.supportingEvidence.map((e, i) => (
                  <li key={i} className="text-xs text-secondary leading-relaxed pl-3 border-l-2 border-border">
                    {e}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
