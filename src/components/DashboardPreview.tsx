"use client";

import { motion } from "framer-motion";
import { useState } from "react";

const repoCards = [
  { name: "payments-api", status: "healthy", reviews: 24, openPrs: 4, passRate: "97%" },
  { name: "platform-core", status: "healthy", reviews: 18, openPrs: 3, passRate: "99%" },
  { name: "mobile-app", status: "warning", reviews: 9, openPrs: 2, passRate: "88%" },
  { name: "infrastructure", status: "healthy", reviews: 31, openPrs: 5, passRate: "96%" },
];

const checksByRepo: Record<string, { label: string; status: "pass" | "warn"; evidence: string }[]> = {
  "payments-api": [
    { label: "Architecture", status: "pass", evidence: "Matches middleware pattern used in 14 prior payments PRs." },
    { label: "Tests", status: "pass", evidence: "Integration test coverage added for new charge path." },
    { label: "Performance regression", status: "warn", evidence: "P95 latency on /charge increased ~4ms in benchmark run." },
    { label: "Documentation", status: "pass", evidence: "CHANGELOG and API docs updated in the same commit." },
  ],
  "platform-core": [
    { label: "Architecture", status: "pass", evidence: "No violation of the service boundary graph." },
    { label: "Tests", status: "pass", evidence: "Unit tests cover the new allocator path." },
    { label: "Performance regression", status: "pass", evidence: "Benchmark suite shows no regression." },
    { label: "Documentation", status: "pass", evidence: "Internal doc comment added to exported function." },
  ],
  "mobile-app": [
    { label: "Architecture", status: "warn", evidence: "Retry logic bypasses the shared network layer." },
    { label: "Tests", status: "warn", evidence: "No test added for the new retry path." },
    { label: "Performance regression", status: "pass", evidence: "No measurable change in cold start time." },
    { label: "Documentation", status: "pass", evidence: "No public API changed." },
  ],
  infrastructure: [
    { label: "Architecture", status: "pass", evidence: "Terraform module follows existing resource layout." },
    { label: "Tests", status: "pass", evidence: "Plan output validated in CI." },
    { label: "Performance regression", status: "pass", evidence: "Not applicable to this change." },
    { label: "Documentation", status: "pass", evidence: "Resource limits documented in module README." },
  ],
};

const decisionsByRepo: Record<string, { id: number; title: string; desc: string; risk: "low" | "medium"; time: string }[]> = {
  "payments-api": [
    { id: 1, title: "PR #248 Approved", desc: "Auth middleware standardized across handlers", risk: "low", time: "2m ago" },
    { id: 2, title: "PR #246 Merged", desc: "Idempotency key added to charge endpoint", risk: "low", time: "41m ago" },
  ],
  "platform-core": [
    { id: 3, title: "PR #249 Merged", desc: "Memory allocation improved in hot path", risk: "low", time: "8m ago" },
  ],
  "mobile-app": [
    { id: 4, title: "PR #250 Changes Requested", desc: "Unsafe retry logic flagged for review", risk: "medium", time: "14m ago" },
  ],
  infrastructure: [
    { id: 5, title: "PR #251 Pending", desc: "K8s resource limits updated for worker pool", risk: "low", time: "22m ago" },
  ],
};

export default function DashboardPreview() {
  const [activeRepo, setActiveRepo] = useState("payments-api");
  const [openCheck, setOpenCheck] = useState<string | null>(null);

  const checks = checksByRepo[activeRepo] ?? [];
  const decisions = decisionsByRepo[activeRepo] ?? [];
  const passCount = checks.filter((c) => c.status === "pass").length;
  const riskScore = Math.round((passCount / Math.max(checks.length, 1)) * 100);

  return (
    <div className="w-full">
      {/* Dashboard Container */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M2 7.5L5.5 11L12 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-sm font-medium text-foreground">Live PR Review</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-sm text-secondary">Reviewing</span>
          </div>
        </div>

        <div className="grid md:grid-cols-[220px_1fr]">
          {/* Left: Repository list */}
          <div className="border-b md:border-b-0 md:border-r border-border p-4 space-y-1">
            <h4 className="text-xs font-medium text-secondary uppercase tracking-wider px-2 mb-2">Repositories</h4>
            {repoCards.map((repo) => (
              <button
                key={repo.name}
                onClick={() => setActiveRepo(repo.name)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors duration-150 flex items-center justify-between ${
                  activeRepo === repo.name ? "bg-primary/[0.06] text-foreground" : "hover:bg-surface text-secondary"
                }`}
              >
                <span className="text-sm font-medium">{repo.name}</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${repo.status === "healthy" ? "bg-success" : "bg-warning"}`}
                />
              </button>
            ))}
          </div>

          {/* Right: Detail panel */}
          <div className="p-6 space-y-6">
            {/* Risk score + repo meta */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-secondary uppercase tracking-wider mb-1">Risk score</div>
                <div className="text-4xl font-semibold text-foreground tabular-nums">{riskScore}%</div>
              </div>
              <div className="text-right text-sm text-secondary">
                <div>{repoCards.find((r) => r.name === activeRepo)?.openPrs} open PRs</div>
                <div className="mt-1">
                  Pass rate{" "}
                  <span className="text-foreground font-medium">
                    {repoCards.find((r) => r.name === activeRepo)?.passRate}
                  </span>
                </div>
              </div>
            </div>

            {/* Checks - clickable to reveal evidence */}
            <div>
              <h4 className="text-xs font-medium text-secondary uppercase tracking-wider mb-3">Checks</h4>
              <div className="space-y-1.5">
                {checks.map((check) => (
                  <div key={check.label} className="rounded-lg overflow-hidden">
                    <button
                      onClick={() => setOpenCheck(openCheck === check.label ? null : check.label)}
                      className="w-full flex items-center justify-between py-2.5 px-3 hover:bg-surface transition-colors rounded-lg text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`text-base ${check.status === "pass" ? "text-success" : "text-warning"}`}>
                          {check.status === "pass" ? "✓" : "⚠"}
                        </span>
                        <span className="text-sm text-foreground font-medium">{check.label}</span>
                      </div>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${
                          check.status === "pass" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                        }`}
                      >
                        {check.status === "pass" ? "Pass" : "Warning"}
                      </span>
                    </button>
                    {openCheck === check.label && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        className="px-3 pb-3 text-sm text-secondary leading-relaxed"
                      >
                        {check.evidence}
                      </motion.div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Recent decisions */}
            <div>
              <h4 className="text-xs font-medium text-secondary uppercase tracking-wider mb-3">Recent decisions</h4>
              <div className="space-y-1">
                {decisions.map((pr) => (
                  <div
                    key={pr.id}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-surface transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-1.5 h-1.5 rounded-full ${pr.risk === "low" ? "bg-success" : "bg-warning"}`} />
                      <div>
                        <div className="text-sm font-medium text-foreground">{pr.title}</div>
                        <div className="text-xs text-secondary mt-0.5">{pr.desc}</div>
                      </div>
                    </div>
                    <span className="text-xs text-muted whitespace-nowrap">{pr.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
