import { pgTable, text, integer, timestamp, uuid, jsonb, real } from "drizzle-orm/pg-core";

// Ratify user account. Firebase Auth owns the credentials; we store the
// Firebase UID plus the GitHub handle they typed at sign-up, which is how
// we match them to a GitHub App installation.
export const users = pgTable("users", {
  firebaseUid: text("firebase_uid").primaryKey(),
  email: text("email").notNull(),
  githubLogin: text("github_login").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubLogin: text("github_login").notNull().unique(),
  githubAccountId: integer("github_account_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const installations = pgTable("installations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  githubInstallationId: integer("github_installation_id").notNull().unique(),
  // Firebase UID of the Ratify user who owns/installed this. Filled in when
  // the installation's github_login matches a signed-up user's github_login.
  ownerFirebaseUid: text("owner_firebase_uid"),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const repositories = pgTable("repositories", {
  id: uuid("id").primaryKey().defaultRandom(),
  installationId: uuid("installation_id").notNull().references(() => installations.id),
  githubRepoId: integer("github_repo_id").notNull().unique(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  fullName: text("full_name").notNull(),
  defaultBranch: text("default_branch").notNull().default("main"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pullRequests = pgTable("pull_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  repositoryId: uuid("repository_id").notNull().references(() => repositories.id),
  githubPrNumber: integer("github_pr_number").notNull(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  headSha: text("head_sha").notNull(),
  baseSha: text("base_sha").notNull(),
  state: text("state").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviewSessions = pgTable("review_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  pullRequestId: uuid("pull_request_id").notNull().references(() => pullRequests.id),
  status: text("status").notNull().default("running"), // running | completed | failed
  riskScore: integer("risk_score"),
  filesChanged: integer("files_changed").notNull().default(0),
  summary: text("summary"),
  checkRunId: integer("check_run_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const findings = pgTable("findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  reviewSessionId: uuid("review_session_id").notNull().references(() => reviewSessions.id),
  ruleKey: text("rule_key").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  filePath: text("file_path"),
  severity: text("severity").notNull(), // low | medium | high
  confidence: real("confidence").notNull(),
  source: text("source").notNull(), // policy-engine | llm-reasoner
  evidence: jsonb("evidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubDeliveryId: text("github_delivery_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
