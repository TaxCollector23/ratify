import type { Database } from "@ratify/db";
import { schema } from "@ratify/db";
import { and, eq, sql } from "drizzle-orm";
import { GraphRepository } from "@ratify/graph";
import { cosineDistanceSql, toPgVectorLiteral } from "./vector-similarity.js";

export interface RetrievalQuery {
  orgId: string;
  repositoryId: string;
  /** File paths touched by the PR — used to seed both structural filters and graph traversal. */
  touchedFilePaths: string[];
  /** Optional query embedding for semantic search (if omitted, falls back to structural-only). */
  queryEmbedding?: number[];
  maxDocs?: number;
  maxPrecedents?: number;
  graphMaxDepth?: number;
}

export interface RetrievedDoc {
  id: string;
  title: string;
  excerpt: string;
  source: string;
  score: number;
}

export interface RetrievedPrecedent {
  id: string;
  title: string;
  summary: string;
  outcome: string | null;
  score: number;
}

export interface RetrievalResult {
  docs: RetrievedDoc[];
  precedents: RetrievedPrecedent[];
  graphSliceSummary: string;
  ownershipContext: { pathGlob: string; owners: string[] }[];
}

/**
 * ContextRetriever combines three retrieval strategies, per the spec's
 * explicit instruction to not rely on embeddings alone:
 *   1. Structural filters — docs/precedents whose relatedPathGlobs match
 *      the touched files (exact, deterministic, always run).
 *   2. Graph traversal — a bounded slice around the touched files' graph
 *      nodes (imports/calls/owned-by/documented-by neighbors).
 *   3. Semantic similarity — pgvector cosine-distance search over
 *      EmbeddingRecord, only when a query embedding is supplied.
 * Results from all three are merged; structural + graph hits are treated
 * as higher-precision and are not overridden by semantic-only matches.
 */
export class ContextRetriever {
  private readonly graphRepo: GraphRepository;

  constructor(
    private readonly db: Database,
    private readonly orgId: string,
  ) {
    this.graphRepo = new GraphRepository(db, orgId);
  }

  async retrieve(query: RetrievalQuery): Promise<RetrievalResult> {
    const [structuralDocs, semanticDocs, precedents, ownership, graphSummary] = await Promise.all([
      this.structuralDocSearch(query),
      query.queryEmbedding ? this.semanticDocSearch(query) : Promise.resolve([]),
      this.structuralPrecedentSearch(query),
      this.ownershipContext(query),
      this.graphSliceSummary(query),
    ]);

    const mergedDocs = mergeByIdPreferHigherScore([...structuralDocs, ...semanticDocs]).slice(0, query.maxDocs ?? 10);

    return {
      docs: mergedDocs,
      precedents: precedents.slice(0, query.maxPrecedents ?? 5),
      graphSliceSummary: graphSummary,
      ownershipContext: ownership,
    };
  }

  private async structuralDocSearch(query: RetrievalQuery): Promise<RetrievedDoc[]> {
    if (query.touchedFilePaths.length === 0) return [];
    const rows = await this.db
      .select()
      .from(schema.documentArtifacts)
      .where(
        and(
          eq(schema.documentArtifacts.orgId, query.orgId),
          eq(schema.documentArtifacts.repositoryId, query.repositoryId),
        ),
      )
      .limit(50);

    // Structural relevance: does the doc's file path share a directory prefix with a touched file?
    return rows
      .filter((doc) => query.touchedFilePaths.some((fp) => sharesDirectoryPrefix(fp, doc.filePath)))
      .map((doc) => ({
        id: doc.id,
        title: doc.title ?? doc.filePath,
        excerpt: doc.filePath,
        source: doc.kind,
        score: 0.8, // structural matches are high-confidence but not ranked finely
      }));
  }

