const stages = [
  {
    label: "Pull Request Opened",
    detail: "Ratify indexes the repository and the proposed changes the moment a pull request is opened.",
  },
  {
    label: "Doctrine Evaluated",
    detail: "The diff is evaluated against the engineering principles that already govern this repository.",
  },
  {
    label: "Evidence Generated",
    detail: "Every finding ships with supporting evidence from your repository's own history, not a bare verdict.",
  },
  {
    label: "Findings Addressed",
    detail: "The developer responds and Ratify re-evaluates, before the pull request reaches a human reviewer.",
  },
  {
    label: "Merge",
    detail: "Human review focuses on design and tradeoffs. The repeatable baseline is already enforced.",
  },
];

export default function Timeline() {
  return (
    <section className="py-28 bg-surface border-y border-border">
      <div className="mx-auto max-w-[1440px] px-8 lg:px-12">
        <div className="max-w-2xl mb-16">
          <h2 className="text-4xl sm:text-5xl tracking-tight mb-4 font-bold" style={{ fontFamily: "var(--font-heading)" }}>
            From commit to merge
          </h2>
          <p className="text-lg text-secondary">Where Ratify sits in your engineering lifecycle.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {stages.map((stage, i) => (
            <div key={stage.label} className="rounded-xl border border-border bg-white p-5 flex flex-col">
              <div className="w-9 h-9 rounded-full bg-primary/[0.08] text-primary flex items-center justify-center text-sm font-semibold mb-4">
                {i + 1}
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-2">{stage.label}</h3>
              <p className="text-[13px] text-secondary leading-relaxed">{stage.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
