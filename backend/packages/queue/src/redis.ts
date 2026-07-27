import { Redis } from "ioredis";

let connection: Redis | undefined;

/** Shared Redis connection for BullMQ queues/workers. BullMQ requires maxRetriesPerRequest: null. */
export function getRedisConnection(): Redis {
  if (connection) return connection;
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  connection = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  return connection;
}

export async function closeRedisConnection(): Promise<void> {
  await connection?.quit();
  connection = undefined;
}
