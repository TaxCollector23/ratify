import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { schema } from "@ratify/db";
import { and, eq } from "drizzle-orm";
import { RatifyError } from "@ratify/shared";
import { DoctrineStore } from "@ratify/doctrine";
import { requireOrgMatch } from "../plugins/auth.js";
import type { AppDeps } from "../types.js";

const DoctrineRuleSchema = z.object({
  id: z.string(),
  key: z.string(),
  title: z.string(),
  statement: z.string(),
  kind: z.string(),
  status: z.string(),
  confidence: z.number(),
  scopeGlobs: z.array(z.string()),
  rationale: z.string().nullable(),
});

const PrecedentSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  outcome: z.string().nullable(),
  tags: z.array(z.string()),
});

export function registerDoctrineRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get(
    "/orgs/:orgId/repositories/:repositoryId/doctrine",
    {
      schema: {
        tags: ["doctrine"],
        params: z.object({ orgId: z.string().uuid(), repositoryId: z.string().uuid() }),
        querystring: z.object({ status: z.string().optional() }),
        response: { 200: z.array(DoctrineRuleSchema) },
      },
    },
    async (request) => {
      const { orgId, repositoryId } = request.params as { orgId: string; repositoryId: string };
      requireOrgMatch(request, orgId);

      const store = new DoctrineStore(deps.db, orgId);
      const rules = await store.listActiveRules(repositoryId);
      return rules.map(toDoctrineDto);
    },
  );

  app.post(
    "/orgs/:orgId/doctrine/:doctrineRuleId/confirm",
    {
      schema: {
        tags: ["doctrine"],
        params: z.object({ orgId: z.string().uuid(), doctrineRuleId: z.string().uuid() }),
        body: z.object({ decision: z.enum(["confirmed", "rejected"]) }),
        response: { 200: DoctrineRuleSchema },
      },
    },
    async (request) => {
      const { orgId, doctrineRuleId } = request.params as { orgId: string; doctrineRuleId: string };
      const { decision } = request.body as { decision: "confirmed" | "rejected" };
      requireOrgMatch(request, orgId);

      const store = new DoctrineStore(deps.db, orgId);
      await store.setHumanDecision(doctrineRuleId, decision, request.authContext!.userId);

      const updated = await deps.db.query.doctrineRules.findFirst({
        where: and(eq(schema.doctrineRules.id, doctrineRuleId), eq(schema.doctrineRules.orgId, orgId)),
      });
      if (!updated) throw new RatifyError({ code: "NOT_FOUND", message: "Doctrine rule not found" });
      return toDoctrineDto(updated);
    },
  );

  app.get(
    "/orgs/:orgId/repositories/:repositoryId/precedents",
    {
      schema: {
        tags: ["doctrine"],
        params: z.object({ orgId: z.string().uuid(), repositoryId: z.string().uuid() }),
        response: { 200: z.array(PrecedentSchema) },
      },
    },
    async (request) => {
      const { orgId, repositoryId } = request.params as { orgId: string; repositoryId: string };
      requireOrgMatch(request, orgId);

      const rows = await deps.db.query.historicalPrecedents.findMany({
        where: and(
          eq(schema.historicalPrecedents.orgId, orgId),
          eq(schema.historicalPrecedents.repositoryId, repositoryId),
        ),
        limit: 100,
      });

      return rows.map((r) => ({ id: r.id, title: r.title, summary: r.summary, outcome: r.outcome, tags: r.tags }));
    },
  );
}

function toDoctrineDto(rule: typeof schema.doctrineRules.$inferSelect) {
  return {
    id: rule.id,
    key: rule.key,
    title: rule.title,
    statement: rule.statement,
    kind: rule.kind,
    status: rule.status,
    confidence: rule.confidence,
    scopeGlobs: rule.scopeGlobs,
    rationale: rule.rationale,
  };
}
