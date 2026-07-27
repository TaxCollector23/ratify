import { schema } from "@ratify/db";
import { and, eq } from "drizzle-orm";
import { runWorker, type RepoDoctrineInferPayload } from "@ratify/queue";
import { mineDoctrineCandidates, DoctrineStore, type RawHistorySignal } from "@ratify/doctrine";
import { RatifyError } from "@ratify/shared";
import type { WorkerContext } from "../context.js";

type RepositoryProfile = NonNullable<(typeof schema.repositories.$inferSelect)["profile"]>;

/**
 * repo.doctrine_infer: the terminal stage of REPOSITORY_INDEXING_FLOW.
 * Re-derives RawHistorySignals from the persisted DoctrineSource-shaped
 * evidence (documents, precedents, CODEOWNERS) via
 * @ratify/history-miner's signal builders, feeds them into
 * @ratify/doctrine's deterministic candidate miner, persists DoctrineRule
 * rows, and generates/updates the repository's denormalized profile JSON.
 */
export function startRepoDoctrineInferWorker(ctx: WorkerContext) {
  const { db, logger, metrics } = ctx;

  return runWorker<RepoDoctrineInferPayload>({
    db,
    jobType: "repo.doctrine_infer",
    logger,
    handler: async (payload) => {
      const startedAt = Date.now();

      const repository = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, payload.repositoryId),
      });
      if (!repository) {
        throw new RatifyError({ code: "NOT_FOUND", message: `Repository ${payload.repositoryId} not found` });
      }

      const signals = await buildDoctrineSignalsFromPersistedHistory(db, payload.repositoryId);
      const candidates = mineDoctrineCandidates(signals);

      const store = new DoctrineStore(db, payload.orgId);
      const ruleIds = await Promise.all(candidates.map((c) => store.upsertCandidate(repository.id, c)));

      const profile = await buildRepositoryProfile(db, repository.id, candidates.length);
      await db
        .update(schema.repositories)
        .set({ profile, indexingStatus: "ready", updatedAt: new Date() })
        .where(eq(schema.repositories.id, repository.id));

      await metrics.emit({
        name: "doctrine.inferred",
        orgId: payload.orgId,
        repositoryId: repository.id,
        jobId: payload.jobId,
        durationMs: Date.now() - startedAt,
        success: true,
        attributes: { ruleCount: ruleIds.length },
      });

      await metrics.emit({
        name: "repo.index.completed",
        orgId: payload.orgId,
        repositoryId: repository.id,
        jobId: payload.jobId,
      });

      // Terminal stage of REPOSITORY_INDEXING_FLOW — nothing further to enqueue.
      return { ruleCount: ruleIds.length, profile };
    },
  });
}

/**
 * Reconstructs RawHistorySignals from what repo.history_mine already
 * persisted (DocumentArtifact + HistoricalPrecedent + RepositoryOwners),
 * rather than re-parsing the working tree — this keeps doctrine inference
 * decoupled from git/filesystem access and safely re-runnable on its own.
 */
async function buildDoctrineSignalsFromPersistedHistory(
  db: WorkerContext["db"],
  repositoryId: string,
): Promise<RawHistorySignal[]> {
  const [documents, precedents, owners] = await Promise.all([
    db.query.documentArtifacts.findMany({ where: eq(schema.documentArtifacts.repositoryId, repositoryId) }),
    db.query.historicalPrecedents.findMany({ where: eq(schema.historicalPrecedents.repositoryId, repositoryId) }),
    db.query.repositoryOwners.findMany({ where: eq(schema.repositoryOwners.repositoryId, repositoryId) }),
  ]);

  const signals: RawHistorySignal[] = [];

  for (const doc of documents) {
    if (doc.kind === "ci-config") {
      signals.push({ kind: "ci-config", ref: doc.filePath, text: `CI enforces configuration defined in ${doc.filePath}`, scopeGlobs: [] });
    } else if (doc.kind === "adr" || doc.kind === "rfc") {
      signals.push({ kind: "adr", ref: doc.filePath, text: doc.title ?? doc.filePath, scopeGlobs: [] });
    } else if (doc.kind === "readme") {
      signals.push({ kind: "readme", ref: doc.filePath, text: doc.title ?? doc.filePath, scopeGlobs: [] });
    } else if (doc.kind === "doc") {
      signals.push({ kind: "doc", ref: doc.filePath, text: doc.title ?? doc.filePath, scopeGlobs: [] });
    }
  }

  for (const precedent of precedents) {
    signals.push({
      kind: "merged-pr",
      ref: precedent.sourcePrNumber ?? precedent.sourceCommitSha ?? precedent.id,
      text: precedent.title,
      scopeGlobs: precedent.relatedPathGlobs,
    });
  }

  const ownersByGlob = new Map<string, string[]>();
  for (const owner of owners) {
    const list = ownersByGlob.get(owner.pathGlob) ?? [];
    list.push(owner.ownerHandle);
    ownersByGlob.set(owner.pathGlob, list);
  }
  for (const [pathGlob, handles] of ownersByGlob) {
    signals.push({
      kind: "codeowners",
      ref: ".github/CODEOWNERS",
      text: `Changes under ${pathGlob} require review from ${handles.join(", ")}`,
      scopeGlobs: [pathGlob],
    });
  }

  return signals;
}

/** Builds the denormalized RepositoryProfile JSON stored on Repository.profile for fast dashboard reads. */
async function buildRepositoryProfile(
  db: WorkerContext["db"],
  repositoryId: string,
  doctrineCandidateCount: number,
): Promise<RepositoryProfile> {
  const [symbolNodes, docs, precedents] = await Promise.all([
    db.query.graphNodes.findMany({ where: and(eq(schema.graphNodes.repositoryId, repositoryId), eq(schema.graphNodes.kind, "file")) }),
    db.query.documentArtifacts.findMany({ where: eq(schema.documentArtifacts.repositoryId, repositoryId) }),
    db.query.historicalPrecedents.findMany({ where: eq(schema.historicalPrecedents.repositoryId, repositoryId) }),
  ]);

  const languageCounts = new Map<string, number>();
  for (const node of symbolNodes) {
    const language = (node.metadata as { language?: string } | null)?.language;
    if (language) languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
  }
  const primaryLanguages = [...languageCounts.entries()].sort((a, b) => b[1] - a[1]).map(([lang]) => lang).slice(0, 5);

  const hasTests = symbolNodes.some((n) => /\.(test|spec)\./.test(n.externalRef) || n.externalRef.includes("__tests__/"));
  const riskAreas = [...new Set(precedents.filter((p) => p.outcome === "rejected").flatMap((p) => p.relatedPathGlobs))].slice(0, 10);

  return {
    primaryLanguages,
    frameworks: [], // requires package.json dependency inspection; left for a future refinement pass
    packageManagers: [],
    testStrategy: hasTests ? "co-located test files" : null,
    ownershipPatterns: [],
    architecturePatterns: [],
    docCoveragePct: symbolNodes.length > 0 ? Math.round((docs.length / symbolNodes.length) * 100) : 0,
    historicalRiskAreas: riskAreas,
    doctrineCandidateCount,
    generatedAt: new Date().toISOString(),
  };
}
