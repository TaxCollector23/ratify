import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { createDb } from "@ratify/db";
import { getObjectStore } from "@ratify/storage";
import { createLogger, LoggingMetricsSink, MetricsEmitter, initTracing } from "@ratify/observability";
import { buildWebhookHandler } from "./handler.js";

const logger = createLogger({ service: "webhook-handler" });

async function main() {
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    initTracing("ratify-webhook-handler");
  }

  const db = createDb();
  const objectStore = getObjectStore();
  const metrics = new MetricsEmitter([new LoggingMetricsSink(logger)]);
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error("GITHUB_WEBHOOK_SECRET is not set; refusing to start webhook-handler");
    process.exit(1);
  }

  const app = Fastify({
    logger: false, // we use our own pino instance for structured logs
    // Preserve the exact raw request body bytes for HMAC verification —
    // Fastify's default JSON body parser discards the raw buffer otherwise.
    bodyLimit: 5 * 1024 * 1024,
  });

  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    try {
      const raw = body as Buffer;
      (req as unknown as { rawBody: Buffer }).rawBody = raw;
      done(null, JSON.parse(raw.toString("utf-8")));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
  });

  app.get("/healthz", async () => ({ status: "ok", service: "webhook-handler" }));

  app.post("/webhooks/github", buildWebhookHandler({ db, objectStore, logger, metrics, webhookSecret }));

  const port = Number(process.env.PORT ?? 4001);
  await app.listen({ port, host: "0.0.0.0" });
  logger.info({ port }, "webhook-handler listening");
}

main().catch((err) => {
  logger.error({ err: (err as Error).message, stack: (err as Error).stack }, "webhook-handler failed to start");
  process.exit(1);
});
