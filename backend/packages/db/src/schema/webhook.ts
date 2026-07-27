import { index, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./common.js";
import { organizations } from "./org.js";

export const webhookEventStatusEnum = pgEnum("webhook_event_status", [
  "received",
  "verified",
  "rejected",
  "deduped",
  "enqueued",
  "processing_failed",
]);

/**
 * WebhookEvent persists every inbound GitHub delivery, verified or not,
 * for audit + replay + dedup. deliveryId (X-GitHub-Delivery) is the
 * natural idempotency key GitHub guarantees is unique per delivery.
 */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: idColumn(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }), // nullable: unresolved until installation is matched
    deliveryId: text("delivery_id").notNull(),
    eventType: text("event_type").notNull(), // X-GitHub-Event, e.g. "pull_request"
    action: text("action"), // payload.action, e.g. "opened", "synchronize"
    status: webhookEventStatusEnum("status").notNull().default("received"),
    signatureValid: text("signature_valid"), // "true"|"false"|null (unknown before verification)
    payloadObjectStorageKey: text("payload_object_storage_key").notNull(),
    payloadContentHash: text("payload_content_hash").notNull(),
    installationId: text("installation_id"),
    repositoryFullName: text("repository_full_name"),
    enqueuedJobIds: jsonb("enqueued_job_ids").$type<string[]>().notNull().default([]),
    errorMessage: text("error_message"),
    receivedAt: text("received_at").notNull(),
    ...timestamps,
  },
  (t) => [
    index("webhook_events_org_idx").on(t.orgId),
    uniqueIndex("webhook_events_delivery_id_idx").on(t.deliveryId),
    index("webhook_events_status_idx").on(t.status),
    index("webhook_events_event_type_idx").on(t.eventType),
  ],
);
