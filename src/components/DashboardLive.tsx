"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/context";

interface Session {
  id: string;
  status: string;
  riskScore: number | null;
  filesChanged: number;
  summary: string | null;
  createdAt: string;
  prTitle: string;
  prNumber: number;
  prAuthor: string;
  repoFullName: string;
}

export default function DashboardLive() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { state } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state === null) return;
    if (!state.authed) {
      router.replace("/signin?next=/dashboard");
      return;
    }
    fetch("/api/reviews")
      .then(async (r) => {
        if (r.status === 401) {
          router.replace("/signin?next=/dashboard");
          return null;
        }
        if (!r.ok) {
          setError("Failed to load review sessions. Please refresh and try again.");
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d) setSessions(d.sessions ?? []);
      })
      .catch(() => setError("Network error loading review sessions."));
  }, [state, router]);

  if (state === null || (state.authed && sessions === null && !error)) {
    return <p className="text-sm text-secondary">Loading review sessions…</p>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/[0.04] p-4 text-sm text-danger">{error}</div>
    );
  }

  if (state.authed && !state.hasInstallation) {
    return (
      <div className="rounded-2xl border border-border p-10 text-center">
        <p className="text-secondary mb-2">You haven&apos;t installed Ratify on a repository yet.</p>
        <a
          href="/install"
          className="inline-flex items-center justify-center text-sm font-medium text-white bg-primary hover:bg-primary-hover px-5 py-2.5 rounded-lg mt-2"
        >
          Install on GitHub
        </a>
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="rounded-2xl border border-border p-10 text-center">
        <p className="text-secondary mb-2">No reviews yet.</p>
        <p className="text-sm text-muted">
          Open a pull request on a connected repository — it&apos;ll show up here in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((s) => (
        <a
          key={s.id}
          href={`/dashboard/${s.id}`}
          className="block rounded-xl border border-border bg-white p-5 hover:border-foreground/20 transition-colors"
        >
          <div className="flex items-center justify-between gap-4 mb-2">
            <div className="min-w-0">
              <div className="text-xs text-muted mb-1">{s.repoFullName}</div>
              <div className="text-sm font-medium text-foreground truncate">
                #{s.prNumber} {s.prTitle}
              </div>
            </div>
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${
                s.status === "completed"
                  ? "bg-success/10 text-success"
                  : s.status === "failed"
                  ? "bg-danger/10 text-danger"
                  : "bg-surface text-muted border border-border"
              }`}
            >
              {s.status}
            </span>
          </div>
          <p className="text-sm text-secondary mb-2">{s.summary ?? "Analysis in progress…"}</p>
          <div className="flex items-center gap-4 text-xs text-muted">
            <span>by {s.prAuthor}</span>
            {s.riskScore !== null && <span>Risk: {s.riskScore}%</span>}
            <span>{s.filesChanged} files changed</span>
            <span className="ml-auto text-primary">View timeline →</span>
          </div>
        </a>
      ))}
    </div>
  );
}
