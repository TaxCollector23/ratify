"use client";

import { useEffect, useState } from "react";

interface Analytics {
  totalReviews: number;
  avgRiskScore: number | null;
  findingsThisWeek: number;
  severityBreakdown: { low: number; medium: number; high: number };
  volumeByDay: { day: string; count: number }[];
}

export default function AnalyticsPanel() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analytics", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          setError("Could not load analytics.");
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d) setData(d as Analytics);
      })
      .catch(() => setError("Network error loading analytics."));
  }, []);

  if (error) {
    return <div className="rounded-lg border border-danger/30 bg-danger/[0.04] p-4 text-sm text-danger">{error}</div>;
  }

  if (!data) {
    return <p className="text-sm text-secondary">Loading analytics…</p>;
  }

  const maxDay = Math.max(1, ...data.volumeByDay.map((d) => d.count));

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="rounded-xl border border-border bg-white p-5">
        <div className="text-2xl font-semibold text-foreground tabular-nums mb-1">{data.totalReviews}</div>
        <div className="text-xs text-secondary">Total reviews</div>
      </div>
      <div className="rounded-xl border border-border bg-white p-5">
        <div className="text-2xl font-semibold text-foreground tabular-nums mb-1">
          {data.avgRiskScore === null ? "—" : `${Math.round(data.avgRiskScore)}%`}
        </div>
        <div className="text-xs text-secondary">Avg risk score</div>
      </div>
      <div className="rounded-xl border border-border bg-white p-5">
        <div className="text-2xl font-semibold text-foreground tabular-nums mb-1">{data.findingsThisWeek}</div>
        <div className="text-xs text-secondary">Findings this week</div>
      </div>

      <div className="rounded-xl border border-border bg-white p-5 md:col-span-3">
        <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
          Findings by day · last 7 days
        </div>
        <div className="flex items-end gap-3 h-24">
          {data.volumeByDay.map((d) => (
            <div key={d.day} className="flex-1 flex flex-col items-center justify-end">
              <div
                className="w-full bg-primary rounded-t"
                style={{ height: `${(d.count / maxDay) * 100}%`, minHeight: d.count > 0 ? 4 : 0 }}
                title={`${d.count} findings on ${d.day}`}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-2">
          {data.volumeByDay.map((d) => (
            <span key={d.day} className="flex-1 text-center text-[11px] text-muted">
              {new Date(d.day).toLocaleDateString(undefined, { weekday: "short" })}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-white p-5 md:col-span-3">
        <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
          Findings by severity · last 7 days
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-danger/[0.06] p-3 text-center">
            <div className="text-xl font-semibold text-danger tabular-nums">{data.severityBreakdown.high}</div>
            <div className="text-xs text-secondary">High</div>
          </div>
          <div className="rounded-lg bg-warning/[0.08] p-3 text-center">
            <div className="text-xl font-semibold text-warning tabular-nums">{data.severityBreakdown.medium}</div>
            <div className="text-xs text-secondary">Medium</div>
          </div>
          <div className="rounded-lg bg-success/[0.06] p-3 text-center">
            <div className="text-xl font-semibold text-success tabular-nums">{data.severityBreakdown.low}</div>
            <div className="text-xs text-secondary">Low</div>
          </div>
        </div>
      </div>
    </div>
  );
}
