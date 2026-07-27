import Fastify from "fastify";
import { createDb, schema } from "@ratify/db";
import { createLogger } from "@ratify/observability";
import { sql } from "drizzle-orm";

/**
 * Standalone admin-metrics process. In the primary deployment topology
 * (see ARCHITECTURE.md) the same routes are mounted inside api-server for
 * operational simplicity; this app exists so ops/admin traffic can be
 * split onto its own process + scaling policy without any code changes
 * — it reads from the same Postgres instance, read-only.
 */
const logger = createLogger({ service: "admin-metrics" });

async function main() {
  const db = createDb();
  const app = Fastify({ logger: false });

  app.get("/healthz", async () => ({ status: "ok", service: "admin-metrics" }));

  app.get("/system/health", async () => {
    const [dbCheck] = await db.execute(sql`SELECT 1 as ok`);
    const deadLetterJobs = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.jobs)
      .where(sql`${schema.jobs.status} = 'dead_letter'`);

    return {
      database: dbCheck ? "ok" : "unreachable",
      deadLetterJobCount: deadLetterJobs[0]?.count ?? 0,
      timestamp: new Date().toISOString(),
    };
  });

  const port = Number(process.env.PORT ?? 4002);
  await app.listen({ port, host: "0.0.0.0" });
  logger.info({ port }, "admin-metrics listening");
}

main().catch((err) => {
  logger.error({ err: (err as Error).message }, "admin-metrics failed to start");
  process.exit(1);
});
