"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Tab = "repositories" | "doctrine" | "analytics" | "reviews";

const tabs: { id: Tab; label: string }[] = [
  { id: "repositories", label: "Repositories" },
  { id: "doctrine", label: "Doctrine" },
  { id: "analytics", label: "Analytics" },
  { id: "reviews", label: "Reviews" },
];

const doctrineItems = [
  { id: 1, rule: "Avoid unnecessary abstraction", enabled: true, category: "Architecture" },
  { id: 2, rule: "Require integration tests for API changes", enabled: true, category: "Testing" },
  { id: 3, rule: "Document all breaking changes", enabled: true, category: "Documentation" },
  { id: 4, rule: "Limit function complexity to cyclomatic 8", enabled: false, category: "Quality" },
  { id: 5, rule: "No direct database access in handlers", enabled: true, category: "Architecture" },
  { id: 6, rule: "Use structured logging with correlation IDs", enabled: true, category: "Observability" },
];

const repoData = [
  { name: "payments-api", lang: "TypeScript", prs: 12, status: "healthy", lastReview: "3m ago" },
  { name: "platform-core", lang: "Go", prs: 8, status: "healthy", lastReview: "1m ago" },
  { name: "mobile-app", lang: "Swift", prs: 5, status: "warning", lastReview: "7m ago" },
  { name: "infrastructure", lang: "Terraform", prs: 15, status: "healthy", lastReview: "2m ago" },
  { name: "data-pipeline", lang: "Python", prs: 3, status: "healthy", lastReview: "12m ago" },
];

const reviewData = [
  { id: "PR-248", repo: "payments-api", title: "Refactor auth middleware", status: "approved", risk: "low", checks: 4, passed: 4 },
  { id: "PR-249", repo: "platform-core", title: "Optimize memory allocation", status: "approved", risk: "low", checks: 4, passed: 4 },
  { id: "PR-250", repo: "mobile-app", title: "Remove unsafe retry logic", status: "changes_requested", risk: "medium", checks: 4, passed: 3 },
  { id: "PR-251", repo: "infrastructure", title: "Update K8s resource limits", status: "pending", risk: "low", checks: 4, passed: 2 },
];

const analyticsData = [
  { label: "PRs This Week", value: "247", change: "+12%" },
  { label: "Avg Review Time", value: "1.8s", change: "-23%" },
  { label: "Doctrine Pass Rate", value: "94.2%", change: "+2.1%" },
  { label: "Issues Caught", value: "38", change: "+8" },
];

