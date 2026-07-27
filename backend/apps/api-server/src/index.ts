import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { serializerCompiler, validatorCompiler, jsonSchemaTransform, type ZodTypeProvider } from "fastify-type-provider-zod";
import { createDb } from "@ratify/db";
import { createLogger, LoggingMetricsSink, MetricsEmitter, initTracing } from "@ratify/observability";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { registerAuthDecorator } from "./plugins/auth.js";
import { registerInstallationRoutes } from "./routes/installations.js";
import { registerRepositoryRoutes } from "./routes/repositories.js";
import { registerReviewSessionRoutes } from "./routes/review-sessions.js";
import { registerFindingRoutes } from "./routes/findings.js";
import { registerDoctrineRoutes } from "./routes/doctrine.js";
import { registerFeedbackRoutes } from "./routes/feedback.js";
import { registerJobAndWebhookRoutes } from "./routes/jobs-and-webhooks.js";
import { registerAdminMetricsRoutes } from "./routes/admin-metrics.js";
import type { AppDeps } from "./types.js";

const logger = createLogger({ service: "api-server" });

async function main() {
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    initTracing("ratify-api-server");
  }

  const db = createDb();
  const metrics = new MetricsEmitter([new LoggingMetricsSink(logger)]);
  const deps: AppDeps = { db, logger, metrics };

  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerErrorHandler(app);

  await app.register(cors, { origin: true });

  await app.register(swagger, {
    openapi: {
      info: { title: "Ratify API", version: "0.1.0", description: "Engineering-governance platform API" },
      servers: [{ url: "http://localhost:4000" }],
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer" },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, { routePrefix: "/documentation" });

  registerAuthDecorator(app, db);

  app.get("/healthz", async () => ({ status: "ok", service: "api-server" }));

  registerInstallationRoutes(app, deps);
  registerRepositoryRoutes(app, deps);
  registerReviewSessionRoutes(app, deps);
  registerFindingRoutes(app, deps);
  registerDoctrineRoutes(app, deps);
  registerFeedbackRoutes(app, deps);
  registerJobAndWebhookRoutes(app, deps);
  registerAdminMetricsRoutes(app, deps);

  const port = Number(process.env.PORT ?? 4000);
  await app.listen({ port, host: "0.0.0.0" });
  logger.info({ port }, "api-server listening");
}

main().catch((err) => {
  logger.error({ err: (err as Error).message, stack: (err as Error).stack }, "api-server failed to start");
  process.exit(1);
});
