import { describe, expect, it } from "vitest";
import { cosineSimilarity, rankBySimilarity } from "./vector-similarity.js";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("throws on mismatched lengths", () => {
    expect(() => cosineSimilarity([1, 2], [1])).toThrow();
  });
});

describe("rankBySimilarity", () => {
  it("ranks candidates by descending similarity and respects topK", () => {
    const query = [1, 0];
    const candidates = [
      { item: "orthogonal", vector: [0, 1] },
      { item: "identical", vector: [1, 0] },
      { item: "close", vector: [0.9, 0.1] },
    ];
    const ranked = rankBySimilarity(query, candidates, 2);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.item).toBe("identical");
    expect(ranked[1]?.item).toBe("close");
  });
});
