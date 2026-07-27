import { index, jsonb, pgEnum, pgTable, real, text, uniqueIndex, uuid, vector } from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./common.js";
import { organizations } from "./org.js";
import { repositories } from "./github.js";

export const graphNodeKindEnum = pgEnum("graph_node_kind", [
  "file",
  "symbol",
  "module",
  "package",
  "test",
  "doc",
  "adr",
  "pull_request",
  "review_comment",
  "owner",
  "doctrine_rule",
  "review_session",
]);

/** GraphNode: nodes of the repository knowledge graph. */
export const graphNodes = pgTable(
  "graph_nodes",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    kind: graphNodeKindEnum("kind").notNull(),
    externalRef: text("external_ref").notNull(), // stable natural key, e.g. file path, symbol qualified name
    label: text("label").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index("graph_nodes_org_idx").on(t.orgId),
    index("graph_nodes_repo_idx").on(t.repositoryId),
    index("graph_nodes_kind_idx").on(t.kind),
    uniqueIndex("graph_nodes_repo_kind_ref_idx").on(t.repositoryId, t.kind, t.externalRef),
  ],
);

export const graphEdgeKindEnum = pgEnum("graph_edge_kind", [
  "calls",
  "imports",
  "depends_on",
  "owned_by",
  "documented_by",
  "reviewed_by",
  "modified_by",
  "supports",
  "contradicts",
  "similar_to",
]);

/** GraphEdge: directed, typed, weighted relationships between GraphNodes. */
export const graphEdges = pgTable(
  "graph_edges",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    kind: graphEdgeKindEnum("kind").notNull(),
    sourceNodeId: uuid("source_node_id")
      .notNull()
      .references(() => graphNodes.id, { onDelete: "cascade" }),
    targetNodeId: uuid("target_node_id")
      .notNull()
      .references(() => graphNodes.id, { onDelete: "cascade" }),
    weight: real("weight").notNull().default(1.0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index("graph_edges_org_idx").on(t.orgId),
    index("graph_edges_repo_idx").on(t.repositoryId),
    index("graph_edges_source_idx").on(t.sourceNodeId),
    index("graph_edges_target_idx").on(t.targetNodeId),
    index("graph_edges_kind_idx").on(t.kind),
    uniqueIndex("graph_edges_unique_edge_idx").on(t.sourceNodeId, t.targetNodeId, t.kind),
  ],
);

/**
 * EmbeddingRecord backs semantic retrieval. Implemented with pgvector's
 * `vector` column type via drizzle-orm/pg-core `vector()`. Dimension is
 * fixed to 1536 (matches common embedding model output); adjust per
 * provider via packages/retrieval config if needed.
 */
export const EMBEDDING_DIMENSIONS = 1536;

export const embeddingSourceKindEnum = pgEnum("embedding_source_kind", [
  "symbol",
  "file",
  "doc",
  "adr",
  "pull_request",
  "review_comment",
  "doctrine_rule",
]);

export const embeddingRecords = pgTable(
  "embedding_records",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    sourceKind: embeddingSourceKindEnum("source_kind").notNull(),
    sourceRef: text("source_ref").notNull(), // e.g. graph node external ref or doc id
    content: text("content").notNull(), // the text that was embedded (for debugging/re-embedding)
    contentHash: text("content_hash").notNull(),
    model: text("model").notNull(), // embedding model identifier
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    ...timestamps,
  },
  (t) => [
    index("embedding_records_org_idx").on(t.orgId),
    index("embedding_records_repo_idx").on(t.repositoryId),
    index("embedding_records_source_idx").on(t.sourceKind, t.sourceRef),
    uniqueIndex("embedding_records_repo_ref_model_idx").on(t.repositoryId, t.sourceRef, t.model),
  ],
);
