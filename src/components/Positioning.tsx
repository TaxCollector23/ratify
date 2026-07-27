const isNot = [
  "A code generator or autocomplete",
  "Another Copilot or Cursor",
  "A generic LLM wrapper",
  "A replacement for human reviewers",
];

const is = [
  "A repository intelligence platform",
  "A model of how your repo is meant to be built",
  "A consistent baseline before human review",
  "Evidence-backed engineering governance",
];

export default function Positioning() {
  return (
    <section className="py-28">
      <div className="mx-auto max-w-[1440px] px-8 lg:px-12">
        <div className="max-w-2xl mb-16">
          <h2 className="text-4xl sm:text-5xl tracking-tight mb-4 font-bold" style={{ fontFamily: "var(--font-heading)" }}>
            Ratify owns a workflow
          </h2>
          <p className="text-lg text-secondary">
            It doesn&apos;t generate code or autocomplete functions. It builds a continuously
            evolving model of how your repository is intended to be built — and holds every
            pull request to it.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-border p-8">
            <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-5">What Ratify is not</div>
            <ul className="space-y-3.5">
              {isNot.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[15px] text-secondary">
                  <span className="text-muted mt-0.5 shrink-0">✕</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-primary/[0.02] p-8">
            <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-5">What Ratify is</div>
            <ul className="space-y-3.5">
              {is.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[15px] text-foreground">
                  <span className="text-primary mt-0.5 shrink-0">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
