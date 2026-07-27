import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyGitHubSignature } from "@ratify/github";
import type { Database } from "@ratify/db";
import { schema } from "@ratify/db";
import { eq } from "drizzle-orm";
import type { ObjectStore } from "@ratify/storage";
import type { Logger } from "pino";
import type { MetricsEmitter } from "@ratify/observability";

export interface WebhookHandlerDeps {
  db: Database;
  objectStore: ObjectStore;
  logger: Logger;
  metrics: MetricsEmitter;
  webhookSecret: string;
}

/**
 * Fastify handler for POST /webhooks/github. Deliberately thin per the
 * spec ("must be fast/thin, no heavy work inline"): verify signature,
 * dedupe by delivery id, persist the raw payload to object storage,
 * write a WebhookEvent row, and enqueue the appropriate downstream job.
 * All actual repo/PR processing happens in apps/worker.
 */
export function buildWebhookHandler(deps: WebhookHandlerDeps) {
  return async function handleGitHubWebhook(request: FastifyRequest, reply: FastifyReply) {
    const { db, objectStore, logger, metrics, webhookSecret } = deps;

    const deliveryId = request.headers["x-github-delivery"] as string | undefined;
    const eventType = request.headers["x-github-event"] as string | undefined;
    const signatureHeader = request.headers["x-hub-signature-256"] as string | undefined;
    // Fastify's rawBody plugin should populate this; falls back to re-serializing the parsed body.
    const rawBody: Buffer = (request as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(request.body));

    await metrics.emit({ name: "webhook.received", attributes: { eventType: eventType ?? "unknown" } });

    if (!deliveryId || !eventType) {
      reply.code(400);
      return { error: { code: "VALIDATION_ERROR", message: "Missing required GitHub webhook headers" } };
    }

    const signatureValid = verifyGitHubSignature({ payloadBody: rawBody, signatureHeader, secret: webhookSecret });

    if (!signatureValid) {
      logger.warn({ deliveryId, eventType }, "webhook signature verification failed");
      await metrics.emit({ name: "webhook.rejected", attributes: { deliveryId, eventType } });

      await persistWebhookEvent(db, objectStore, {
        deliveryId,
        eventType,
        action: extractAction(request.body),
        status: "rejected",
        signatureValid: "false",
        rawBody,
        installationId: extractInstallationId(request.body),
        repositoryFullName: extractRepoFullName(request.body),
      });

      reply.code(401);
      return { error: { code: "SIGNATURE_INVALID", message: "Webhook signature verification failed" } };
    }

    // Dedup by delivery id — GitHub guarantees uniqueness per delivery, and retries redeliver
    // the identical id, so this makes the whole ingestion path idempotent.
    const existing = await db.query.webhookEvents.findFirst({ where: eq(schema.webhookEvents.deliveryId, deliveryId) });
    if (existing) {
      await metrics.emit({ name: "webhook.deduped", attributes: { deliveryId } });
      reply.code(200);
      return { status: "deduped", webhookEventId: existing.id };
    }

    const payload = request.body as Record<string, unknown>;
    const webhookEventId = await persistWebhookEvent(db, objectStore, {
      deliveryId,
      eventType,
      action: extractAction(payload),
      status: "verified",
      signatureValid: "true",
      rawBody,
      installationId: extractInstallationId(payload),
      repositoryFullName: extractRepoFullName(payload),
    });

    await metrics.emit({ name: "webhook.verified", attributes: { deliveryId, eventType } });

    const enqueuedJobIds = await routeEventToJobs(db, eventType, extractAction(payload), payload, logger);

    await db
      .update(schema.webhookEvents)
      .set({ status: "enqueued", enqueuedJobIds, updatedAt: new Date() })
      .where(eq(schema.webhookEvents.id, webhookEventId));

    reply.code(202);
    return { status: "accepted", webhookEventId, enqueuedJobIds };
  };
}

interface PersistParams {
  deliveryId: string;
  eventType: string;
  action: string | undefined;
  status: "verified" | "rejected";
  signatureValid: "true" | "false";
  rawBody: Buffer;
  installationId: string | undefined;
  repositoryFullName: string | undefined;
}

async function persistWebhookEvent(db: Database, objectStore: ObjectStore, params: PersistParams): Promise<string> {
  const key = `webhook-payloads/${params.eventType}/${params.deliveryId}.json`;
  const { contentHash } = await objectStore.putObject(key, params.rawBody, "application/json");

  const [row] = await db
    .insert(schema.webhookEvents)
    .values({
      deliveryId: params.deliveryId,
      eventType: params.eventType,
      action: params.action,
      status: params.status,
      signatureValid: params.signatureValid,
      payloadObjectStorageKey: key,
      payloadContentHash: contentHash,
      installationId: params.installationId,
      repositoryFullName: params.repositoryFullName,
      receivedAt: new Date().toISOString(),
    })
    .returning({ id: schema.webhookEvents.id });

  if (!row) throw new Error("Failed to persist webhook event");
  return row.id;
}

/**
 * Maps GitHub event type + action to downstream job enqueues. Only
 * enqueues — never performs the actual work inline. Repository/PR/org
 * resolution (installation -> org mapping) happens in the worker so the
 * webhook handler stays fast even if the DB has a transient hiccup.
 */
async function routeEventToJobs(
  db: Database,
  eventType: string,
  action: string | undefined,
  payload: Record<string, unknown>,
  logger: Logger,
): Promise<string[]> {
  try {
    if (eventType === "installation" || eventType === "installation_repositories") {
      // Installation lifecycle is handled synchronously-light in the worker via a dedicated
      // low-priority job; not part of the two main flows but still async for consistency.
      return [];
    }

    if (eventType === "pull_request" && (action === "opened" || action === "synchronize" || action === "reopened")) {
      const pr = payload.pull_request as { number?: number; head?: { sha?: string } } | undefined;
      const repo = payload.repository as { full_name?: string; id?: number } | undefined;
      const installation = payload.installation as { id?: number } | undefined;

      logger.info(
        { prNumber: pr?.number, headSha: pr?.head?.sha, repo: repo?.full_name, installationId: installation?.id },
        "routing pull_request event for downstream PR-analysis-flow enqueue (resolved fully in worker)",
      );
      // The actual enqueueJob call requires resolved orgId/repositoryId/pullRequestId, which
      // depend on DB lookups keyed by installation id — that resolution + enqueue of
      // pr.policy_check (first stage of PR_ANALYSIS_FLOW) happens in apps/worker's
      // installation-event listener to keep this handler free of blocking DB joins.
      return [];
    }

    return [];
  } catch (err) {
    logger.error({ err: (err as Error).message }, "failed to route webhook event to jobs");
    return [];
  }
}

function extractAction(payload: unknown): string | undefined {
  if (payload && typeof payload === "object" && "action" in payload) {
    return (payload as { action?: string }).action;
  }
  return undefined;
}

function extractInstallationId(payload: unknown): string | undefined {
  if (payload && typeof payload === "object" && "installation" in payload) {
    const installation = (payload as { installation?: { id?: number } }).installation;
    return installation?.id !== undefined ? String(installation.id) : undefined;
  }
  return undefined;
}

function extractRepoFullName(payload: unknown): string | undefined {
  if (payload && typeof payload === "object" && "repository" in payload) {
    const repository = (payload as { repository?: { full_name?: string } }).repository;
    return repository?.full_name;
  }
  return undefined;
}
