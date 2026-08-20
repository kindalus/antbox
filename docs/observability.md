---
name: observability
description: OpenTelemetry and runtime observability
---

# Observability

Antbox uses Deno-native OpenTelemetry support. The launcher includes `--unstable-otel`, so
OpenTelemetry can be enabled at runtime with environment variables and an OTLP-compatible collector.

## Enable OpenTelemetry

```bash
OTEL_DENO=true \
OTEL_SERVICE_NAME=antbox \
OTEL_RESOURCE_ATTRIBUTES=service.version=2.0.0,deployment.environment=dev \
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
./start_server.sh --demo
```

Deno exports runtime telemetry through OTLP and integrates with `npm:@opentelemetry/api`. When
OpenTelemetry is not enabled, the instrumentation is a no-op.

## Antbox spans and attributes

Antbox adds application-level spans around adapted HTTP routes and AI model calls.

HTTP spans include:

- `http.request.method`
- `http.route`
- `http.response.status_code`
- `url.scheme`
- `url.path`
- `server.address`
- `server.port`
- `antbox.tenant`
- `antbox.route.name` when Oak provides a route name

AI spans emitted around Pi runtime calls include:

- `antbox.tenant`
- `antbox.agent.uuid`
- `antbox.ai.interaction_type`
- `gen_ai.operation.name`
- `gen_ai.request.model`
- token usage attributes where available

Antbox records only operation metadata and token counts around Pi calls. User prompts, retrieved
documents, tool arguments/results, thinking blocks, API keys, and model responses are not added to
span attributes.

## Sensitive data handling

HTTP telemetry records route/path information only. It does not record full URLs or query strings,
so query credentials such as `api_key` are not exported as span attributes.

Console logs may also be exported by Deno when OpenTelemetry is enabled. Antbox request logs omit
query strings, but debug-level application logs can still contain operational details. Use debug and
agent trace modes only in controlled environments.

## Local collector

Run an OpenTelemetry Collector with an OTLP HTTP receiver on port `4318`, then start Antbox with the
environment variables above. The collector can forward traces, metrics, and logs to your backend of
choice.
