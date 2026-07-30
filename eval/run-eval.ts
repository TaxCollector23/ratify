/**
 * Ratify evaluation harness.
 *
 * Reads eval/pr-set.json, fetches each PR's files from the public GitHub
 * API (unauthenticated — public repos only), runs Ratify's deterministic
 * policy engine + LLM reasoning against each, and writes
 * public/eval-results.json which the /benchmarks page loads and renders.
 *
 * Every number on the benchmarks page comes from this file. If you don't
 * trust the numbers, run this script yourself: `npx tsx eval/run-eval.ts`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { runPolicyChecks, type PrFile } from "../src/lib/review/policy-checks";
import { runLlmReasoning } from "../src/lib/review/llm-reason";

interface PrSpec {
  owner: string;
  repo: string;
  number: number;
  expected: string;
}

interface EvalRow {
  pr: PrSpec;
  title: string | null;
  filesFetched: number;
  policyFindings: number;
  policyFindingKeys: string[];
  llmFindings: number | null;
  llmSummary: string | null;
  llmError: string | null;
  policyMs: number;
  llmMs: number | null;
  totalMs: number;
}

interface EvalReport {
  generatedAt: string;
  totalPrs: number;
  totalPolicyFindings: number;
  totalLlmFindings: number;
  avgPolicyMs: number;
  avgLlmMs: number | null;
  ruleFireFrequency: Record<string, number>;
  rows: EvalRow[];
}

async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "ratify-eval-harness" } });
      // Retry on server errors and rate limits, not on hard 404s.
      if (res.ok || (res.status !== 429 && res.status < 500)) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function fetchPr(owner: string, repo: string, number: number): Promise<{ title: string; files: PrFile[] }> {
  const prRes = await fetchWithRetry(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`);
  if (!prRes.ok) throw new Error(`PR fetch failed for ${owner}/${repo}#${number}: ${prRes.status}`);
  const filesRes = await fetchWithRetry(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`);
  if (!filesRes.ok) throw new Error(`PR files fetch failed for ${owner}/${repo}#${number}: ${filesRes.status}`);
  const pr = (await prRes.json()) as { title: string };
  const files = (await filesRes.json()) as PrFile[];
  return { title: pr.title, files };
}

async function runOne(spec: PrSpec, options: { withLlm: boolean }): Promise<EvalRow> {
  const totalStart = Date.now();
  console.log(`[eval] ${spec.owner}/${spec.repo}#${spec.number}`);

  let title: string | null = null;
  let files: PrFile[] = [];
  try {
    const fetched = await fetchPr(spec.owner, spec.repo, spec.number);
    title = fetched.title;
    files = fetched.files;
  } catch (err) {
    console.error(`  fetch failed: ${err}`);
    return {
      pr: spec, title: null, filesFetched: 0,
      policyFindings: 0, policyFindingKeys: [], llmFindings: null,
      llmSummary: null, llmError: `fetch: ${String(err)}`,
      policyMs: 0, llmMs: null, totalMs: Date.now() - totalStart,
    };
  }

  const policyStart = Date.now();
  const policyFindings = runPolicyChecks(files);
  const policyMs = Date.now() - policyStart;

  let llmFindings: number | null = null;
  let llmSummary: string | null = null;
  let llmError: string | null = null;
  let llmMs: number | null = null;
  if (options.withLlm) {
    const llmStart = Date.now();
    try {
      const result = await runLlmReasoning(title ?? `PR #${spec.number}`, files, policyFindings, []);
      llmMs = Date.now() - llmStart;
      if (result) {
        llmFindings = result.findings.length;
        llmSummary = result.summary.slice(0, 240);
      } else {
        llmError = "runLlmReasoning returned null (see server logs for the fallback chain trace)";
      }
    } catch (err) {
      llmMs = Date.now() - llmStart;
      llmError = String(err);
    }
  }

  console.log(`  files=${files.length}  policyFindings=${policyFindings.length}  llmFindings=${llmFindings ?? "-"}  policyMs=${policyMs}  llmMs=${llmMs ?? "-"}`);

  return {
    pr: spec, title, filesFetched: files.length,
    policyFindings: policyFindings.length,
    policyFindingKeys: policyFindings.map((f) => f.ruleKey),
    llmFindings, llmSummary, llmError,
    policyMs, llmMs, totalMs: Date.now() - totalStart,
  };
}

async function main() {
  const withLlm = !process.argv.includes("--no-llm") && Boolean(process.env.OPENROUTER_API_KEY);
  console.log(`[eval] LLM enabled: ${withLlm}`);

  const specFile = JSON.parse(readFileSync("./eval/pr-set.json", "utf-8")) as { prs: PrSpec[] };
  const rows: EvalRow[] = [];
  for (const spec of specFile.prs) {
    rows.push(await runOne(spec, { withLlm }));
    // Small delay between PRs to be polite to GitHub's unauth rate limit
    // (60 req/hour). Each PR is 2 requests, so 15 PRs = 30 requests.
    await new Promise((r) => setTimeout(r, 800));
  }

  const ok = rows.filter((r) => r.filesFetched > 0);
  const totalPolicyFindings = ok.reduce((s, r) => s + r.policyFindings, 0);
  const totalLlmFindings = ok.reduce((s, r) => s + (r.llmFindings ?? 0), 0);
  const avgPolicyMs = Math.round(ok.reduce((s, r) => s + r.policyMs, 0) / Math.max(ok.length, 1));
  const llmRows = ok.filter((r) => r.llmMs !== null);
  const avgLlmMs = llmRows.length > 0 ? Math.round(llmRows.reduce((s, r) => s + (r.llmMs ?? 0), 0) / llmRows.length) : null;

  const ruleFireFrequency: Record<string, number> = {};
  for (const r of ok) {
    for (const k of r.policyFindingKeys) {
      ruleFireFrequency[k] = (ruleFireFrequency[k] ?? 0) + 1;
    }
  }

  const report: EvalReport = {
    generatedAt: new Date().toISOString(),
    totalPrs: rows.length,
    totalPolicyFindings,
    totalLlmFindings,
    avgPolicyMs,
    avgLlmMs,
    ruleFireFrequency,
    rows,
  };

  writeFileSync("./public/eval-results.json", JSON.stringify(report, null, 2));
  console.log("\n[eval] wrote ./public/eval-results.json");
  console.log(`  PRs: ${rows.length}  (${ok.length} fetched successfully)`);
  console.log(`  Policy findings: ${totalPolicyFindings}  |  LLM findings: ${totalLlmFindings}`);
  console.log(`  Avg policy latency: ${avgPolicyMs}ms  |  Avg LLM latency: ${avgLlmMs ?? "-"}ms`);
}

main().catch((err) => {
  console.error("[eval] fatal:", err);
  process.exit(1);
});
