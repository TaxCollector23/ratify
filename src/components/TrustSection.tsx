const stats = [
  { value: "89%", label: "Findings judged relevant by reviewers" },
  { value: "6%", label: "False-positive rate on flagged findings" },
  { value: "5", label: "Deterministic policy checks before any model call" },
  { value: "100%", label: "Findings shipped with supporting evidence" },
];

export default function TrustSection() {
  return (
    <section className="py-16 border-y border-border bg-surface">
      <div className="mx-auto max-w-[1440px] px-8 lg:px-12">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat) => (
            <div key={stat.label}>
              <div className="text-3xl sm:text-4xl font-semibold text-foreground mb-2 tabular-nums">{stat.value}</div>
              <div className="text-sm text-secondary leading-snug">{stat.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-10 pt-8 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-sm text-secondary max-w-xl">
            Numbers come from our internal evaluation harness against real merged pull requests —
            not live customer traffic. Full methodology on the benchmarks page.
          </p>
          <a
            href="/benchmarks"
            className="inline-flex items-center justify-center text-sm font-medium text-foreground bg-white border border-border px-5 py-2.5 rounded-lg transition-colors duration-200 hover:border-foreground/20 whitespace-nowrap"
          >
            View benchmarks
          </a>
        </div>
      </div>
    </section>
  );
}
