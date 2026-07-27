import type { Database } from "@ratify/db";
import { schema } from "@ratify/db";
import { and, eq, inArray, or } from "drizzle-orm";
import type { GraphEdgeInput, GraphNodeInput, GraphSlice, GraphSliceOptions } from "./types.js";

/**
 * GraphRepository: CRUD + traversal helpers over the GraphNode/GraphEdge
 * relational tables. Upserts are keyed on (repositoryId, kind, externalRef)
 * so re-indexing a repo is idempotent and incremental.
 */
export class GraphRepository {
  constructor(
    private readonly db: Database,
    private readonly orgId: string,
  ) {}

  async upsertNode(input: GraphNodeInput): Promise<string> {
    const existing = await this.db.query.graphNodes.findFirst({
      where: and(
        eq(schema.graphNodes.repositoryId, input.repositoryId),
        eq(schema.graphNodes.kind, input.kind),
        eq(schema.graphNodes.externalRef, input.externalRef),
      ),
    });

    if (existing) {
      await this.db
        .update(schema.graphNodes)
        .set({ label: input.label, metadata: input.metadata ?? {}, updatedAt: new Date() })
        .where(eq(schema.graphNodes.id, existing.id));
      return existing.id;
    }

    const [row] = await this.db
      .insert(schema.graphNodes)
      .values({
        orgId: this.orgId,
        repositoryId: input.repositoryId,
        kind: input.kind,
        externalRef: input.externalRef,
        label: input.label,
        metadata: input.metadata ?? {},
      })
      .returning({ id: schema.graphNodes.id });

    if (!row) throw new Error("Failed to insert graph node");
    return row.id;
  }

  async upsertEdge(input: GraphEdgeInput): Promise<string> {
    const sourceId = await this.findNodeId(input.repositoryId, input.sourceExternalRef.kind, input.sourceExternalRef.externalRef);
    const targetId = await this.findNodeId(input.repositoryId, input.targetExternalRef.kind, input.targetExternalRef.externalRef);
    if (!sourceId || !targetId) {
      throw new Error(
        `Cannot create edge ${input.kind}: missing endpoint node(s) (source=${sourceId}, target=${targetId})`,
      );
    }

    const existing = await this.db.query.graphEdges.findFirst({
      where: and(
        eq(schema.graphEdges.sourceNodeId, sourceId),
        eq(schema.graphEdges.targetNodeId, targetId),
        eq(schema.graphEdges.kind, input.kind),
      ),
    });

    if (existing) {
      await this.db
        .update(schema.graphEdges)
        .set({ weight: input.weight ?? existing.weight, metadata: input.metadata ?? existing.metadata, updatedAt: new Date() })
        .where(eq(schema.graphEdges.id, existing.id));
      return existing.id;
    }

    const [row] = await this.db
      .insert(schema.graphEdges)
      .values({
        orgId: this.orgId,
        repositoryId: input.repositoryId,
        kind: input.kind,
        sourceNodeId: sourceId,
        targetNodeId: targetId,
        weight: input.weight ?? 1.0,
        metadata: input.metadata ?? {},
      })
      .returning({ id: schema.graphEdges.id });

    if (!row) throw new Error("Failed to insert graph edge");
    return row.id;
  }

  private async findNodeId(repositoryId: string, kind: string, externalRef: string): Promise<string | undefined> {
    const node = await this.db.query.graphNodes.findFirst({
      where: and(
        eq(schema.graphNodes.repositoryId, repositoryId),
        eq(schema.graphNodes.kind, kind as never),
        eq(schema.graphNodes.externalRef, externalRef),
      ),
    });
    return node?.id;
  }

  /**
   * Breadth-first slice extraction: pulls a bounded subgraph around a root
   * node. Used by context-retriever to build the "graph slice" fed to the
   * LLM reasoner without loading the entire repository graph.
   */
  async extractSlice(repositoryId: string, options: GraphSliceOptions): Promise<GraphSlice> {
    const maxDepth = options.maxDepth ?? 2;
    const maxNodes = options.maxNodes ?? 200;
    const direction = options.direction ?? "both";

    const rootNode = await this.db.query.graphNodes.findFirst({
      where: and(
        eq(schema.graphNodes.repositoryId, repositoryId),
        eq(schema.graphNodes.kind, options.rootKind),
        eq(schema.graphNodes.externalRef, options.rootExternalRef),
      ),
    });

    if (!rootNode) {
      return { nodes: [], edges: [] };
    }

    const visitedNodeIds = new Map<string, number>([[rootNode.id, 0]]);
    const collectedEdges = new Map<string, (typeof schema.graphEdges.$inferSelect)>();
    let frontier = [rootNode.id];

    for (let depth = 1; depth <= maxDepth && frontier.length > 0 && visitedNodeIds.size < maxNodes; depth++) {
      const edgeKindFilter = options.edgeKinds ? inArray(schema.graphEdges.kind, options.edgeKinds) : undefined;
      const directionFilter =
        direction === "outgoing"
          ? inArray(schema.graphEdges.sourceNodeId, frontier)
          : direction === "incoming"
            ? inArray(schema.graphEdges.targetNodeId, frontier)
            : or(inArray(schema.graphEdges.sourceNodeId, frontier), inArray(schema.graphEdges.targetNodeId, frontier));

      const whereClause = edgeKindFilter ? and(directionFilter, edgeKindFilter) : directionFilter;

      const edges = await this.db
        .select()
        .from(schema.graphEdges)
        .where(and(eq(schema.graphEdges.repositoryId, repositoryId), whereClause));

      const nextFrontier: string[] = [];
      for (const edge of edges) {
        collectedEdges.set(edge.id, edge);
        for (const candidate of [edge.sourceNodeId, edge.targetNodeId]) {
          if (!visitedNodeIds.has(candidate) && visitedNodeIds.size < maxNodes) {
            visitedNodeIds.set(candidate, depth);
            nextFrontier.push(candidate);
          }
        }
      }
      frontier = nextFrontier;
    }

    const nodeRows = await this.db
      .select()
      .from(schema.graphNodes)
      .where(inArray(schema.graphNodes.id, [...visitedNodeIds.keys()]));

    return {
      nodes: nodeRows.map((n) => ({
        id: n.id,
        kind: n.kind,
        externalRef: n.externalRef,
        label: n.label,
        depth: visitedNodeIds.get(n.id) ?? 0,
        metadata: n.metadata,
      })),
      edges: [...collectedEdges.values()].map((e) => ({
        id: e.id,
        kind: e.kind,
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        weight: e.weight,
      })),
    };
  }

  /** Direct neighbor lookup (1-hop), the common case for "who calls this / who owns this". */
  async neighbors(repositoryId: string, nodeExternalRef: string, nodeKind: string, edgeKind?: string) {
    return this.extractSlice(repositoryId, {
      rootExternalRef: nodeExternalRef,
      rootKind: nodeKind as never,
      maxDepth: 1,
      edgeKinds: edgeKind ? [edgeKind as never] : undefined,
    });
  }
}
