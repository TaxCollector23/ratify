/**
 * Org-scoping utilities.
 *
 * Multi-tenancy is enforced by convention across every query, cache key,
 * storage key, and embedding namespace in Ratify. These helpers make the
 * convention explicit and hard to bypass by accident.
 */

import { RatifyError } from "./errors.js";

export type OrgId = string & { readonly __brand: "OrgId" };

export function asOrgId(value: string): OrgId {
  if (!value || typeof value !== "string" || value.length < 1) {
    throw new RatifyError({
      code: "VALIDATION_ERROR",
      message: "orgId must be a non-empty string",
    });
  }
  return value as OrgId;
}

/** An entity that is scoped to a single organization. */
export interface OrgScoped {
  orgId: string;
}

/**
 * Asserts that a loaded entity belongs to the expected org before it is
 * returned to a caller. Throws ORG_BOUNDARY_VIOLATION otherwise. This is
 * the last line of defense in addition to WHERE org_id = $1 in every query.
 */
export function assertOrgOwnership<T extends OrgScoped>(
  entity: T | null | undefined,
  expectedOrgId: string,
): T {
  if (!entity) {
    throw new RatifyError({ code: "NOT_FOUND", message: "Resource not found" });
  }
  if (entity.orgId !== expectedOrgId) {
    throw new RatifyError({
      code: "ORG_BOUNDARY_VIOLATION",
      message: "Resource does not belong to the requesting organization",
    });
  }
  return entity;
}

/** Builds a namespaced cache key that always carries the org boundary. */
export function orgCacheKey(orgId: string, ...parts: (string | number)[]): string {
  return ["org", orgId, ...parts].join(":");
}

/** Builds a namespaced object-storage key that always carries the org boundary. */
export function orgStorageKey(orgId: string, ...parts: (string | number)[]): string {
  return ["orgs", orgId, ...parts].join("/");
}

/** Builds a namespaced vector/embedding partition key for org isolation. */
export function orgEmbeddingNamespace(orgId: string): string {
  return `emb_org_${orgId}`;
}
