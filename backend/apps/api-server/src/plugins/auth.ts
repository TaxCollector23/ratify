import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Database } from "@ratify/db";
import { schema } from "@ratify/db";
import { eq } from "drizzle-orm";
import { RatifyError } from "@ratify/shared";

declare module "fastify" {
  interface FastifyRequest {
    authContext?: AuthContext;
  }
}

export interface AuthContext {
  orgId: string;
  userId: string;
  role: string;
}

/**
 * Minimal bearer-token auth: resolves `Authorization: Bearer <userId>` to
 * a User row and attaches its orgId for downstream org-scoping. In
 * production this would validate a signed session/JWT/API-key against a
 * sessions table or auth provider; the shape (attach authContext, enforce
 * org boundary on every route) is what matters here and is real.
 */
export function registerAuthDecorator(app: FastifyInstance, db: Database): void {
  app.decorateRequest("authContext", undefined);

  app.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.routeOptions.url === "/healthz" || request.routeOptions.url?.startsWith("/documentation")) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new RatifyError({ code: "UNAUTHORIZED", message: "Missing bearer token" });
    }

    const token = authHeader.slice("Bearer ".length).trim();
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, token) });

    if (!user || !user.isActive) {
      throw new RatifyError({ code: "UNAUTHORIZED", message: "Invalid or inactive credentials" });
    }

    request.authContext = { orgId: user.orgId, userId: user.id, role: user.role };
  });
}

/** Helper for route handlers to assert the requested org matches the authenticated context. */
export function requireOrgMatch(request: FastifyRequest, orgId: string): void {
  if (!request.authContext) {
    throw new RatifyError({ code: "UNAUTHORIZED", message: "Missing auth context" });
  }
  if (request.authContext.orgId !== orgId) {
    throw new RatifyError({ code: "ORG_BOUNDARY_VIOLATION", message: "Cross-org access denied" });
  }
}
