import { pgTable, text, integer, timestamp, uuid, jsonb, real, uniqueIndex } from "drizzle-orm/pg-core";

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

export const reviewSessions = pgTable(
  "review_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pullRequestId: uuid("pull_request_id").notNull().references(() => pullRequests.id),
    // Head SHA at the moment this review started. Idempotency key alongside
    // pullRequestId — the same PR at the same SHA should never produce two
    // parallel review sessions, no matter how many webhook retries fire.
    headSha: text("head_sha").notNull().default(""),
    status: text("status").notNull().default("running"), // running | completed | failed
    riskScore: integer("risk_score"),
    filesChanged: integer("files_changed").notNull().default(0),
    summary: text("summary"),
    checkRunId: integer("check_run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    prShaUnique: uniqueIndex("review_sessions_pr_sha_unique").on(t.pullRequestId, t.headSha),
  }),
);

// Fine-grained event log for each review session. Every stage of the
// pipeline emits a timestamped row here so we can (a) render a transparent
// timeline in the app, (b) debug why a review was slow or missed
// something, (c) audit the decisions the pipeline made and the raw model
// input/output that produced them. This is a big part of what makes
// Ratify not-a-blind-LLM-wrapper: every finding is traceable to the
// evidence it came from.
export const reviewEvents = pgTable("review_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  reviewSessionId: uuid("review_session_id").notNull().references(() => reviewSessions.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(), // webhook_received | policy_checks | context_retrieved | llm_call | evidence_generated | published | error
  durationMs: integer("duration_ms"),
  detail: jsonb("detail"), // stage-specific payload (raw LLM prompt/response, retrieved doctrine ids, etc.)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// User feedback on individual findings — the primary signal that closes
// the loop between "Ratify said X" and "reviewers agreed / disagreed".
// Feeds back into confidence scoring for future findings that cite the
// same rule.
export const findingFeedback = pgTable(
  "finding_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    findingId: uuid("finding_id").notNull().references(() => findings.id, { onDelete: "cascade" }),
    firebaseUid: text("firebase_uid").notNull(),
    verdict: text("verdict").notNull(), // accepted | false_positive | needs_context | exception
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    perUserUnique: uniqueIndex("finding_feedback_per_user_unique").on(t.findingId, t.firebaseUid),
  }),
);

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

// Doctrine rules mined from a repository's history. Each rule is a
// structured, confidence-scored assertion about how this repository is
// meant to be built — inferred from patterns in past review comments,
// merged PRs, and any explicit docs. This is Ratify's moat: the same
// rules never apply across repositories unless explicitly copied.
export const doctrineRules = pgTable("doctrine_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  installationId: uuid("installation_id").notNull().references(() => installations.id),
  repositoryId: uuid("repository_id").references(() => repositories.id),
  ruleKey: text("rule_key").notNull(),
  ruleText: text("rule_text").notNull(),
  category: text("category").notNull(), // e.g. "testing" | "architecture" | "documentation" | "dependencies"
  strength: text("strength").notNull().default("soft-norm"), // "hard-rule" | "soft-norm" | "likely-preference"
  confidence: real("confidence").notNull().default(0.5),
  discoveredFrom: text("discovered_from").notNull().default("history"), // "history" | "manual"
  supportingEvidence: jsonb("supporting_evidence"), // list of PR numbers / comment snippets that produced this
  enabled: text("enabled").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Per-installation mining state. Prevents concurrent mining runs and
// lets the dashboard show progress ("mining doctrine…") without polling
// the LLM endpoint directly.
export const doctrineMiningRuns = pgTable("doctrine_mining_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  installationId: uuid("installation_id").notNull().references(() => installations.id),
  status: text("status").notNull().default("running"), // "running" | "completed" | "failed"
  rulesFound: integer("rules_found").notNull().default(0),
  prsAnalyzed: integer("prs_analyzed").notNull().default(0),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubDeliveryId: text("github_delivery_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
