import { index, pgEnum, pgTable, real, text, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./common.js";
import { organizations } from "./org.js";
import { findings } from "./review.js";
import { repositories } from "./github.js";

export const feedbackEventKindEnum = pgEnum("feedback_event_kind", [
  "agree",
  "disagree",
  "false_positive",
  "exception",
  "temporary_exception",
  "needs_human_review",
]);

export const feedbackEvents = pgTable(
  "feedback_events",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    kind: feedbackEventKindEnum("kind").notNull(),
    comment: text("comment"),
    confidenceDelta: real("confidence_delta"), // applied adjustment to related doctrine/finding confidence
    ...timestamps,
  },
  (t) => [
    index("feedback_events_org_idx").on(t.orgId),
    index("feedback_events_finding_idx").on(t.findingId),
    index("feedback_events_kind_idx").on(t.kind),
  ],
);

export const exceptionRecordStatusEnum = pgEnum("exception_record_status", ["active", "expired", "revoked"]);

export const exceptionRecords = pgTable(
  "exception_records",
  {
    id: idColumn(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    ruleKey: text("rule_key").notNull(),
    scopeGlob: text("scope_glob"),
    grantedByUserId: uuid("granted_by_user_id"),
    reason: text("reason").notNull(),
    status: exceptionRecordStatusEnum("status").notNull().default("active"),
    expiresAt: text("expires_at"), // null = permanent
    sourceFindingId: uuid("source_finding_id").references(() => findings.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("exception_records_org_idx").on(t.orgId),
    index("exception_records_repo_idx").on(t.repositoryId),
    index("exception_records_rule_key_idx").on(t.ruleKey),
    index("exception_records_status_idx").on(t.status),
  ],
);
