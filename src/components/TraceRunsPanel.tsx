"use client";

// Local Trace runs synced from the desktop daemon via the hosted
// trace-cloud-api. Rendered inside the shared Trace + Ratify dashboard so
// one sign-in sees both surfaces.
//
// Reads from `${TRACE_CLOUD_URL}/v1/runs` with the user's per-device
// bearer token, entered once here and cached in localStorage. Keeping the
// token in the browser (rather than a shared cookie) mirrors how the
// daemon holds it — the cloud API never sees anyone else's runs.

import { useEffect, useState } from "react";

interface RunSummary {
  id: string;
  project_name: string;
  agent_name: string | null;
  command: string;
  user_prompt: string | null;
  status: string;
  exit_code: number | null;
  created_at: string;
  completed_at: string | null;
  event_count: number;
}

const CLOUD_URL =
  process.env.NEXT_PUBLIC_TRACE_CLOUD_URL ?? "https://trace-cloud-api.onrender.com";
const TOKEN_KEY = "trace_cloud_token";

export default function TraceRunsPanel() {
  const [token, setToken] = useState<string>("");
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null;
    if (saved) setToken(saved);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${CLOUD_URL}/v1/runs?limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (r.status === 401) throw new Error("Invalid token — check the one from your desktop app.");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as RunSummary[];
      })
      .then((rows) => {
        if (!cancelled) setRuns(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e.message ?? e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  function saveToken(v: string) {
    setToken(v);
    if (typeof window !== "undefined") {
      if (v) window.localStorage.setItem(TOKEN_KEY, v);
      else window.localStorage.removeItem(TOKEN_KEY);
    }
  }

  if (!token) {
    return (
      <div className="rounded-2xl border border-border bg-white/50 p-8">
        <h3 className="text-lg font-semibold text-foreground">Connect your Trace desktop app</h3>
        <p className="mt-2 text-sm text-secondary">
          Runs synced from your local Trace daemon show up here. To enable sync, set
          <code className="mx-1 rounded bg-black/5 px-1.5 py-0.5 text-xs">TRACE_CLOUD_URL</code>
          and
          <code className="mx-1 rounded bg-black/5 px-1.5 py-0.5 text-xs">TRACE_CLOUD_TOKEN</code>
          on the daemon, then paste the same token below.
        </p>
        <p className="mt-2 text-xs text-secondary">
          Anything you paste stays in <em>your</em> browser (localStorage) and is only sent to
          <code className="mx-1 rounded bg-black/5 px-1.5 py-0.5 text-xs">{CLOUD_URL}</code>.
        </p>
        <div className="mt-6 flex gap-3">
          <input
            type="password"
            placeholder="trace_..."
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") saveToken((e.target as HTMLInputElement).value.trim());
            }}
          />
          <button
            onClick={(e) => {
              const el = (e.currentTarget.previousSibling as HTMLInputElement) ?? null;
              if (el) saveToken(el.value.trim());
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white"
          >
            Connect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between text-xs text-secondary">
        <div>
          Reading from <code className="rounded bg-black/5 px-1.5 py-0.5">{CLOUD_URL}</code>
        </div>
        <button onClick={() => saveToken("")} className="hover:text-foreground">
          Disconnect
        </button>
      </div>

      {loading && <div className="text-sm text-secondary">Loading…</div>}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}
      {runs && runs.length === 0 && (
        <div className="rounded-2xl border border-border bg-white/50 p-8 text-center text-sm text-secondary">
          No synced runs yet. Trigger a run locally with a Trace-installed agent and it will appear here within a second.
        </div>
      )}
      {runs && runs.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-white">
          {runs.map((r) => (
            <li key={r.id} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4 hover:bg-black/[0.02]">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{r.project_name}</span>
                  {r.agent_name && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                      {r.agent_name}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                      r.status === "completed"
                        ? "bg-emerald-100 text-emerald-700"
                        : r.status === "failed"
                          ? "bg-red-100 text-red-700"
                          : "bg-black/10 text-secondary"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <div className="mt-1 truncate font-mono text-xs text-secondary">{r.command}</div>
                {r.user_prompt && (
                  <div className="mt-1 truncate text-xs text-secondary">&ldquo;{r.user_prompt}&rdquo;</div>
                )}
              </div>
              <div className="flex flex-col items-end text-right text-xs text-secondary">
                <div>{new Date(r.created_at).toLocaleString()}</div>
                <div className="mt-1">{r.event_count} events</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
