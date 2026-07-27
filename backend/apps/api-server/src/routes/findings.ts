import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { schema } from "@ratify/db";
import { and, eq } from "drizzle-orm";
import { RatifyError } from "@ratify/shared";
import { requireOrgMatch } from "../plugins/auth.js";
import type { AppDeps } from "../types.js";

const FindingSchema = z.object({
  id: z.string(),
  reviewSessionId: z.string(),
  ruleKey: z.string(),
  source: z.string(),
  title: z.string(),
  description: z.string(),
  severity: z.string(),
  confidence: z.number(),
  status: z.string(),
  filePath: z.string().nullable(),
  lineStart: z.number().nullable(),
  lineEnd: z.number().nullable(),
  falsePositiveLikelihood: z.number().nullable(),
  remediation: z.string().nullable(),
});

const EvidenceItemSchema = z.object({
  id: z.string(),
  kind: z.string(),
  ref: z.string(),
  excerpt: z.string().nullable(),
  url: z.string().nullable(),
  weight: z.number(),
});

export function registerFindingRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get(
    "/orgs/:orgId/review-sessions/:reviewSessionId/findings",
    {
      schema: {
        tags: ["findings"],
        params: z.object({ orgId: z.string().uuid(), reviewSessionId: z.string().uuid() }),
        querystring: z.object({ severity: z.string().optional(), status: z.string().optional() }),
        response: { 200: z.array(FindingSchema) },
      },
    },
    async (request) => {
      const { orgId, reviewSessionId } = request.params as { orgId: string; reviewSessionId: string };
      requireOrgMatch(request, orgId);

      const rows = await deps.db.query.findings.findMany({
        where: and(eq(schema.findings.orgId, orgId), eq(schema.findings.reviewSessionId, reviewSessionId)),
      });

      return rows.map(toFindingDto);
    },
  );

  app.get(
    "/orgs/:orgId/findings/:findingId",
    {
      schema: {
        tags: ["findings"],
        params: z.object({ orgId: z.string().uuid(), findingId: z.string().uuid() }),
        response: { 200: FindingSchema },
      },
    },
    async (request) => {
      const { orgId, findingId } = request.params as { orgId: string; findingId: string };
      requireOrgMatch(request, orgId);
      const finding = await findFindingOrThrow(deps, orgId, findingId);
      return toFindingDto(finding);
    },
  );

  app.get(
    "/orgs/:orgId/findings/:findingId/evidence",
    {
      schema: {
        tags: ["findings"],
        params: z.object({ orgId: z.string().uuid(), findingId: z.string().uuid() }),
        response: { 200: z.array(EvidenceItemSchema) },
      },
    },
    async (request) => {
      const { orgId, findingId } = request.params as { orgId: string; findingId: string };
      requireOrgMatch(request, orgId);
      await findFindingOrThrow(deps, orgId, findingId);

      const items = await deps.db.query.evidenceItems.findMany({
        where: and(eq(schema.evidenceItems.orgId, orgId), eq(schema.evidenceItems.findingId, findingId)),
      });

      return items.map((i) => ({
        id: i.id,
        kind: i.kind,
        ref: i.ref,
        excerpt: i.excerpt,
        url: i.url,
        weight: i.weight,
      }));
    },
  );
}

async function findFindingOrThrow(deps: AppDeps, orgId: string, findingId: string) {
  const finding = await deps.db.query.findings.findFirst({
    where: and(eq(schema.findings.id, findingId), eq(schema.findings.orgId, orgId)),
  });
  if (!finding) throw new RatifyError({ code: "NOT_FOUND", message: "Finding not found" });
  return finding;
}

function toFindingDto(finding: typeof schema.findings.$inferSelect) {
  return {
    id: finding.id,
    reviewSessionId: finding.reviewSessionId,
    ruleKey: finding.ruleKey,
    source: finding.source,
    title: finding.title,
    description: finding.description,
    severity: finding.severity,
    confidence: finding.confidence,
    status: finding.status,
    filePath: finding.filePath,
    lineStart: finding.lineStart,
    lineEnd: finding.lineEnd,
    falsePositiveLikelihood: finding.falsePositiveLikelihood,
    remediation: finding.remediation,
  };
}
