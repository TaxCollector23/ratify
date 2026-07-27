/**
 * Shared error taxonomy used across all Ratify services.
 * Every error carries a stable machine-readable `code` so that
 * logs, metrics, and API responses can be correlated consistently.
 */

export type RatifyErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "ORG_BOUNDARY_VIOLATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_ERROR"
  | "SIGNATURE_INVALID"
  | "SCHEMA_CONSTRAINT_FAILED"
  | "IDEMPOTENCY_CONFLICT"
  | "INTERNAL_ERROR";

export interface RatifyErrorOptions {
  code: RatifyErrorCode;
  message: string;
  statusCode?: number;
  cause?: unknown;
  details?: Record<string, unknown>;
  retryable?: boolean;
}

export class RatifyError extends Error {
  readonly code: RatifyErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;
  readonly retryable: boolean;

  constructor(options: RatifyErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "RatifyError";
    this.code = options.code;
    this.statusCode = options.statusCode ?? defaultStatusForCode(options.code);
    this.details = options.details;
    this.retryable = options.retryable ?? defaultRetryableForCode(options.code);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details ?? null,
        retryable: this.retryable,
      },
    };
  }
}

function defaultStatusForCode(code: RatifyErrorCode): number {
  switch (code) {
    case "VALIDATION_ERROR":
    case "SCHEMA_CONSTRAINT_FAILED":
      return 400;
    case "UNAUTHORIZED":
    case "SIGNATURE_INVALID":
      return 401;
    case "FORBIDDEN":
    case "ORG_BOUNDARY_VIOLATION":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
    case "IDEMPOTENCY_CONFLICT":
      return 409;
    case "RATE_LIMITED":
      return 429;
    case "UPSTREAM_TIMEOUT":
      return 504;
    case "UPSTREAM_ERROR":
      return 502;
    case "INTERNAL_ERROR":
    default:
      return 500;
  }
}

function defaultRetryableForCode(code: RatifyErrorCode): boolean {
  return (
    code === "UPSTREAM_TIMEOUT" ||
    code === "UPSTREAM_ERROR" ||
    code === "RATE_LIMITED" ||
    code === "INTERNAL_ERROR"
  );
}

export function isRatifyError(err: unknown): err is RatifyError {
  return err instanceof RatifyError;
}
