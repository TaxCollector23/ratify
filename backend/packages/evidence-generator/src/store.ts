import type { Database } from "@ratify/db";
import { schema } from "@ratify/db";
import { eq } from "drizzle-orm";
import type { GeneratedFinding } from "./types.js";
import { scoreReviewSession, type ReviewSessionScore } from "./scoring.js";

/**
 * Persistence for generated Finding + EvidenceItem rows and the resulting
 * ScoreSnapshot for a review session. One store call per review session
 * keeps this transactional-ish (best-effort — Drizzle's postgres-js driver
 * doesn't require an explicit transaction wrapper for this use case since
 * each insert is independently idempotent-safe within a single job attempt).
 */
export class EvidenceStore {
  constructor(
    private readonly db: Database,
    private readonly orgId: string,
  ) {}

  async persistFindings(reviewSessionId: string, findings: GeneratedFinding[]): Promise<string[]> {
    if (findings.length === 0) return [];

    const findingIds: string[] = [];
    for (const finding of findings) {
      const [row] = await this.db
        .insert(schema.findings)
        .values({
          orgId: this.orgId,
          reviewSessionId,
          ruleKey: finding.ruleKey,
          source: finding.source,
          title: finding.title,
          description: finding.description,
          severity: finding.severity,
          confidence: finding.confidence,
          filePath: finding.filePath,
          lineStart: finding.lineStart,
          lineEnd: finding.lineEnd,
          falsePositiveLikelihood: finding.falsePositiveLikelihood,
          remediation: finding.remediation,
          metadata: { rationale: finding.rationale, linkedPrecedentIds: finding.linkedPrecedentIds },
        })
        .returning({ id: schema.findings.id });

      if (!row) throw new Error("Failed to insert finding");
      findingIds.push(row.id);

      if (finding.evidenceItems.length > 0) {
        await this.db.insert(schema.evidenceItems).values(
          finding.evidenceItems.map((ev) => ({
            orgId: this.orgId,
            findingId: row.id,
            kind: ev.kind,
            ref: ev.ref,
            excerpt: ev.excerpt,
            url: ev.url,
            weight: ev.weight,
          })),
        );
      }
    }

    return findingIds;
  }

  async persistScoreSnapshot(reviewSessionId: string, findings: GeneratedFinding[]): Promise<ReviewSessionScore> {
    const score = scoreReviewSession(findings);

    await this.db.insert(schema.scoreSnapshots).values({
      orgId: this.orgId,
      reviewSessionId,
      overallScore: score.overallScore,
      severityCounts: score.severityCounts,
      touchedSensitiveAreas: String(score.touchedSensitiveAreas),
      hasBreakingApiChange: String(score.hasBreakingApiChange),
      missingTestCoverage: String(score.missingTestCoverage),
    });

    return score;
  }

  async getExistingFindingIds(reviewSessionId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.findings.id })
      .from(schema.findings)
      .where(eq(schema.findings.reviewSessionId, reviewSessionId));
    return rows.map((r) => r.id);
  }
}