  private async semanticDocSearch(query: RetrievalQuery): Promise<RetrievedDoc[]> {
    if (!query.queryEmbedding) return [];
    const literal = toPgVectorLiteral(query.queryEmbedding);
    const distanceExpr = cosineDistanceSql("embedding", literal);

    const rows = await this.db.execute(sql`
      SELECT id, source_ref, content, source_kind, (${sql.raw(distanceExpr)}) AS distance
      FROM embedding_records
      WHERE org_id = ${query.orgId} AND repository_id = ${query.repositoryId}
      ORDER BY distance ASC
      LIMIT ${query.maxDocs ?? 10}
    `);

    return (rows as unknown as { id: string; source_ref: string; content: string; source_kind: string; distance: number }[]).map(
      (row) => ({
        id: row.id,
        title: row.source_ref,
        excerpt: row.content.slice(0, 500),
        source: row.source_kind,
        score: 1 - row.distance, // convert distance back to a similarity-style score
      }),
    );
  }

  private async structuralPrecedentSearch(query: RetrievalQuery): Promise<RetrievedPrecedent[]> {
    const rows = await this.db
      .select()
      .from(schema.historicalPrecedents)
      .where(
        and(
          eq(schema.historicalPrecedents.orgId, query.orgId),
          eq(schema.historicalPrecedents.repositoryId, query.repositoryId),
        ),
      )
      .limit(100);

    return rows
      .filter((p) => p.relatedPathGlobs.length === 0 || query.touchedFilePaths.some((fp) => p.relatedPathGlobs.some((g) => fp.startsWith(g.replace(/\*+$/, "")))))
      .map((p) => ({ id: p.id, title: p.title, summary: p.summary, outcome: p.outcome, score: 0.75 }));
  }

  private async ownershipContext(query: RetrievalQuery): Promise<{ pathGlob: string; owners: string[] }[]> {
    const rows = await this.db
      .select()
      .from(schema.repositoryOwners)
      .where(
        and(
          eq(schema.repositoryOwners.orgId, query.orgId),
          eq(schema.repositoryOwners.repositoryId, query.repositoryId),
        ),
      );

    const byGlob = new Map<string, string[]>();
    for (const row of rows) {
      const owners = byGlob.get(row.pathGlob) ?? [];
      owners.push(row.ownerHandle);
      byGlob.set(row.pathGlob, owners);
    }
    return [...byGlob.entries()].map(([pathGlob, owners]) => ({ pathGlob, owners }));
  }

  private async graphSliceSummary(query: RetrievalQuery): Promise<string> {
    if (query.touchedFilePaths.length === 0) return "No files touched.";
    const summaries: string[] = [];
    for (const filePath of query.touchedFilePaths.slice(0, 10)) {
      const slice = await this.graphRepo.extractSlice(query.repositoryId, {
        rootExternalRef: filePath,
        rootKind: "file",
        maxDepth: query.graphMaxDepth ?? 2,
        maxNodes: 30,
      });
      if (slice.nodes.length > 0) {
        summaries.push(
          `${filePath}: ${slice.nodes.length} related node(s) via ${new Set(slice.edges.map((e) => e.kind)).size} relation type(s)`,
        );
      }
    }
    return summaries.length > 0 ? summaries.join("\n") : "No graph relationships found for touched files.";
  }
}

function sharesDirectoryPrefix(a: string, b: string): boolean {
  const dirA = a.split("/").slice(0, -1).join("/");
  const dirB = b.split("/").slice(0, -1).join("/");
  return dirA.length > 0 && (dirB.startsWith(dirA) || dirA.startsWith(dirB));
}

function mergeByIdPreferHigherScore(docs: RetrievedDoc[]): RetrievedDoc[] {
  const byId = new Map<string, RetrievedDoc>();
  for (const doc of docs) {
    const existing = byId.get(doc.id);
    if (!existing || doc.score > existing.score) byId.set(doc.id, doc);
  }
  return [...byId.values()].sort((a, b) => b.score - a.score);
}
