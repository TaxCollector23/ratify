const standards = [
  "Integration tests are required for payment logic.",
  "Authentication must be implemented through middleware.",
  "Breaking API changes require documentation.",
  "New dependencies require approval.",
  "Certain services may never communicate directly.",
  "Feature flags must wrap experimental behavior.",
];

export default function ProblemSection() {
  return (
    <section className="py-32">
      <div className="mx-auto max-w-[1440px] px-8 lg:px-12">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          <div>
            <div className="text-sm font-semibold text-primary mb-4">The problem</div>
            <h2
              className="text-4xl sm:text-5xl tracking-tight mb-6 font-bold leading-[1.05]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Institutional knowledge doesn&apos;t scale.
            </h2>
            <div className="space-y-4 text-lg text-secondary leading-relaxed">
              <p>
                Every engineering organization develops standards over time. Some are
                documented. Most live in architecture discussions, pull request reviews,
                Slack threads, incident retrospectives, and the memory of senior engineers.
              </p>
              <p>
                So every new engineer absorbs them slowly. Every reviewer repeats the same
                feedback. Review quality depends on who happened to open the PR — and which
                rules they remembered that day.
              </p>
              <p className="text-foreground font-medium">
                Ratify turns those standards into executable repository doctrine, and holds
                every pull request to them consistently.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-8">
            <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-5">
              Standards your team already has
            </div>
            <ul className="space-y-3">
              {standards.map((s) => (
                <li key={s} className="flex items-start gap-3 rounded-lg bg-white border border-border px-4 py-3">
                  <span className="text-primary mt-0.5 shrink-0 text-sm">§</span>
                  <span className="text-[15px] text-foreground leading-snug">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
