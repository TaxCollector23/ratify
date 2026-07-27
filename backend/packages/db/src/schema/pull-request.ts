import { index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./common.js";
import { organizations } from "./org.js";
import { repositories } from "./github.js";

export const pullRequestStateEnum = pgEnum("pull_request_state", ["open", "closed", "merged"]);

export const pullRequests = pgTable(
  "pull_requests",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    githubPrNumber: integer("github_pr_number").notNull(),
    title: text("title").notNull(),
    authorLogin: text("author_login").notNull(),
    state: pullRequestStateEnum("state").notNull().default("open"),
    baseRef: text("base_ref").notNull(),
    headRef: text("head_ref").notNull(),
    baseSha: text("base_sha").notNull(),
    headSha: text("head_sha").notNull(),
    mergeBaseSha: text("merge_base_sha"),
    mergedAt: text("merged_at"),
    closedAt: text("closed_at"),
    additions: integer("additions").notNull().default(0),
    deletions: integer("deletions").notNull().default(0),
    changedFiles: integer("changed_files").notNull().default(0),
    labels: jsonb("labels").$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [
    index("pull_requests_org_idx").on(t.orgId),
    index("pull_requests_repo_idx").on(t.repositoryId),
    uniqueIndex("pull_requests_repo_number_idx").on(t.repositoryId, t.githubPrNumber),
    index("pull_requests_state_idx").on(t.state),
  ],
);

export const fileChangeStatusEnum = pgEnum("file_change_status", [
  "added",
  "modified",
  "removed",
  "renamed",
  "copied",
]);

export const pullRequestFileChanges = pgTable(
  "pull_request_file_changes",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    pullRequestId: uuid("pull_request_id")
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    previousFilePath: text("previous_file_path"),
    status: fileChangeStatusEnum("status").notNull(),
    additions: integer("additions").notNull().default(0),
    deletions: integer("deletions").notNull().default(0),
    patchObjectStorageKey: text("patch_object_storage_key"), // large diffs live in S3, not Postgres
    patchContentHash: text("patch_content_hash"),
    isBinary: text("is_binary").notNull().default("false"),
    languageDetected: text("language_detected"),
    ...timestamps,
  },
  (t) => [
    index("pull_request_file_changes_org_idx").on(t.orgId),
    index("pull_request_file_changes_pr_idx").on(t.pullRequestId),
    index("pull_request_file_changes_path_idx").on(t.filePath),
  ],
);
