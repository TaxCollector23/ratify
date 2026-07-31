"use client";

// Local Trace runs panel.
//
// Two data paths, tried in order:
//   1. **Local daemon** (default, zero-setup) — the browser probes
//      http://127.0.0.1:8757 on the visitor's machine and reads their
//      runs directly. Nothing routes through us or any cloud API. This
//      works out of the box for anyone who has `trace daemon start`
//      running, matching the hosted /dashboard on the landing.
//   2. **Cloud sync** (opt-in) — if NEXT_PUBLIC_TRACE_CLOUD_URL is set
//      AND a bearer token is entered, we hit that URL instead. Meant
//      for people syncing runs across devices via a self-hosted
//      trace-cloud-api. Ignored when unset so the panel doesn't try
//      an onrender.com URL that isn't provisioned.
//
// Same trust model as the hosted /dashboard: browser talks direct to
// the visitor's own machine, never to us.

import { useEffect, useState } from "react";

interface RunSummary {
  id: string;
  project_name?: string;
  project_id?: string;
  agent_name: string | null;
  command: string;
  user_prompt: string | null;
  status: string;
  exit_code?: number | null;
  created_at?: string;
  completed_at?: string | null;
  event_count?: number;
  started_at?: string;
  ended_at?: string | null;
}

const CLOUD_URL = process.env.NEXT_PUBLIC_TRACE_CLOUD_URL ?? "";
const LOCAL_PORT = 8757;
const TOKEN_KEY = "trace_cloud_token";

type Mode = "local" | "cloud";

async function probeLocal(): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${LOCAL_PORT}/api/health`, { cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}

export default function TraceRunsPanel() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [token, setToken] = useState<string>("");
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // On mount: try local first. If unreachable, fall back to cloud mode
  // (which requires a token). This is the "zero-setup wins" order.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null;
    if (saved) setToken(saved);
    probeLocal().then((ok) => setMode(ok ? "local" : "cloud"));
  }, []);

  // Fetch runs whenever mode/token settles.
  useEffect(() => {
    if (mode === null) return;
    if (mode === "cloud" && (!token || !CLOUD_URL)) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const url =
      mode === "local"
        ? `http://127.0.0.1:${LOCAL_PORT}/api/runs?limit=50`
        : `${CLOUD_URL}/v1/runs?limit=50`;
    const headers: Record<string, string> = mode === "cloud" ? { Authorization: `Bearer ${token}` } : {};

    fetch(url, { headers, cache: "no-store" })
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
  }, [mode, token]);

  function saveToken(v: string) {
    setToken(v);
    if (typeof window !== "undefined") {
      if (v) window.localStorage.setItem(TOKEN_KEY, v);
      else window.localStorage.removeItem(TOKEN_KEY);
    }
  }

  if (mode === null) {
    return <div className="text-sm text-secondary">Probing your local Trace daemon…</div>;
  }

  // Cloud mode without a token — show the connect form. If CLOUD_URL isn't
  // configured we skip this entirely and drop to the no-daemon block below.
  if (mode === "cloud" && !token && CLOUD_URL) {
    return (
      <div className="rounded-2xl border border-border bg-white/50 p-8">
        <h3 className="text-lg font-semibold text-foreground">Cloud sync (opt-in)</h3>
        <p className="mt-2 text-sm text-secondary">
          Your local Trace daemon isn&apos;t reachable from this browser. Paste your cloud sync
          bearer token to view runs from
          <code className="mx-1 rounded bg-black/5 px-1.5 py-0.5 text-xs">{CLOUD_URL}</code>
          instead. Anything you paste stays in your browser (localStorage).
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

  // No local daemon AND no cloud URL configured — show install instructions.
  if (mode === "cloud" && !CLOUD_URL) {
    return (
      <div className="rounded-2xl border border-border bg-white/50 p-8">
        <h3 className="text-lg font-semibold text-foreground">Start the Trace daemon to see runs here</h3>
        <p className="mt-2 text-sm text-secondary">
          This panel reads runs from your Trace daemon on
          <code className="mx-1 rounded bg-black/5 px-1.5 py-0.5 text-xs">127.0.0.1:{LOCAL_PORT}</code>.
          It isn&apos;t running right now.
        </p>
        <ol className="mt-6 space-y-3 text-sm text-foreground">
          <li>
            <span className="font-medium">1.</span> Install:
            <pre className="mt-1 overflow-x-auto rounded-lg bg-black/90 p-3 font-mono text-xs text-white">
              curl -fsSL https://landing-one-hazel-88.vercel.app/install.sh | sh
            </pre>
          </li>
          <li>
            <span className="font-medium">2.</span> Start:
            <pre className="mt-1 overflow-x-auto rounded-lg bg-black/90 p-3 font-mono text-xs text-white">
              trace daemon start
            </pre>
          </li>
          <li>
            <span className="font-medium">3.</span> Reload this tab.
          </li>
        </ol>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between text-xs text-secondary">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          {mode === "local" ? (
            <>
              Local daemon on <code className="rounded bg-black/5 px-1.5 py-0.5">127.0.0.1:{LOCAL_PORT}</code>
            </>
          ) : (
            <>
              Cloud sync via <code className="rounded bg-black/5 px-1.5 py-0.5">{CLOUD_URL}</code>
            </>
          )}
        </div>
        {mode === "cloud" && (
          <button onClick={() => saveToken("")} className="hover:text-foreground">
            Disconnect
          </button>
        )}
      </div>

      {loading && <div className="text-sm text-secondary">Loading…</div>}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}
      {runs && runs.length === 0 && (
        <div className="rounded-2xl border border-border bg-white/50 p-8 text-center text-sm text-secondary">
          No runs yet. Start any agent through <code className="rounded bg-black/5 px-1.5 py-0.5">trace run</code> or wire up hooks with
          <code className="ml-1 rounded bg-black/5 px-1.5 py-0.5">trace integrations install all</code>.
        </div>
      )}
      {runs && runs.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-white">
          {runs.map((r) => {
            const when = r.created_at ?? r.started_at ?? "";
            return (
              <li key={r.id} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4 hover:bg-black/[0.02]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {r.project_name && (
                      <span className="text-sm font-medium text-foreground">{r.project_name}</span>
                    )}
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
                  <div>{when ? new Date(when).toLocaleString() : ""}</div>
                  {typeof r.event_count === "number" && <div className="mt-1">{r.event_count} events</div>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
