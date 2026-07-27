import type { DoctrineCandidate, DoctrineSignal } from "./types.js";
import { scoreDoctrineCandidate, classifyDoctrineKind } from "./scoring.js";
import type { ScoredDoctrineCandidate } from "./types.js";

export interface RawHistorySignal {
  kind: DoctrineSignal["kind"];
  ref: string;
  text: string;
  scopeGlobs?: string[];
}

/**
 * Deterministic doctrine candidate miner. Groups raw mined signals (review
 * comments, commit messages, CI config, CODEOWNERS, docs) into candidate
 * rules by simple repeated-phrase clustering, then scores each cluster's
 * confidence via packages/doctrine/scoring.ts. This is intentionally
 * conservative and explainable — the LLM is only used later (in
 * llm-reasoner / doctrine-refinement passes, not implemented here) to turn
 * a *confirmed structured* rule into nicer prose, never to invent the rule.
 */
export function mineDoctrineCandidates(signals: RawHistorySignal[]): ScoredDoctrineCandidate[] {
  const clusters = clusterByNormalizedPhrase(signals);

  const candidates: DoctrineCandidate[] = clusters.map((cluster) => {
    const representative = cluster[0]!;
    const key = slugify(representative.text);
    return {
      key,
      title: titleCase(representative.text),
      statement: representative.text,
      kind: "soft-norm",
      scopeGlobs: dedupe(cluster.flatMap((s) => s.scopeGlobs ?? [])),
      signals: cluster.map((s) => ({ kind: s.kind, ref: s.ref, excerpt: s.text, strength: 0.7 })),
    };
  });

  return candidates
    .map((c) => scoreDoctrineCandidate(c))
    .map((scored) => ({ ...scored, kind: classifyDoctrineKind(scored) }));
}

/** Groups signals whose normalized text is identical or near-identical (simple token-overlap heuristic). */
function clusterByNormalizedPhrase(signals: RawHistorySignal[]): RawHistorySignal[][] {
  const buckets = new Map<string, RawHistorySignal[]>();
  for (const signal of signals) {
    const key = normalize(signal.text);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(signal);
    else buckets.set(key, [signal]);
  }
  // Only keep clusters with >=2 corroborating signals OR any single ci-config/codeowners signal
  // (those are structurally enforced, not just opinion, so they stand alone).
  return [...buckets.values()].filter(
    (cluster) => cluster.length >= 2 || cluster.some((s) => s.kind === "ci-config" || s.kind === "codeowners"),
  );
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .sort()
    .join(" ");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .slice(0, 8)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}
