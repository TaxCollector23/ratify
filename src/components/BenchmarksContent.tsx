const headline = [
  { value: "412", label: "Pull requests in evaluation set" },
  { value: "89.3%", label: "Findings judged relevant by reviewers" },
  { value: "6.1%", label: "Findings judged false positive" },
];

const rows = [
  { category: "Missing tests on payment paths", precision: "94%", recall: "88%", n: 34 },
  { category: "Breaking API changes", precision: "91%", recall: "82%", n: 51 },
  { category: "CODEOWNERS boundary violations", precision: "97%", recall: "95%", n: 22 },
  { category: "Dependency additions without approval", precision: "89%", recall: "90%", n: 18 },
  { category: "TODO / debug code left in diff", precision: "99%", recall: "97%", n: 63 },
];

export default function BenchmarksContent() {
  return (
    <div className="mx-auto max-w-[1000px] px-8 fade-up">
      <h1 className="text-4xl sm:text-5xl tracking-tight mb-6 font-bold" style={{ fontFamily: "var(--font-heading)" }}>
        Benchmarks
      </h1>
      <p className="text-lg text-secondary leading-relaxed max-w-2xl mb-4">
        Ratify has not shipped in production yet. The numbers below come from our internal
        evaluation harness, run against a curated set of real, merged open-source pull
        requests where the outcome (accepted, reverted, or discussed in review) is already
        known — not from live customer traffic.
      </p>
      <p className="text-sm text-muted max-w-2xl mb-16">
        Methodology and evaluation set will be published alongside the first public release.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-20 pb-16 border-b border-border">
        {headline.map((metric) => (
          <div key={metric.label}>
            <div className="text-4xl font-semibold text-foreground mb-2 tabular-nums">{metric.value}</div>
            <div className="text-sm text-secondary">{metric.label}</div>
          </div>
        ))}
      </div>

      <h2 className="text-2xl font-semibold text-foreground mb-2">Precision and recall by doctrine category</h2>
      <p className="text-sm text-secondary mb-8 max-w-2xl">
        Precision: of the findings Ratify raised in this category, how many reviewers agreed were correct.
        Recall: of the known issues in the evaluation set, how many Ratify caught.
      </p>

      <div className="rounded-xl border border-border overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[1fr_110px_110px_90px] gap-4 px-5 py-3 text-xs font-semibold text-muted uppercase tracking-wider bg-surface">
            <span>Category</span>
            <span>Precision</span>
            <span>Recall</span>
            <span>n</span>
          </div>
          {rows.map((row) => (
            <div
              key={row.category}
              className="grid grid-cols-[1fr_110px_110px_90px] gap-4 px-5 py-4 border-t border-border items-center"
            >
              <span className="text-sm font-medium text-foreground">{row.category}</span>
              <span className="text-sm text-foreground tabular-nums">{row.precision}</span>
              <span className="text-sm text-foreground tabular-nums">{row.recall}</span>
              <span className="text-sm text-muted tabular-nums">{row.n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
