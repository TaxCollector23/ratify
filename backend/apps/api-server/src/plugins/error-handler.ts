import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { isRatifyError } from "@ratify/shared";

/** Central error handler: converts RatifyError / ZodError into consistent JSON responses. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, request, reply) => {
    if (isRatifyError(err)) {
      request.log.warn({ err: err.message, code: err.code }, "request failed with RatifyError");
      reply.code(err.statusCode).send(err.toJSON());
      return;
    }

    if (err instanceof ZodError) {
      reply.code(400).send({
        error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: { issues: err.issues } },
      });
      return;
    }

    const error = err as Error;
    request.log.error({ err: error.message, stack: error.stack }, "unhandled request error");
    reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  });
}
