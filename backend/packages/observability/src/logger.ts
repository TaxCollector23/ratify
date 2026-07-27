import pino, { type Logger } from "pino";

export interface LoggerOptions {
  service: string;
  level?: string;
  pretty?: boolean;
}

/**
 * Structured JSON logger factory. Every service constructs its logger via
 * this factory so that log shape (service, env, level, timestamps) stays
 * consistent for downstream log aggregation.
 */
export function createLogger(options: LoggerOptions): Logger {
  const { service, level = process.env.LOG_LEVEL ?? "info", pretty = process.env.NODE_ENV === "development" } =
    options;

  return pino({
    level,
    base: {
      service,
      env: process.env.NODE_ENV ?? "development",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: pretty
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
        }
      : undefined,
  });
}

/** Attaches request-scoped fields (org, request id) for correlated logging. */
export function withRequestContext(
  logger: Logger,
  ctx: { requestId?: string; orgId?: string; jobId?: string },
): Logger {
  return logger.child(ctx);
}

export type { Logger };
