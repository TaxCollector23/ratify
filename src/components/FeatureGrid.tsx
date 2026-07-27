const features = [
  {
    index: "01",
    title: "Repository Doctrine",
    description:
      "Ratify turns architecture discussions, review comments, and incident retrospectives into structured, executable rules — the standards your repository already has, made explicit.",
  },
  {
    index: "02",
    title: "Historical Context",
    description:
      "Every finding is grounded in your repository's own history — merged PRs, past reviews, and prior architectural decisions — not generic best practices.",
  },
  {
    index: "03",
    title: "Continuous Review",
    description:
      "Every pull request is evaluated against repository doctrine the moment it's opened, and re-evaluated as it changes — a consistent baseline before human review begins.",
  },
  {
    index: "04",
    title: "Evidence-Based Findings",
    description:
      "Every finding ships with supporting evidence and precedent, so reviewers evaluate Ratify's reasoning instead of taking a verdict on faith.",
  },
];

export default function FeatureGrid() {
  return (
    <section className="py-32" id="product">
      <div className="mx-auto max-w-[1440px] px-8 lg:px-12">
        <div className="max-w-2xl mb-16">
          <h2 className="text-4xl sm:text-5xl tracking-tight mb-4 font-bold" style={{ fontFamily: "var(--font-heading)" }}>
            Built for engineering rigor
          </h2>
          <p className="text-lg text-secondary">
            Four capabilities that enforce your standards without slowing teams down.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12">
          {features.map((feature) => (
            <div key={feature.title} className="border-t border-border pt-6">
              <div className="text-sm font-semibold text-primary mb-4 tabular-nums">{feature.index}</div>
              <h3 className="text-lg font-semibold text-foreground mb-3">{feature.title}</h3>
              <p className="text-sm text-secondary leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
