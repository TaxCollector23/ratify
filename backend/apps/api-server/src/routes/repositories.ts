import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { schema } from "@ratify/db";
import { and, eq } from "drizzle-orm";
import { RatifyError } from "@ratify/shared";
import { requireOrgMatch } from "../plugins/auth.js";
import type { AppDeps } from "../types.js";

const RepositorySchema = z.object({
  id: z.string(),
  owner: z.string(),
  name: z.string(),
  defaultBranch: z.string(),
  visibility: z.string(),
  indexingStatus: z.string(),
  lastIndexedAt: z.string().nullable(),
});

const RepositoryProfileSchema = z.object({
  primaryLanguages: z.array(z.string()),
  frameworks: z.array(z.string()),
  packageManagers: z.array(z.string()),
  testStrategy: z.string().nullable(),
  ownershipPatterns: z.array(z.string()),
  architecturePatterns: z.array(z.string()),
  docCoveragePct: z.number(),
  historicalRiskAreas: z.array(z.string()),
  doctrineCandidateCount: z.number(),
  generatedAt: z.string(),
});

export function registerRepositoryRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get(
    "/orgs/:orgId/repositories",
    {
      schema: {
        tags: ["repositories"],
        params: z.object({ orgId: z.string().uuid() }),
        response: { 200: z.array(RepositorySchema) },
      },
    },
    async (request) => {
      const { orgId } = request.params as { orgId: string };
      requireOrgMatch(request, orgId);

      const repos = await deps.db.query.repositories.findMany({ where: eq(schema.repositories.orgId, orgId) });
      return repos.map(toRepositoryDto);
    },
  );

  app.get(
    "/orgs/:orgId/repositories/:repositoryId",
    {
      schema: {
        tags: ["repositories"],
        params: z.object({ orgId: z.string().uuid(), repositoryId: z.string().uuid() }),
        response: { 200: RepositorySchema },
      },
    },
    async (request) => {
      const { orgId, repositoryId } = request.params as { orgId: string; repositoryId: string };
      requireOrgMatch(request, orgId);
      const repo = await findRepoOrThrow(deps, orgId, repositoryId);
      return toRepositoryDto(repo);
    },
  );

  app.get(
    "/orgs/:orgId/repositories/:repositoryId/profile",
    {
      schema: {
        tags: ["repositories"],
        params: z.object({ orgId: z.string().uuid(), repositoryId: z.string().uuid() }),
        response: { 200: RepositoryProfileSchema },
      },
    },
    async (request) => {
      const { orgId, repositoryId } = request.params as { orgId: string; repositoryId: string };
      requireOrgMatch(request, orgId);
      const repo = await findRepoOrThrow(deps, orgId, repositoryId);
      if (!repo.profile) {
        throw new RatifyError({ code: "NOT_FOUND", message: "Repository profile has not been generated yet" });
      }
      return repo.profile;
    },
  );

  app.post(
    "/orgs/:orgId/repositories/:repositoryId/reindex",
    {
      schema: {
        tags: ["repositories"],
        params: z.object({ orgId: z.string().uuid(), repositoryId: z.string().uuid() }),
        response: { 202: z.object({ status: z.literal("queued") }) },
      },
    },
    async (request, reply) => {
      const { orgId, repositoryId } = request.params as { orgId: string; repositoryId: string };
      requireOrgMatch(request, orgId);
      await findRepoOrThrow(deps, orgId, repositoryId);

      const { enqueueJob } = await import("@ratify/queue");
      await enqueueJob({
        db: deps.db,
        jobType: "repo.sync",
        orgId,
        scopeId: repositoryId,
        payload: { repositoryId, ref: "HEAD", reason: "manual" },
        idempotencyExtra: { triggeredAt: Date.now() },
      });

      reply.code(202);
      return { status: "queued" as const };
    },
  );
}

async function findRepoOrThrow(deps: AppDeps, orgId: string, repositoryId: string) {
  const repo = await deps.db.query.repositories.findFirst({
    where: and(eq(schema.repositories.id, repositoryId), eq(schema.repositories.orgId, orgId)),
  });
  if (!repo) throw new RatifyError({ code: "NOT_FOUND", message: "Repository not found" });
  return repo;
}

function toRepositoryDto(repo: typeof schema.repositories.$inferSelect) {
  return {
    id: repo.id,
    owner: repo.owner,
    name: repo.name,
    defaultBranch: repo.defaultBranch,
    visibility: repo.visibility,
    indexingStatus: repo.indexingStatus,
    lastIndexedAt: repo.lastIndexedAt,
  };
}
