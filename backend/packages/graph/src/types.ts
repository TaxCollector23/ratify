import type { schema } from "@ratify/db";

export type GraphNodeKind = (typeof schema.graphNodeKindEnum.enumValues)[number];
export type GraphEdgeKind = (typeof schema.graphEdgeKindEnum.enumValues)[number];

export interface GraphNodeInput {
  repositoryId: string;
  kind: GraphNodeKind;
  externalRef: string;
  label: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdgeInput {
  repositoryId: string;
  kind: GraphEdgeKind;
  sourceExternalRef: { kind: GraphNodeKind; externalRef: string };
  targetExternalRef: { kind: GraphNodeKind; externalRef: string };
  weight?: number;
  metadata?: Record<string, unknown>;
}

export interface GraphSliceOptions {
  /** Node to start the traversal from. */
  rootExternalRef: string;
  rootKind: GraphNodeKind;
  /** Max hops to traverse (breadth-first). */
  maxDepth?: number;
  /** Restrict traversal to these edge kinds; omit for all kinds. */
  edgeKinds?: GraphEdgeKind[];
  /** Traversal direction. */
  direction?: "outgoing" | "incoming" | "both";
  maxNodes?: number;
}

export interface GraphSliceNode {
  id: string;
  kind: GraphNodeKind;
  externalRef: string;
  label: string;
  depth: number;
  metadata: Record<string, unknown>;
}

export interface GraphSliceEdge {
  id: string;
  kind: GraphEdgeKind;
  sourceNodeId: string;
  targetNodeId: string;
  weight: number;
}

export interface GraphSlice {
  nodes: GraphSliceNode[];
  edges: GraphSliceEdge[];
}
