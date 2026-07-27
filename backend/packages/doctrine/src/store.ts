import type { Database } from "@ratify/db";
import { schema } from "@ratify/db";
import { and, eq } from "drizzle-orm";
import type { ScoredDoctrineCandidate } from "./types.js";
import { applyFeedbackAdjustment } from "./scoring.js";

/**
 * Persistence helpers for DoctrineRule + DoctrineSource, encapsulating
 * the candidate -> confirmed lifecycle and human override support.
 */
export class DoctrineStore {
  constructor(
    private readonly db: Database,
    private readonly orgId: string,
  ) {}

  /** Upserts a scored candidate as a `candidate`-status DoctrineRule, keyed by (repositoryId, key). */
  async upsertCandidate(repositoryId: string, candidate: ScoredDoctrineCandidate): Promise<string> {
    const existing = await this.db.query.doctrineRules.findFirst({
      where: and(eq(schema.doctrineRules.repositoryId, repositoryId), eq(schema.doctrineRules.key, candidate.key)),
    });

    if (existing) {
      // Never overwrite a human-confirmed or rejected rule with a fresh inference pass.
      if (existing.status === "confirmed" || existing.status === "rejected") {
        return existing.id;
      }
      await this.db
        .update(schema.doctrineRules)
        .set({
          title: candidate.title,
          statement: candidate.statement,
          kind: candidate.kind,
          confidence: candidate.confidence,
          scopeGlobs: candidate.scopeGlobs,
          rationale: candidate.rationale,
          updatedAt: new Date(),
        })
        .where(eq(schema.doctrineRules.id, existing.id));

      await this.replaceSources(existing.id, candidate);
      return existing.id;
    }

    const [row] = await this.db
      .insert(schema.doctrineRules)
      .values({
        orgId: this.orgId,
        repositoryId,
        key: candidate.key,
        title: candidate.title,
        statement: candidate.statement,
        kind: candidate.kind,
        status: "candidate",
        confidence: candidate.confidence,
        scopeGlobs: candidate.scopeGlobs,
        rationale: candidate.rationale,
      })
      .returning({ id: schema.doctrineRules.id });

    if (!row) throw new Error("Failed to insert doctrine rule");
    await this.replaceSources(row.id, candidate);
    return row.id;
  }

  private async replaceSources(doctrineRuleId: string, candidate: ScoredDoctrineCandidate): Promise<void> {
    await this.db.delete(schema.doctrineSources).where(eq(schema.doctrineSources.doctrineRuleId, doctrineRuleId));
    if (candidate.signals.length === 0) return;
    await this.db.insert(schema.doctrineSources).values(
      candidate.signals.map((s) => ({
        orgId: this.orgId,
        doctrineRuleId,
        kind: s.kind,
        ref: s.ref,
        excerpt: s.excerpt,
        weight: s.strength,
      })),
    );
  }

  /** Human confirmation / rejection — locks the rule from being overwritten by future inference passes. */
  async setHumanDecision(doctrineRuleId: string, decision: "confirmed" | "rejected", userId: string): Promise<void> {
    await this.db
      .update(schema.doctrineRules)
      .set({
        status: decision,
        confirmedByUserId: decision === "confirmed" ? userId : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.doctrineRules.id, doctrineRuleId));
  }

  /** Adjusts confidence in response to a FeedbackEvent (see packages/doctrine/scoring.ts). */
  async adjustConfidenceFromFeedback(doctrineRuleId: string, feedbackKind: string): Promise<number> {
    const rule = await this.db.query.doctrineRules.findFirst({ where: eq(schema.doctrineRules.id, doctrineRuleId) });
    if (!rule) throw new Error(`Doctrine rule ${doctrineRuleId} not found`);
    const nextConfidence = applyFeedbackAdjustment(rule.confidence, feedbackKind);
    await this.db
      .update(schema.doctrineRules)
      .set({ confidence: nextConfidence, updatedAt: new Date() })
      .where(eq(schema.doctrineRules.id, doctrineRuleId));
    return nextConfidence;
  }

  async listActiveRules(repositoryId: string) {
    return this.db.query.doctrineRules.findMany({
      where: and(eq(schema.doctrineRules.repositoryId, repositoryId)),
    });
  }
}
