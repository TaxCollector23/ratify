import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { schema } from "@ratify/db";
import { and, eq } from "drizzle-orm";
import { RatifyError } from "@ratify/shared";
import { requireOrgMatch } from "../plugins/auth.js";
import type { AppDeps } from "../types.js";

const InstallationStatusResponseSchema = z.object({
  id: z.string(),
  installationId: z.number(),
  accountLogin: z.string(),
  status: z.string(),
  permissions: z.record(z.string(), z.string()),
  repositoryCount: z.number(),
});

/** GET /orgs/:orgId/installations — installation status. */
export function registerInstallationRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get(
    "/orgs/:orgId/installations",
    {
      schema: {
        tags: ["installations"],
        params: z.object({ orgId: z.string().uuid() }),
        response: { 200: z.array(InstallationStatusResponseSchema) },
      },
    },
    async (request) => {
      const { orgId } = request.params as { orgId: string };
      requireOrgMatch(request, orgId);

      const installations = await deps.db.query.githubInstallations.findMany({
        where: eq(schema.githubInstallations.orgId, orgId),
      });

      const results = await Promise.all(
        installations.map(async (inst) => {
          const repos = await deps.db.query.repositories.findMany({
            where: eq(schema.repositories.installationId, inst.id),
          });
          return {
            id: inst.id,
            installationId: inst.installationId,
            accountLogin: inst.accountLogin,
            status: inst.status,
            permissions: inst.permissions,
            repositoryCount: repos.length,
          };
        }),
      );

      return results;
    },
  );

  app.get(
    "/orgs/:orgId/installations/:installationId",
    {
      schema: {
        tags: ["installations"],
        params: z.object({ orgId: z.string().uuid(), installationId: z.string().uuid() }),
        response: { 200: InstallationStatusResponseSchema },
      },
    },
    async (request) => {
      const { orgId, installationId } = request.params as { orgId: string; installationId: string };
      requireOrgMatch(request, orgId);

      const inst = await deps.db.query.githubInstallations.findFirst({
        where: and(eq(schema.githubInstallations.id, installationId), eq(schema.githubInstallations.orgId, orgId)),
      });

      if (!inst) {
        throw new RatifyError({ code: "NOT_FOUND", message: "Installation not found" });
      }

      const repos = await deps.db.query.repositories.findMany({
        where: eq(schema.repositories.installationId, inst.id),
      });

      return {
        id: inst.id,
        installationId: inst.installationId,
        accountLogin: inst.accountLogin,
        status: inst.status,
        permissions: inst.permissions,
        repositoryCount: repos.length,
      };
    },
  );
}
