import type { Metadata } from "next";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Install Ratify — Ratify",
};

export default function InstallPage() {
  const slug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG;
  const installUrl = slug ? `https://github.com/apps/${slug}/installations/new` : null;

  return (
    <>
      <Navigation />
      <main className="pt-36 pb-28">
        <div className="mx-auto max-w-[640px] px-8 text-center">
          <h1 className="text-4xl tracking-tight mb-4 font-bold" style={{ fontFamily: "var(--font-heading)" }}>
            Install Ratify
          </h1>
          <p className="text-lg text-secondary leading-relaxed mb-10">
            Ratify installs as a GitHub App on the repositories you choose. It requests read
            access to code and pull requests, and write access to checks and PR comments —
            nothing else.
          </p>
          {installUrl ? (
            <a
              href={installUrl}
              className="inline-flex items-center justify-center text-sm font-medium text-white bg-primary px-6 py-3 rounded-xl transition-colors duration-200 hover:bg-primary-hover"
            >
              Install on GitHub
            </a>
          ) : (
            <p className="text-sm text-muted">
              GitHub App installation is being finalized. Check back shortly, or reach out at{" "}
              <a href="mailto:hello@ratify.dev" className="text-primary hover:text-primary-hover">
                hello@ratify.dev
              </a>
              .
            </p>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
