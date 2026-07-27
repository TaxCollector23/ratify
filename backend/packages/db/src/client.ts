import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export type Database = PostgresJsDatabase<typeof schema>;

let sql: postgres.Sql | undefined;
let db: Database | undefined;

export interface CreateDbOptions {
  connectionString?: string;
  maxConnections?: number;
}

/** Creates (or returns the cached) Drizzle client for the given process. */
export function createDb(options: CreateDbOptions = {}): Database {
  if (db) return db;

  const connectionString =
    options.connectionString ?? process.env.DATABASE_URL ?? "postgres://ratify:ratify@localhost:5432/ratify";

  sql = postgres(connectionString, {
    max: options.maxConnections ?? 10,
    onnotice: () => {
      /* suppress NOTICE spam from Postgres in dev */
    },
  });

  db = drizzle(sql, { schema });
  return db;
}

export async function closeDb(): Promise<void> {
  await sql?.end({ timeout: 5 });
  db = undefined;
  sql = undefined;
}
