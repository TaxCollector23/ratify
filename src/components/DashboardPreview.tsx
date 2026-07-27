"use client";

import { useState } from "react";

const repoCards = [
  { name: "payments-api", status: "healthy", reviews: 24, openPrs: 4, passRate: "97%" },
  { name: "platform-core", status: "healthy", reviews: 18, openPrs: 3, passRate: "99%" },
  { name: "mobile-app", status: "warning", reviews: 9, openPrs: 2, passRate: "88%" },
  { name: "infrastructure", status: "healthy", reviews: 31, openPrs: 5, passRate: "96%" },
];

const checksByRepo: Record<string, { label: string; status: "pass" | "warn"; evidence: string }[]> = {
  "payments-api": [
    { label: "Architecture", status: "pass", evidence: "Matches the middleware pattern used in 14 prior payments PRs." },
    { label: "Tests", status: "pass", evidence: "Integration test coverage added for the new charge path." },
    { label: "Performance regression", status: "warn", evidence: "P95 latency on /charge increased ~4ms in the benchmark run." },
    { label: "Documentation", status: "pass", evidence: "CHANGELOG and API docs updated in the same commit." },
  ],
  "platform-core": [
    { label: "Architecture", status: "pass", evidence: "No violation of the service boundary graph." },
    { label: "Tests", status: "pass", evidence: "Unit tests cover the new allocator path." },
    { label: "Performance regression", status: "pass", evidence: "Benchmark suite shows no regression." },
    { label: "Documentation", status: "pass", evidence: "Internal doc comment added to the exported function." },
  ],
  "mobile-app": [
    { label: "Architecture", status: "warn", evidence: "Retry logic bypasses the shared network layer." },
    { label: "Tests", status: "warn", evidence: "No test added for the new retry path." },
    { label: "Performance regression", status: "pass", evidence: "No measurable change in cold start time." },
    { label: "Documentation", status: "pass", evidence: "No public API changed." },
  ],
  infrastructure: [
    { label: "Architecture", status: "pass", evidence: "Terraform module follows the existing resource layout." },
    { label: "Tests", status: "pass", evidence: "Plan output validated in CI." },
    { label: "Performance regression", status: "pass", evidence: "Not applicable to this change." },
    { label: "Documentation", status: "pass", evidence: "Resource limits documented in the module README." },
  ],
};

const decisionsByRepo: Record<string, { id: number; title: string; desc: string; risk: "low" | "medium" }[]> = {
  "payments-api": [
    { id: 1, title: "PR #248 Approved", desc: "Auth middleware standardized across handlers", risk: "low" },
    { id: 2, title: "PR #246 Merged", desc: "Idempotency key added to charge endpoint", risk: "low" },
  ],
  "platform-core": [{ id: 3, title: "PR #249 Merged", desc: "Memory allocation improved in hot path", risk: "low" }],
  "mobile-app": [{ id: 4, title: "PR #250 Changes requested", desc: "Unsafe retry logic flagged for review", risk: "medium" }],
  infrastructure: [{ id: 5, title: "PR #251 Pending", desc: "K8s resource limits updated for worker pool", risk: "low" }],
};

export default function DashboardPreview() {
  const [activeRepo, setActiveRepo] = useState("payments-api");
  const [openCheck, setOpenCheck] = useState<string | null>("Performance regression");

  const checks = checksByRepo[activeRepo] ?? [];
  const decisions = decisionsByRepo[activeRepo] ?? [];
  const active = repoCards.find((r) => r.name === activeRepo);
  const passCount = checks.filter((c) => c.status === "pass").length;
  const riskScore = Math.round((passCount / Math.max(checks.length, 1)) * 100);

  return (
    <div className="w-full rounded-2xl border border-border bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.12)]">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-surface">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M2 7.5L5.5 11L12 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-sm font-medium text-foreground">Live PR Review</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-success" />
          <span className="text-xs text-secondary">Reviewing</span>
        </div>
      </div>

      <div className="grid sm:grid-cols-[200px_1fr]">
        {/* Left: Repository list */}
        <div className="border-b sm:border-b-0 sm:border-r border-border p-3">
          <h4 className="text-[11px] font-semibold text-muted uppercase tracking-wider px-2 mb-1.5">Repositories</h4>
          <div className="flex sm:flex-col gap-1 overflow-x-auto">
            {repoCards.map((repo) => (
              <button
                key={repo.name}
                onClick={() => setActiveRepo(repo.name)}
                className={`shrink-0 sm:w-full text-left px-3 py-2 rounded-lg transition-colors duration-150 flex items-center gap-2 justify-between ${
                  activeRepo === repo.name ? "bg-primary/[0.07] text-foreground" : "hover:bg-surface text-secondary"
                }`}
              >
                <span className="text-[13px] font-medium whitespace-nowrap">{repo.name}</span>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${repo.status === "healthy" ? "bg-success" : "bg-warning"}`} />
              </button>
            ))}
          </div>
        </div>

        {/* Right: Detail panel */}
        <div className="p-5 space-y-5">
          {/* Risk score + meta */}
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[11px] text-muted uppercase tracking-wider mb-1">Risk score</div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold text-foreground tabular-nums">{riskScore}%</span>
                <span className="text-xs font-medium text-success">Low risk</span>
              </div>
            </div>
            <div className="text-right text-xs text-secondary leading-relaxed">
              <div>{active?.openPrs} open PRs</div>
              <div>
                Pass rate <span className="text-foreground font-medium">{active?.passRate}</span>
              </div>
            </div>
          </div>

          {/* Checks */}
          <div>
            <h4 className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Checks</h4>
            <div className="space-y-1">
              {checks.map((check) => (
                <div key={check.label} className="rounded-lg border border-transparent hover:border-border transition-colors">
                  <button
                    onClick={() => setOpenCheck(openCheck === check.label ? null : check.label)}
                    className="w-full flex items-center justify-between py-2 px-2.5 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${check.status === "pass" ? "text-success" : "text-warning"}`}>
                        {check.status === "pass" ? "✓" : "⚠"}
                      </span>
                      <span className="text-[13px] text-foreground font-medium">{check.label}</span>
                    </div>
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        check.status === "pass" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                      }`}
                    >
                      {check.status === "pass" ? "Pass" : "Warning"}
                    </span>
                  </button>
                  {openCheck === check.label && (
                    <p className="px-2.5 pb-2.5 text-[12px] text-secondary leading-relaxed">{check.evidence}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Recent decisions */}
          <div>
            <h4 className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Recent decisions</h4>
            <div className="space-y-1">
              {decisions.map((pr) => (
                <div key={pr.id} className="flex items-start gap-2.5 py-1.5 px-2.5 rounded-lg hover:bg-surface transition-colors">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${pr.risk === "low" ? "bg-success" : "bg-warning"}`} />
                  <div>
                    <div className="text-[13px] font-medium text-foreground">{pr.title}</div>
                    <div className="text-[12px] text-secondary">{pr.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
