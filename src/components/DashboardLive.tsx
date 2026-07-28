"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    fetch("/api/reviews")
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions ?? []))
      .catch(() => setError("Failed to load review sessions."));
  }, []);

  if (error) {
    return <p className="text-sm text-danger">{error}</p>;
  }

  if (sessions === null) {
    return <p className="text-sm text-secondary">Loading review sessions…</p>;
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl border border-border p-10 text-center">
        <p className="text-secondary mb-2">No reviews yet.</p>
        <p className="text-sm text-muted">
          Once Ratify is installed on a repository, opening a pull request there will show up
          here in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((s) => (
        <div key={s.id} className="rounded-xl border border-border bg-white p-5">
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
          </div>
        </div>
      ))}
    </div>
  );
}
