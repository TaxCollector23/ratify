import { index, jsonb, pgEnum, pgTable, real, text, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./common.js";
import { organizations } from "./org.js";
import { repositories } from "./github.js";

export const doctrineRuleKindEnum = pgEnum("doctrine_rule_kind", ["hard-rule", "soft-norm", "likely-preference"]);
export const doctrineRuleStatusEnum = pgEnum("doctrine_rule_status", [
  "candidate",
  "confirmed",
  "rejected",
  "superseded",
]);

/**
 * DoctrineRule is a structured (not prose) inferred or human-confirmed
 * repo convention. confidence is recalculated as FeedbackEvents arrive.
 */
export const doctrineRules = pgTable(
  "doctrine_rules",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    key: text("key").notNull(), // stable slug, e.g. "require-tests-for-api-routes"
    title: text("title").notNull(),
    statement: text("statement").notNull(), // structured natural-language statement of the rule
    kind: doctrineRuleKindEnum("kind").notNull(),
    status: doctrineRuleStatusEnum("status").notNull().default("candidate"),
    confidence: real("confidence").notNull().default(0.5),
    scopeGlobs: jsonb("scope_globs").$type<string[]>().notNull().default([]),
    rationale: text("rationale"),
    confirmedByUserId: uuid("confirmed_by_user_id"),
    supersedesRuleId: uuid("supersedes_rule_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index("doctrine_rules_org_idx").on(t.orgId),
    index("doctrine_rules_repo_idx").on(t.repositoryId),
    index("doctrine_rules_key_idx").on(t.key),
    index("doctrine_rules_status_idx").on(t.status),
  ],
);

export const doctrineSourceKindEnum = pgEnum("doctrine_source_kind", [
  "merged-pr",
  "review-comment",
  "commit-message",
  "doc",
  "adr",
  "readme",
  "codeowners",
  "ci-config",
  "feedback-event",
]);

/** Links a DoctrineRule back to the concrete evidence it was mined from. */
export const doctrineSources = pgTable(
  "doctrine_sources",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    doctrineRuleId: uuid("doctrine_rule_id")
      .notNull()
      .references(() => doctrineRules.id, { onDelete: "cascade" }),
    kind: doctrineSourceKindEnum("kind").notNull(),
    ref: text("ref").notNull(),
    excerpt: text("excerpt"),
    weight: real("weight").notNull().default(1.0),
    ...timestamps,
  },
  (t) => [
    index("doctrine_sources_org_idx").on(t.orgId),
    index("doctrine_sources_rule_idx").on(t.doctrineRuleId),
  ],
);

export const historicalPrecedents = pgTable(
  "historical_precedents",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    sourcePrNumber: text("source_pr_number"),
    sourceCommitSha: text("source_commit_sha"),
    relatedPathGlobs: jsonb("related_path_globs").$type<string[]>().notNull().default([]),
    outcome: text("outcome"), // e.g. "approved-with-changes", "rejected", "exception-granted"
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [
    index("historical_precedents_org_idx").on(t.orgId),
    index("historical_precedents_repo_idx").on(t.repositoryId),
  ],
);

export const documentArtifactKindEnum = pgEnum("document_artifact_kind", [
  "readme",
  "adr",
  "rfc",
  "codeowners",
  "ci-config",
  "doc",
  "changelog",
]);

export const documentArtifacts = pgTable(
  "document_artifacts",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    kind: documentArtifactKindEnum("kind").notNull(),
    filePath: text("file_path").notNull(),
    title: text("title"),
    objectStorageKey: text("object_storage_key").notNull(),
    contentHash: text("content_hash").notNull(),
    commitSha: text("commit_sha").notNull(),
    ...timestamps,
  },
  (t) => [
    index("document_artifacts_org_idx").on(t.orgId),
    index("document_artifacts_repo_idx").on(t.repositoryId),
    index("document_artifacts_kind_idx").on(t.kind),
  ],
);
