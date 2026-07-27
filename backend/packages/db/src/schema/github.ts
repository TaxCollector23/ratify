import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./common.js";
import { organizations } from "./org.js";

export const installationStatusEnum = pgEnum("installation_status", [
  "pending",
  "active",
  "suspended",
  "uninstalled",
]);

/** One GitHub App installation per org (usually), tracks lifecycle + token scope. */
export const githubInstallations = pgTable(
  "github_installations",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    installationId: bigint("installation_id", { mode: "number" }).notNull(),
    accountLogin: text("account_login").notNull(),
    accountType: text("account_type").notNull(), // "Organization" | "User"
    status: installationStatusEnum("status").notNull().default("pending"),
    permissions: jsonb("permissions").$type<Record<string, string>>().notNull().default({}),
    events: jsonb("events").$type<string[]>().notNull().default([]),
    encryptedTokenRef: text("encrypted_token_ref"), // pointer into a secrets manager, never a raw token
    suspendedAt: text("suspended_at"),
    ...timestamps,
  },
  (t) => [
    index("github_installations_org_idx").on(t.orgId),
    uniqueIndex("github_installations_installation_id_idx").on(t.installationId),
  ],
);

export const repositoryVisibilityEnum = pgEnum("repository_visibility", ["public", "private", "internal"]);

export const repositories = pgTable(
  "repositories",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    installationId: uuid("installation_id")
      .notNull()
      .references(() => githubInstallations.id, { onDelete: "cascade" }),
    githubRepoId: bigint("github_repo_id", { mode: "number" }).notNull(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    defaultBranch: text("default_branch").notNull().default("main"),
    visibility: repositoryVisibilityEnum("visibility").notNull().default("private"),
    cloneUrl: text("clone_url").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    indexingStatus: text("indexing_status").notNull().default("not_indexed"), // not_indexed|indexing|ready|failed
    lastIndexedAt: text("last_indexed_at"),
    profile: jsonb("profile").$type<RepositoryProfile | null>(),
    ...timestamps,
  },
  (t) => [
    index("repositories_org_idx").on(t.orgId),
    index("repositories_installation_idx").on(t.installationId),
    uniqueIndex("repositories_github_repo_id_idx").on(t.githubRepoId),
    uniqueIndex("repositories_owner_name_idx").on(t.owner, t.name),
  ],
);

/** Denormalized snapshot summary stored on the repo row for fast dashboard reads. */
export interface RepositoryProfile {
  primaryLanguages: string[];
  frameworks: string[];
  packageManagers: string[];
  testStrategy: string | null;
  ownershipPatterns: string[];
  architecturePatterns: string[];
  docCoveragePct: number;
  historicalRiskAreas: string[];
  doctrineCandidateCount: number;
  generatedAt: string;
}

export const repositorySnapshots = pgTable(
  "repository_snapshots",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    ref: text("ref").notNull(), // branch or PR head ref
    commitSha: text("commit_sha").notNull(),
    mergeBaseSha: text("merge_base_sha"),
    isShallow: boolean("is_shallow").notNull().default(true),
    objectStorageKey: text("object_storage_key").notNull(), // content-addressed tarball/bundle location
    contentHash: text("content_hash").notNull(),
    fileCount: integer("file_count"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    syncStatus: text("sync_status").notNull().default("pending"), // pending|syncing|ready|failed
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (t) => [
    index("repository_snapshots_org_idx").on(t.orgId),
    index("repository_snapshots_repo_idx").on(t.repositoryId),
    uniqueIndex("repository_snapshots_repo_commit_idx").on(t.repositoryId, t.commitSha),
    index("repository_snapshots_content_hash_idx").on(t.contentHash),
  ],
);

export const repositoryOwners = pgTable(
  "repository_owners",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    pathGlob: text("path_glob").notNull(),
    ownerHandle: text("owner_handle").notNull(), // @user or @org/team
    source: text("source").notNull().default("CODEOWNERS"),
    ...timestamps,
  },
  (t) => [
    index("repository_owners_org_idx").on(t.orgId),
    index("repository_owners_repo_idx").on(t.repositoryId),
    index("repository_owners_path_glob_idx").on(t.pathGlob),
  ],
);
