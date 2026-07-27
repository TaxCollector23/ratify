/**
 * Cosine-similarity helpers for the EmbeddingRecord vector column.
 * In production, similarity search should be pushed into Postgres via
 * pgvector's `<=>` operator for performance; `cosineSimilarityQuerySql`
 * builds that raw SQL fragment. The pure `cosineSimilarity` function is
 * kept for in-memory re-ranking of a candidate set and for unit testing
 * without a live database.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface ScoredEmbedding<T> {
  item: T;
  similarity: number;
}

/** In-memory top-K re-ranking by cosine similarity against a query vector. */
export function rankBySimilarity<T>(
  queryVector: number[],
  candidates: { vector: number[]; item: T }[],
  topK = 10,
): ScoredEmbedding<T>[] {
  return candidates
    .map((c) => ({ item: c.item, similarity: cosineSimilarity(queryVector, c.vector) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

/**
 * pgvector raw SQL fragment for a nearest-neighbor query using cosine
 * distance (`<=>`), for use inside a Drizzle `sql` template in the caller.
 * pgvector's `<=>` returns *distance* (0 = identical), so callers ordering
 * ascending by this expression get nearest-first results.
 */
export function cosineDistanceSql(columnName: string, vectorLiteral: string): string {
  return `${columnName} <=> '${vectorLiteral}'::vector`;
}

/** Formats a JS number array as a pgvector literal string, e.g. "[0.1,0.2,...]". */
export function toPgVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
