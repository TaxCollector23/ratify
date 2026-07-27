import type { Database } from "@ratify/db";
import { schema } from "@ratify/db";
import { and, eq } from "drizzle-orm";
import { getObjectStore, type ObjectStore } from "@ratify/storage";
import { orgStorageKey } from "@ratify/shared";
import type { MinedDocument, MinedPrecedent } from "./types.js";

/**
 * Persistence for mined DocumentArtifact + HistoricalPrecedent rows.
 * Document bodies are content-addressed into object storage (matching the
 * pattern used for webhook payloads / snapshots) — only the pointer +
 * hash live in Postgres.
 */
export class HistoryMinerStore {
  private readonly objectStore: ObjectStore;

  constructor(
    private readonly db: Database,
    private readonly orgId: string,
    objectStore?: ObjectStore,
  ) {
    this.objectStore = objectStore ?? getObjectStore();
  }

  async upsertDocument(repositoryId: string, doc: MinedDocument): Promise<string> {
    const key = orgStorageKey(this.orgId, "repositories", repositoryId, "documents", doc.filePath);
    const { contentHash } = await this.objectStore.putObject(key, doc.content, "text/plain");

    const existing = await this.db.query.documentArtifacts.findFirst({
      where: and(
        eq(schema.documentArtifacts.repositoryId, repositoryId),
        eq(schema.documentArtifacts.filePath, doc.filePath),
      ),
    });

    if (existing) {
      if (existing.contentHash === contentHash) return existing.id;
      await this.db
        .update(schema.documentArtifacts)
        .set({
          kind: doc.kind,
          title: doc.title,
          objectStorageKey: key,
          contentHash,
          commitSha: doc.commitSha,
          updatedAt: new Date(),
        })
        .where(eq(schema.documentArtifacts.id, existing.id));
      return existing.id;
    }

    const [row] = await this.db
      .insert(schema.documentArtifacts)
      .values({
        orgId: this.orgId,
        repositoryId,
        kind: doc.kind,
        filePath: doc.filePath,
        title: doc.title,
        objectStorageKey: key,
        contentHash,
        commitSha: doc.commitSha,
      })
      .returning({ id: schema.documentArtifacts.id });

    if (!row) throw new Error("Failed to insert document artifact");
    return row.id;
  }

  async upsertPrecedent(repositoryId: string, precedent: MinedPrecedent): Promise<string> {
    const existing = precedent.sourcePrNumber
      ? await this.db.query.historicalPrecedents.findFirst({
          where: and(
            eq(schema.historicalPrecedents.repositoryId, repositoryId),
            eq(schema.historicalPrecedents.sourcePrNumber, precedent.sourcePrNumber),
          ),
        })
      : precedent.sourceCommitSha
        ? await this.db.query.historicalPrecedents.findFirst({
            where: and(
              eq(schema.historicalPrecedents.repositoryId, repositoryId),
              eq(schema.historicalPrecedents.sourceCommitSha, precedent.sourceCommitSha),
            ),
          })
        : undefined;

    if (existing) {
      await this.db
        .update(schema.historicalPrecedents)
        .set({
          title: precedent.title,
          summary: precedent.summary,
          relatedPathGlobs: precedent.relatedPathGlobs,
          outcome: precedent.outcome,
          tags: precedent.tags,
          updatedAt: new Date(),
        })
        .where(eq(schema.historicalPrecedents.id, existing.id));
      return existing.id;
    }

    const [row] = await this.db
      .insert(schema.historicalPrecedents)
      .values({
        orgId: this.orgId,
        repositoryId,
        title: precedent.title,
        summary: precedent.summary,
        sourcePrNumber: precedent.sourcePrNumber,
        sourceCommitSha: precedent.sourceCommitSha,
        relatedPathGlobs: precedent.relatedPathGlobs,
        outcome: precedent.outcome,
        tags: precedent.tags,
      })
      .returning({ id: schema.historicalPrecedents.id });

    if (!row) throw new Error("Failed to insert historical precedent");
    return row.id;
  }

  async persistAll(repositoryId: string, documents: MinedDocument[], precedents: MinedPrecedent[]): Promise<{ documentIds: string[]; precedentIds: string[] }> {
    const documentIds = await Promise.all(documents.map((doc) => this.upsertDocument(repositoryId, doc)));
    const precedentIds = await Promise.all(precedents.map((p) => this.upsertPrecedent(repositoryId, p)));
    return { documentIds, precedentIds };
  }
}
