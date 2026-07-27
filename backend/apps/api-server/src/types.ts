import type { Database } from "@ratify/db";
import type { Logger, MetricsEmitter } from "@ratify/observability";

export interface AppDeps {
  db: Database;
  logger: Logger;
  metrics: MetricsEmitter;
}
