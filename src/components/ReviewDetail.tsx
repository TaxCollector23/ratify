"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Finding {
  id: string;
  ruleKey: string;
  title: string;
  description: string;
  filePath: string | null;
  severity: string;
  confidence: number;
  source: string;
  evidence: unknown;
  createdAt: string;
}

interface TimelineEvent {
  id: string;
  stage: string;
  durationMs: number | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

interface SessionData {
  session: {
    id: string;
    status: string;
    headSha: string;
    riskScore: number | null;
    filesChanged: number;
    summary: string | null;
    createdAt: string;
    completedAt: string | null;
    checkRunId: number | null;
    prTitle: string;
    prNumber: number;
    prAuthor: string;
    repoFullName: string;
    repoOwner: string;
    repoName: string;
  };
  findings: Finding[];
  timeline: TimelineEvent[];
  myFeedback: Record<string, { verdict: string; comment: string | null; createdAt: string }>;
}

const SEVERITY_STYLES: Record<string, string> = {
  high: "bg-danger/10 text-danger border-danger/30",
  medium: "bg-warning/10 text-warning border-warning/30",
  low: "bg-muted/10 text-muted border-border",
};

const STAGE_LABEL: Record<string, string> = {
  webhook_received: "Webhook received",
  policy_checks: "Deterministic policy checks",
  context_retrieved: "Diff + context fetched from GitHub",
  llm_call: "Model reasoning",
  evidence_generated: "Evidence + scoring assembled",
  published: "Published to GitHub",
  skipped_duplicate: "Duplicate webhook skipped",
  error: "Error",
};

export default function ReviewDetail({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<SessionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetch(`/api/reviews/${sessionId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setData(d))
      .catch((e) => setError(String(e)));
  };

  useEffect(load, [sessionId]);

  if (error) return <p className="text-danger">Failed to load: {error}</p>;
  if (!data) return <p className="text-secondary">Loading…</p>;

  const { session, findings, timeline, myFeedback } = data;
  const highN = findings.filter((f) => f.severity === "high").length;
  const medN = findings.filter((f) => f.severity === "medium").length;
  const lowN = findings.filter((f) => f.severity === "low").length;

  return (
    <div>
      <Link href="/dashboard" className="text-sm text-secondary hover:text-foreground mb-8 inline-block">← All reviews</Link>

      <div className="mb-10">
        <div className="text-sm text-muted mb-2">{session.repoFullName}</div>
        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-heading)" }}>
          #{session.prNumber} {session.prTitle}
        </h1>
        <div className="text-sm text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>by <span className="text-foreground">{session.prAuthor}</span></span>
          <span>· <code className="text-xs">{session.headSha.slice(0, 7)}</code></span>
          <span>· {session.filesChanged} files changed</span>
          <span>· status: <span className={session.status === "completed" ? "text-success" : "text-warning"}>{session.status}</span></span>
          {session.checkRunId && (
            <a
              href={`https://github.com/${session.repoOwner}/${session.repoName}/pull/${session.prNumber}/checks?check_run_id=${session.checkRunId}`}
              target="_blank" rel="noopener noreferrer"
              className="text-primary hover:text-primary-hover"
            >
              View GitHub check →
            </a>
          )}
        </div>
      </div>

      {/* Summary card */}
      <div className="rounded-2xl border border-border bg-white p-6 mb-8">
        <div className="grid sm:grid-cols-3 gap-6 mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted mb-1">Risk score</div>
            <div className="text-3xl font-semibold text-foreground tabular-nums">
              {session.riskScore ?? "—"}<span className="text-lg text-muted">%</span>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted mb-1">Findings</div>
            <div className="text-3xl font-semibold text-foreground tabular-nums">{findings.length}</div>
            <div className="text-xs text-secondary mt-1">
              {highN} high · {medN} medium · {lowN} low
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted mb-1">Assessment</div>
            <p className="text-sm text-foreground leading-relaxed">
              {session.summary ?? (session.status === "running" ? "In progress…" : "No summary.")}
            </p>
          </div>
        </div>
      </div>

      {/* Findings */}
      <h2 className="text-xl font-semibold mb-4">Findings</h2>
      <div className="space-y-3 mb-12">
        {findings.length === 0 ? (
          <p className="text-sm text-secondary rounded-lg border border-border p-6 text-center">
            No findings — this PR passed every deterministic check and the model raised nothing new.
          </p>
        ) : (
          findings.map((f) => (
            <FindingCard key={f.id} finding={f} myVerdict={myFeedback[f.id]?.verdict} onFeedback={load} />
          ))
        )}
      </div>

      {/* Timeline */}
      <h2 className="text-xl font-semibold mb-4">Pipeline timeline</h2>
      <p className="text-sm text-secondary mb-4">
        Every stage of Ratify&apos;s pipeline that ran for this review, in order. This is what
        makes Ratify not-a-black-box: nothing happened here that isn&apos;t recorded below.
      </p>
      <ol className="rounded-2xl border border-border bg-white divide-y divide-border">
        {timeline.length === 0 ? (
          <li className="p-4 text-sm text-muted">No pipeline events recorded.</li>
        ) : (
          timeline.map((e) => <TimelineRow key={e.id} event={e} />)
        )}
      </ol>
    </div>
  );
}

