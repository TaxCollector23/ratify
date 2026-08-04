import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runPolicyChecks, type PrFile } from "@/lib/review/policy-checks";
import { runAstAnalysis } from "@/lib/review/ast-analysis";
import { runLlmReasoning } from "@/lib/review/llm-reason";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  code: z.string().min(1).max(50_000),
  filename: z.string().min(1).max(200).optional(),
  language: z.enum(["typescript", "javascript", "python", "go", "rust", "auto"]).default("auto"),
  title: z.string().max(200).optional(),
});

const EXT_BY_LANG: Record<string, string> = {
  typescript: "ts",
  javascript: "js",
  python: "py",
  go: "go",
  rust: "rs",
};

/**
 * POST /api/review-snippet
 *
 * Runs Ratify's full pipeline (deterministic policy engine + AST analysis
 * + 3-LLM consensus panel) against a pasted code snippet. No GitHub App
 * install required — the snippet is treated as a synthetic diff of a
 * single new file with every line added.
 *
 * Nothing is stored server-side; each call is stateless and discarded
 * after the response is returned. Rate-limited by IP at the edge (best-
 * effort, in-memory) so a single caller can't burn through free-tier LLM
 * quota.
 */
export async function POST(req: NextRequest) {
  if (!checkRateLimit(req)) {
    return NextResponse.json(
      { error: "Rate limit: max 10 snippet reviews per IP per minute. Try again shortly." },
      { status: 429 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: "Invalid body.", detail: String(err) }, { status: 400 });
  }

  const ext = body.filename?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
    ?? EXT_BY_LANG[body.language]
    ?? "txt";
  const filename = body.filename ?? `snippet.${ext}`;

  const patch = body.code.split("\n").map((line) => `+${line}`).join("\n");
  const file: PrFile = {
    filename,
    status: "added",
    additions: body.code.split("\n").length,
    deletions: 0,
    changes: body.code.split("\n").length,
    patch,
  };

  const t0 = Date.now();
  const policyFindings = runPolicyChecks([file]);
  const astFindings = runAstAnalysis([file]);
  const deterministicFindings = [...policyFindings, ...astFindings];
  const policyMs = Date.now() - t0;

  const t1 = Date.now();
  const llmResult = await runLlmReasoning(
    body.title ?? "Ad-hoc code snippet",
    [file],
    deterministicFindings,
    [], // no doctrine — this is an unknown repo
  );
  const llmMs = Date.now() - t1;

  return NextResponse.json({
    ok: true,
    findings: [...deterministicFindings, ...(llmResult?.findings ?? [])],
    summary: llmResult?.summary ?? null,
    verdict: llmResult?.verdict ?? null,
    consensusConfidence: llmResult?.consensusConfidence ?? null,
    votes: llmResult?.votes ?? [],
    timing: {
      totalMs: Date.now() - t0,
      deterministicMs: policyMs,
      llmMs,
    },
    filename,
    linesReviewed: file.additions,
  });
}

const HITS = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
function checkRateLimit(req: NextRequest): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  const now = Date.now();
  const arr = HITS.get(ip) ?? [];
  const recent = arr.filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    HITS.set(ip, recent);
    return false;
  }
  recent.push(now);
  HITS.set(ip, recent);
  return true;
}
