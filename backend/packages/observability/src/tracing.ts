import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { trace, type Span, SpanStatusCode } from "@opentelemetry/api";

let sdk: NodeSDK | undefined;

/**
 * Initializes OpenTelemetry tracing for a Ratify service. Call once at
 * process start, before any other imports that should be instrumented
 * ideally, but Node's dynamic instrumentation patches modules at require
 * time so calling this first in the entrypoint is sufficient in practice.
 */
export function initTracing(serviceName: string, serviceVersion = "0.1.0"): NodeSDK {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
    }),
    traceExporter: endpoint ? new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }) : undefined,
    instrumentations: [getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
    })],
  });

  sdk.start();

  process.on("SIGTERM", () => {
    void sdk?.shutdown();
  });

  return sdk;
}

export async function shutdownTracing(): Promise<void> {
  await sdk?.shutdown();
}

const tracerCache = new Map<string, ReturnType<typeof trace.getTracer>>();

export function getTracer(name: string) {
  let tracer = tracerCache.get(name);
  if (!tracer) {
    tracer = trace.getTracer(name);
    tracerCache.set(name, tracer);
  }
  return tracer;
}

/** Runs a function inside a named span, recording exceptions and status. */
export async function withSpan<T>(
  tracerName: string,
  spanName: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  const tracer = getTracer(tracerName);
  return tracer.startActiveSpan(spanName, async (span) => {
    if (attributes) span.setAttributes(attributes);
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  });
}
