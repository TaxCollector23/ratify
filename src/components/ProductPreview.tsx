"use client";

import { useState } from "react";

type Tab = "repositories" | "doctrine" | "analytics" | "reviews";

const tabs: { id: Tab; label: string }[] = [
  { id: "repositories", label: "Repositories" },
  { id: "doctrine", label: "Doctrine" },
  { id: "analytics", label: "Analytics" },
  { id: "reviews", label: "Reviews" },
];

const doctrineSeed = [
  { id: 1, rule: "Integration tests required for payments code", enabled: true, category: "Testing", confidence: "Hard rule" },
  { id: 2, rule: "Authentication must be implemented through middleware", enabled: true, category: "Architecture", confidence: "Hard rule" },
  { id: 3, rule: "Breaking API changes require documentation", enabled: true, category: "Documentation", confidence: "Hard rule" },
  { id: 4, rule: "New dependencies require approval", enabled: true, category: "Dependencies", confidence: "Soft norm" },
  { id: 5, rule: "Feature flags must wrap experimental behavior", enabled: false, category: "Architecture", confidence: "Soft norm" },
  { id: 6, rule: "Handlers may not access the database directly", enabled: true, category: "Architecture", confidence: "Likely preference" },
];

const repoData = [
  { name: "payments-api", lang: "TypeScript", prs: 12, status: "healthy", lastReview: "3m ago" },
  { name: "platform-core", lang: "Go", prs: 8, status: "healthy", lastReview: "1m ago" },
  { name: "mobile-app", lang: "Swift", prs: 5, status: "warning", lastReview: "7m ago" },
  { name: "infrastructure", lang: "Terraform", prs: 15, status: "healthy", lastReview: "2m ago" },
  { name: "data-pipeline", lang: "Python", prs: 3, status: "healthy", lastReview: "12m ago" },
];

const reviewData = [
  { id: "PR #248", repo: "payments-api", title: "Refactor auth middleware", status: "approved", risk: "low", passed: 4, checks: 4 },
  { id: "PR #249", repo: "platform-core", title: "Optimize memory allocation", status: "approved", risk: "low", passed: 4, checks: 4 },
  { id: "PR #250", repo: "mobile-app", title: "Remove unsafe retry logic", status: "changes", risk: "medium", passed: 3, checks: 4 },
  { id: "PR #251", repo: "infrastructure", title: "Update K8s resource limits", status: "pending", risk: "low", passed: 2, checks: 4 },
];

const analyticsData = [
  { label: "PRs reviewed this week", value: "247" },
  { label: "Avg time to first finding", value: "1.8s" },
  { label: "Doctrine pass rate", value: "94.2%" },
  { label: "Regressions prevented", value: "38" },
];

