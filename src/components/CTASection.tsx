export default function CTASection() {
  return (
    <section className="py-32 border-t border-border">
      <div className="mx-auto max-w-[1440px] px-8 lg:px-12">
        <div className="rounded-2xl bg-foreground px-8 py-16 sm:px-16 sm:py-20 text-center">
          <h2
            className="text-4xl sm:text-5xl tracking-tight mb-4 font-bold text-white"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Make your standards the default
          </h2>
          <p className="text-lg text-white/70 max-w-xl mx-auto mb-10">
            Install Ratify on a repository and it starts building doctrine from your history
            immediately. Free to start, no credit card required.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="/install"
              className="inline-flex items-center justify-center text-sm font-medium text-foreground bg-white px-6 py-3 rounded-xl transition-colors duration-200 hover:bg-white/90"
            >
              Install on GitHub
            </a>
            <a
              href="/pricing"
              className="inline-flex items-center justify-center text-sm font-medium text-white bg-white/10 border border-white/20 px-6 py-3 rounded-xl transition-colors duration-200 hover:bg-white/20"
            >
              See pricing
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
