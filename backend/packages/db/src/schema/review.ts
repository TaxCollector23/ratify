import { index, integer, jsonb, pgEnum, pgTable, real, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./common.js";
import { organizations } from "./org.js";
import { repositories } from "./github.js";
import { pullRequests } from "./pull-request.js";

export const reviewSessionStatusEnum = pgEnum("review_session_status", [
  "queued",
  "gathering_context",
  "running_policy_checks",
  "running_ai_reasoning",
  "scoring",
  "publishing",
  "completed",
  "failed",
]);

/**
 * ReviewSession is the top-level unit of work for a single PR analysis
 * run (one per head SHA re-analysis). It ties together policy findings,
 * AI reasoning runs, evidence, scores, and publication records, and
 * carries the full event timeline via MetricsEvent.reviewSessionId.
 */
export const reviewSessions = pgTable(
  "review_sessions",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    pullRequestId: uuid("pull_request_id")
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    headSha: text("head_sha").notNull(),
    status: reviewSessionStatusEnum("status").notNull().default("queued"),
    triggeredBy: text("triggered_by").notNull().default("webhook"), // webhook|manual-rerun|feedback
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    failureReason: text("failure_reason"),
    ...timestamps,
  },
  (t) => [
    index("review_sessions_org_idx").on(t.orgId),
    index("review_sessions_repo_idx").on(t.repositoryId),
    index("review_sessions_pr_idx").on(t.pullRequestId),
    uniqueIndex("review_sessions_pr_head_sha_idx").on(t.pullRequestId, t.headSha),
    index("review_sessions_status_idx").on(t.status),
  ],
);

export const findingSeverityEnum = pgEnum("finding_severity", ["info", "low", "medium", "high", "critical"]);
export const findingSourceEnum = pgEnum("finding_source", [
  "policy-engine",
  "llm-reasoner",
  "history-miner",
  "doctrine-miner",
]);
export const findingStatusEnum = pgEnum("finding_status", [
  "open",
  "acknowledged",
  "resolved",
  "dismissed",
  "excepted",
]);

export const findings = pgTable(
  "findings",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    reviewSessionId: uuid("review_session_id")
      .notNull()
      .references(() => reviewSessions.id, { onDelete: "cascade" }),
    ruleKey: text("rule_key").notNull(), // e.g. "missing-tests-for-payments-paths"
    source: findingSourceEnum("source").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    severity: findingSeverityEnum("severity").notNull(),
    confidence: real("confidence").notNull(), // 0..1
    status: findingStatusEnum("status").notNull().default("open"),
    filePath: text("file_path"),
    lineStart: integer("line_start"),
    lineEnd: integer("line_end"),
    falsePositiveLikelihood: real("false_positive_likelihood"),
    remediation: text("remediation"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index("findings_org_idx").on(t.orgId),
    index("findings_session_idx").on(t.reviewSessionId),
    index("findings_rule_key_idx").on(t.ruleKey),
    index("findings_severity_idx").on(t.severity),
    index("findings_status_idx").on(t.status),
  ],
);

export const evidenceItems = pgTable(
  "evidence_items",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // file-line|pull-request|commit|review-comment|doc|adr|graph-node
    ref: text("ref").notNull(),
    excerpt: text("excerpt"),
    url: text("url"),
    weight: real("weight").notNull().default(1.0), // contribution to confidence calibration
    ...timestamps,
  },
  (t) => [
    index("evidence_items_org_idx").on(t.orgId),
    index("evidence_items_finding_idx").on(t.findingId),
  ],
);

export const scoreSnapshots = pgTable(
  "score_snapshots",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    reviewSessionId: uuid("review_session_id")
      .notNull()
      .references(() => reviewSessions.id, { onDelete: "cascade" }),
    overallScore: real("overall_score").notNull(), // 0..100, higher = riskier
    severityCounts: jsonb("severity_counts").$type<Record<string, number>>().notNull().default({}),
    touchedSensitiveAreas: text("touched_sensitive_areas").notNull().default("false"),
    hasBreakingApiChange: text("has_breaking_api_change").notNull().default("false"),
    missingTestCoverage: text("missing_test_coverage").notNull().default("false"),
    ...timestamps,
  },
  (t) => [
    index("score_snapshots_org_idx").on(t.orgId),
    index("score_snapshots_session_idx").on(t.reviewSessionId),
  ],
);

export const publicationRecords = pgTable(
  "publication_records",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    reviewSessionId: uuid("review_session_id")
      .notNull()
      .references(() => reviewSessions.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(), // github-check-run|github-pr-comment
    externalId: text("external_id"), // check run id / comment id
    status: text("status").notNull().default("pending"), // pending|published|failed
    payloadSummary: text("payload_summary"),
    errorMessage: text("error_message"),
    publishedAt: text("published_at"),
    ...timestamps,
  },
  (t) => [
    index("publication_records_org_idx").on(t.orgId),
    index("publication_records_session_idx").on(t.reviewSessionId),
  ],
);