const volume = [35, 42, 28, 55, 48, 62, 45];
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function RepositoriesTab() {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[1fr_120px_70px_100px_100px] gap-4 px-4 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wider border-b border-border">
          <span>Repository</span>
          <span>Language</span>
          <span>PRs</span>
          <span>Status</span>
          <span>Last review</span>
        </div>
        {repoData.map((repo) => (
          <div
            key={repo.name}
            className="grid grid-cols-[1fr_120px_70px_100px_100px] gap-4 px-4 py-3.5 rounded-lg hover:bg-surface transition-colors cursor-pointer items-center border-b border-border/60 last:border-b-0"
          >
            <span className="text-sm font-medium text-foreground">{repo.name}</span>
            <span className="text-sm text-secondary">{repo.lang}</span>
            <span className="text-sm text-foreground tabular-nums">{repo.prs}</span>
            <span className={`text-sm font-medium ${repo.status === "healthy" ? "text-success" : "text-warning"}`}>
              {repo.status === "healthy" ? "Healthy" : "Warning"}
            </span>
            <span className="text-sm text-muted">{repo.lastReview}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DoctrineTab() {
  const [items, setItems] = useState(doctrineSeed);
  const toggle = (id: number) => setItems((p) => p.map((it) => (it.id === id ? { ...it, enabled: !it.enabled } : it)));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-secondary">Click any rule to toggle enforcement.</p>
        <span className="text-xs font-medium text-muted">{items.filter((i) => i.enabled).length} of {items.length} enforcing</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => toggle(item.id)}
            className={`text-left flex items-start gap-3 p-4 rounded-xl border transition-colors ${
              item.enabled ? "border-border bg-white hover:bg-surface" : "border-border bg-surface"
            }`}
          >
            <span
              className={`mt-0.5 w-8 h-[18px] rounded-full flex items-center shrink-0 transition-colors ${
                item.enabled ? "bg-primary" : "bg-border"
              }`}
            >
              <span className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${item.enabled ? "translate-x-[16px]" : "translate-x-[2px]"}`} />
            </span>
            <span className="min-w-0">
              <span className={`block text-sm font-medium ${item.enabled ? "text-foreground" : "text-muted"}`}>{item.rule}</span>
              <span className="mt-1 flex items-center gap-2">
                <span className="text-[11px] text-secondary">{item.category}</span>
                <span className="text-[11px] text-muted">·</span>
                <span className="text-[11px] text-muted">{item.confidence}</span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AnalyticsTab() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {analyticsData.map((stat) => (
          <div key={stat.label} className="p-4 rounded-xl border border-border bg-white">
            <div className="text-2xl font-semibold text-foreground tabular-nums mb-1">{stat.value}</div>
            <div className="text-xs text-secondary leading-snug">{stat.label}</div>
          </div>
        ))}
      </div>
      <div className="p-5 rounded-xl border border-border bg-white">
        <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">Review volume · last 7 days</div>
        <div className="flex items-end gap-3 h-28">
          {volume.map((h, i) => (
            <div key={i} className="flex-1 flex flex-col justify-end">
              <div className="w-full bg-primary rounded-t-sm" style={{ height: `${h}%` }} />
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-2">
          {days.map((d) => (
            <span key={d} className="flex-1 text-center text-[11px] text-muted">{d}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReviewsTab() {
  return (
    <div className="space-y-3">
      {reviewData.map((review) => (
        <div key={review.id} className="p-4 rounded-xl border border-border bg-white hover:bg-surface transition-colors cursor-pointer">
          <div className="flex items-center justify-between gap-4 mb-2">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs font-mono text-muted shrink-0">{review.id}</span>
              <span className="text-sm font-medium text-foreground truncate">{review.title}</span>
            </div>
            <span
              className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${
                review.status === "approved"
                  ? "bg-success/10 text-success"
                  : review.status === "changes"
                  ? "bg-warning/10 text-warning"
                  : "bg-surface text-muted border border-border"
              }`}
            >
              {review.status === "approved" ? "Approved" : review.status === "changes" ? "Changes requested" : "Pending"}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-secondary">
            <span>{review.repo}</span>
            <span>Risk: {review.risk}</span>
            <span>Checks: {review.passed}/{review.checks}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

const tabContent: Record<Tab, React.ReactNode> = {
  repositories: <RepositoriesTab />,
  doctrine: <DoctrineTab />,
  analytics: <AnalyticsTab />,
  reviews: <ReviewsTab />,
};

export default function ProductPreview() {
  const [activeTab, setActiveTab] = useState<Tab>("doctrine");

  return (
    <section className="py-28" id="product-preview">
      <div className="mx-auto max-w-[1440px] px-8 lg:px-12">
        <div className="max-w-2xl mb-12">
          <h2 className="text-4xl sm:text-5xl tracking-tight mb-4 font-bold" style={{ fontFamily: "var(--font-heading)" }}>
            The full picture
          </h2>
          <p className="text-lg text-secondary">Every repository, every doctrine rule, every review — in one place.</p>
        </div>

        <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_40px_-24px_rgba(0,0,0,0.12)]">
          <div className="flex border-b border-border px-3 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-4 py-4 text-sm font-medium whitespace-nowrap transition-colors duration-200 ${
                  activeTab === tab.id ? "text-foreground" : "text-secondary hover:text-foreground"
                }`}
              >
                {tab.label}
                {activeTab === tab.id && <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-primary rounded-full" />}
              </button>
            ))}
          </div>
          <div className="p-6 min-h-[420px]">{tabContent[activeTab]}</div>
        </div>
      </div>
    </section>
  );
}
