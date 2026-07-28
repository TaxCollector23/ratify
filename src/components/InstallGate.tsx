"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/context";

interface Props {
  installUrl: string | null;
}

export default function InstallGate({ installUrl }: Props) {
  const { state } = useAuth();
  const router = useRouter();

  // If they already have an installation, they don't belong here.
  useEffect(() => {
    if (state?.authed && state.hasInstallation) {
      router.replace("/dashboard");
    }
  }, [state, router]);

  if (state === null) {
    return <p className="text-center text-sm text-secondary">Loading…</p>;
  }

  if (!state.authed) {
    return (
      <div className="text-center">
        <h1 className="text-4xl tracking-tight mb-4 font-bold" style={{ fontFamily: "var(--font-heading)" }}>
          Sign in to install Ratify
        </h1>
        <p className="text-lg text-secondary leading-relaxed mb-8">
          You&apos;ll create a Ratify account first, then install the GitHub App on the
          repositories you want reviewed.
        </p>
        <a
          href="/signin?next=/install"
          className="inline-flex items-center justify-center text-sm font-medium text-white bg-primary hover:bg-primary-hover px-6 py-3 rounded-xl transition-colors duration-200"
        >
          Sign in or create account
        </a>
      </div>
    );
  }

  return (
    <div className="text-center">
      <h1 className="text-4xl tracking-tight mb-4 font-bold" style={{ fontFamily: "var(--font-heading)" }}>
        Install Ratify
      </h1>
      <p className="text-lg text-secondary leading-relaxed mb-2">
        Ratify installs as a GitHub App on the repositories you choose. It requests read
        access to code and pull requests, and write access to checks and PR comments —
        nothing else.
      </p>
      {state.githubLogin ? (
        <p className="text-sm text-muted mb-10">
          We&apos;ll auto-link installations from{" "}
          <span className="text-foreground font-medium">@{state.githubLogin}</span> to your
          Ratify account.
        </p>
      ) : (
        <p className="text-sm text-warning mb-10">
          You don&apos;t have a GitHub username on file. Sign out and back in to add one.
        </p>
      )}
      {installUrl ? (
        <a
          href={installUrl}
          className="inline-flex items-center justify-center text-sm font-medium text-white bg-primary hover:bg-primary-hover px-6 py-3 rounded-xl transition-colors duration-200"
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
      <p className="text-xs text-muted mt-8">
        After you finish installing on GitHub, come back here and refresh — you&apos;ll be
        redirected to your dashboard automatically.
      </p>

      <div className="mt-16 pt-10 border-t border-border text-left">
        <h2
          className="text-2xl tracking-tight mb-3 font-bold"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Optional: review every deployment too
        </h2>
        <p className="text-sm text-secondary leading-relaxed mb-4">
          Ratify reviews pull requests automatically. To also review every deployment
          (blocking on high-severity findings), drop this workflow file into your repo at{" "}
          <code className="text-xs bg-surface border border-border rounded px-1.5 py-0.5">
            .github/workflows/ratify-review.yml
          </code>
          . On every push to <code className="text-xs bg-surface border border-border rounded px-1.5 py-0.5">main</code>,
          it opens a GitHub Deployment; Ratify subscribes to the event and posts a
          check_run to the commit.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="/workflows/ratify-review.yml"
            download
            className="inline-flex items-center justify-center text-sm font-medium text-foreground bg-white border border-border px-5 py-2.5 rounded-lg hover:border-foreground/20 transition-colors"
          >
            Download workflow
          </a>
          <a
            href="/workflows/ratify-review.yml"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center text-sm font-medium text-secondary px-5 py-2.5 rounded-lg hover:text-foreground transition-colors"
          >
            View YAML →
          </a>
        </div>
        <p className="text-xs text-muted mt-4">
          Requires no external secrets — the workflow uses GitHub&apos;s built-in{" "}
          <code>GITHUB_TOKEN</code> with <code>deployments: write</code> permission.
        </p>
      </div>
    </div>
  );
}
