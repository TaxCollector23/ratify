import DashboardPreview from "./DashboardPreview";

export default function Hero() {
  return (
    <section className="relative pt-36 pb-24">
      <div className="mx-auto max-w-[1440px] px-8 lg:px-12 w-full">
        <div className="grid lg:grid-cols-[minmax(0,480px)_1fr] gap-12 lg:gap-20 items-center">
          {/* Left: Text */}
          <div className="fade-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              <span className="text-xs font-medium text-secondary">
                Engineering governance for GitHub
              </span>
            </div>

            <h1
              className="text-5xl sm:text-6xl leading-[1.03] tracking-tight mb-6 font-bold"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Engineering standards.
              <br />
              <span className="text-primary">Made executable.</span>
            </h1>

            <p className="text-lg text-secondary leading-relaxed mb-8 max-w-md">
              Ratify continuously reviews every pull request against your team&apos;s
              engineering doctrine — before it ever reaches a human reviewer.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href="/install"
                className="inline-flex items-center justify-center text-sm font-medium text-white bg-primary px-6 py-3 rounded-xl transition-colors duration-200 hover:bg-primary-hover"
              >
                Install on GitHub
              </a>
              <a
                href="#product"
                className="inline-flex items-center justify-center text-sm font-medium text-secondary bg-white border border-border px-6 py-3 rounded-xl transition-colors duration-200 hover:border-foreground/20 hover:text-foreground"
              >
                View Demo
              </a>
            </div>
          </div>

          {/* Right: Dashboard Preview */}
          <div className="fade-up min-w-0" style={{ animationDelay: "0.1s" }}>
            <DashboardPreview />
          </div>
        </div>
      </div>
    </section>
  );
}