function FindingCard({ finding, myVerdict, onFeedback }: { finding: Finding; myVerdict?: string; onFeedback: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localVerdict, setLocalVerdict] = useState(myVerdict);

  const sev = SEVERITY_STYLES[finding.severity] ?? SEVERITY_STYLES.low;

  const submit = async (verdict: string) => {
    setError(null); setSubmitting(true);
    try {
      const res = await fetch(`/api/findings/${finding.id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setLocalVerdict(verdict);
      onFeedback();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[11px] font-medium uppercase tracking-wider px-2 py-0.5 rounded border ${sev}`}>
              {finding.severity}
            </span>
            <span className="text-[11px] text-muted">
              {finding.source === "policy-engine" ? "deterministic check" : "model reasoning"}
              {" · "}confidence {(finding.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <h3 className="text-base font-semibold text-foreground">{finding.title}</h3>
          {finding.filePath && (
            <div className="text-xs text-muted mt-0.5 font-mono">{finding.filePath}</div>
          )}
        </div>
      </div>
      <p className="text-sm text-secondary leading-relaxed">{finding.description}</p>

      <div className="mt-4 pt-3 border-t border-border flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted mr-2">Was this useful?</span>
        {[
          { key: "accepted", label: "👍 Correct", color: "success" },
          { key: "false_positive", label: "👎 False positive", color: "danger" },
          { key: "exception", label: "Exception here", color: "warning" },
          { key: "needs_context", label: "Needs more context", color: "muted" },
        ].map((v) => (
          <button
            key={v.key}
            disabled={submitting}
            onClick={() => submit(v.key)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              localVerdict === v.key
                ? `bg-${v.color}/10 text-${v.color} border-${v.color}/30`
                : "border-border text-secondary hover:border-foreground/20 hover:text-foreground"
            } disabled:opacity-50`}
          >
            {v.label}
          </button>
        ))}
        {error && <span className="text-xs text-danger ml-2">{error}</span>}
      </div>
    </div>
  );
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  const label = STAGE_LABEL[event.stage] ?? event.stage;
  const isError = event.stage === "error";
  return (
    <li className="p-4 flex items-start gap-4">
      <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${isError ? "bg-danger" : event.stage === "skipped_duplicate" ? "bg-muted" : "bg-success"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-4">
          <span className={`text-sm font-medium ${isError ? "text-danger" : "text-foreground"}`}>{label}</span>
          <span className="text-xs text-muted tabular-nums whitespace-nowrap">
            {new Date(event.createdAt).toLocaleTimeString()}{event.durationMs !== null ? ` · ${event.durationMs}ms` : ""}
          </span>
        </div>
        {event.detail && Object.keys(event.detail).length > 0 && (
          <pre className="mt-2 text-[11px] bg-surface border border-border rounded p-2 overflow-x-auto text-secondary">
            {JSON.stringify(event.detail, null, 2)}
          </pre>
        )}
      </div>
    </li>
  );
}