function RepositoriesTab() {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px] space-y-2">
        <div className="grid grid-cols-[1fr_110px_70px_90px_90px] gap-4 px-4 py-2 text-xs font-medium text-secondary uppercase tracking-wider border-b border-border">
          <span>Repository</span>
          <span>Language</span>
          <span>PRs</span>
          <span>Status</span>
          <span>Last Review</span>
        </div>
        {repoData.map((repo, i) => (
          <motion.div
            key={repo.name}
            className="grid grid-cols-[1fr_110px_70px_90px_90px] gap-4 px-4 py-3 rounded-lg hover:bg-surface transition-colors cursor-pointer items-center"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <span className="text-sm font-medium text-foreground">{repo.name}</span>
            <span className="text-xs text-secondary">{repo.lang}</span>
            <span className="text-xs text-foreground tabular-nums">{repo.prs}</span>
            <span className={`text-xs font-medium ${repo.status === "healthy" ? "text-success" : "text-warning"}`}>
              {repo.status === "healthy" ? "Healthy" : "Warning"}
            </span>
            <span className="text-xs text-muted">{repo.lastReview}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function DoctrineTab() {
  const [items, setItems] = useState(doctrineItems);

  const toggleItem = (id: number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item))
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-secondary">Click any principle to toggle enforcement</div>
        <button className="text-xs font-medium text-primary hover:text-primary-hover transition-colors">
          + Add Principle
        </button>
      </div>
      {items.map((item, i) => (
        <motion.div
          key={item.id}
          className={`flex items-center justify-between p-4 rounded-lg border transition-all cursor-pointer ${
            item.enabled
              ? "border-border bg-white hover:bg-surface"
              : "border-border/50 bg-surface/50 opacity-60"
          }`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: item.enabled ? 1 : 0.6, y: 0 }}
          transition={{ delay: i * 0.04 }}
          onClick={() => toggleItem(item.id)}
          whileHover={{ scale: 1.01 }}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-[18px] rounded-full flex items-center transition-colors duration-200 ${
                item.enabled ? "bg-primary" : "bg-border"
              }`}
            >
              <motion.div
                className="w-3.5 h-3.5 rounded-full bg-white"
                animate={{ x: item.enabled ? 16 : 2 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">{item.rule}</div>
              <div className="text-xs text-secondary mt-0.5">{item.category}</div>
            </div>
          </div>
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              item.enabled
                ? "bg-success/10 text-success"
                : "bg-surface text-muted"
            }`}
          >
            {item.enabled ? "Enforcing" : "Disabled"}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

function AnalyticsTab() {
  return (
    <div className="grid grid-cols-2 gap-4">
      {analyticsData.map((stat, i) => (
        <motion.div
          key={stat.label}
          className="p-5 rounded-lg border border-border bg-white"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.06 }}
        >
          <div className="text-xs text-secondary mb-2">{stat.label}</div>
          <div className="text-2xl font-semibold text-foreground tabular-nums">{stat.value}</div>
          <div className={`text-xs mt-1 ${stat.change.startsWith("+") ? "text-success" : stat.change.startsWith("-") && stat.label.includes("Time") ? "text-success" : "text-warning"}`}>
            {stat.change} from last week
          </div>
        </motion.div>
      ))}
      <motion.div
        className="col-span-2 p-5 rounded-lg border border-border bg-white"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="text-xs text-secondary mb-4">Review Volume (7 days)</div>
        <div className="flex items-end gap-2 h-24">
          {[35, 42, 28, 55, 48, 62, 45].map((h, i) => (
            <motion.div
              key={i}
              className="flex-1 bg-primary/10 rounded-t-sm relative group"
              initial={{ height: 0 }}
              animate={{ height: `${h}%` }}
              transition={{ delay: 0.4 + i * 0.05, duration: 0.4 }}
            >
              <div className="absolute inset-x-0 bottom-0 bg-primary rounded-t-sm group-hover:bg-primary-hover transition-colors" style={{ height: `${h}%` }} />
            </motion.div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <span key={d} className="flex-1 text-center text-xs text-muted">{d}</span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function ReviewsTab() {
  return (
    <div className="space-y-2">
      {reviewData.map((review, i) => (
        <motion.div
          key={review.id}
          className="p-4 rounded-lg border border-border bg-white hover:bg-surface transition-colors cursor-pointer"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          whileHover={{ scale: 1.005 }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-secondary">{review.id}</span>
              <span className="text-sm font-medium text-foreground">{review.title}</span>
            </div>
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                review.status === "approved"
                  ? "bg-success/10 text-success"
                  : review.status === "changes_requested"
                  ? "bg-warning/10 text-warning"
                  : "bg-surface text-muted"
              }`}
            >
              {review.status === "approved"
                ? "Approved"
                : review.status === "changes_requested"
                ? "Changes Requested"
                : "Pending"}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-secondary">
            <span>{review.repo}</span>
            <span>Risk: {review.risk}</span>
            <span>
              Checks: {review.passed}/{review.checks}
            </span>
          </div>
        </motion.div>
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
  const [activeTab, setActiveTab] = useState<Tab>("repositories");

  return (
    <section className="py-28" id="product-preview">
      <div className="mx-auto max-w-[1440px] px-8 lg:px-12">
        <motion.div
          className="mb-12 max-w-2xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
        >
          <h2
            className="text-4xl sm:text-5xl tracking-tight mb-4 font-bold"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            The full picture
          </h2>
          <p className="text-lg text-secondary">
            Every repository, every doctrine, every review. All in one place.
          </p>
        </motion.div>

        <motion.div
          className="rounded-2xl border border-border bg-white overflow-hidden"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
        >
          {/* Tab Bar */}
          <div className="flex border-b border-border px-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-5 py-4 text-sm font-medium transition-colors duration-200 ${
                  activeTab === tab.id ? "text-foreground" : "text-secondary hover:text-foreground"
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                    layoutId="activeTab"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-8 min-h-[440px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {tabContent[activeTab]}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
