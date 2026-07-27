import { boolean, index, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./common.js";

export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "member", "viewer"]);

/**
 * Organization is the top-level tenant boundary. Every other org-scoped
 * table carries an org_id FK back here and every query in the codebase
 * must filter on it (see packages/shared org-scope.ts helpers).
 */
export const organizations = pgTable(
  "organizations",
  {
    id: idColumn(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    githubOrgLogin: text("github_org_login"),
    planTier: text("plan_tier").notNull().default("trial"),
    dataRetentionDays: text("data_retention_days").notNull().default("90"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex("organizations_slug_idx").on(t.slug)],
);

export const users = pgTable(
  "users",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    githubLogin: text("github_login"),
    githubUserId: text("github_user_id"),
    displayName: text("display_name"),
    role: userRoleEnum("role").notNull().default("member"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("users_org_idx").on(t.orgId),
    uniqueIndex("users_org_email_idx").on(t.orgId, t.email),
  ],
);
