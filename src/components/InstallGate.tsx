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
    </div>
  );
}
