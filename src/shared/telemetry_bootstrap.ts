import process from "node:process";

const SHUTDOWN_TIMEOUT_MS = 5000;

export function isTelemetryEnabled(env: Record<string, string | undefined> = process.env): boolean {
	if (env.OTEL_SDK_DISABLED === "true") {
		return false;
	}

	return Boolean(env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim());
}

/**
 * Starts the OpenTelemetry SDK when `OTEL_EXPORTER_OTLP_ENDPOINT` is set and returns a function
 * that flushes and stops it. Nothing from the SDK is loaded otherwise.
 *
 * @remarks
 * External setup: the standard `OTEL_*` variables (endpoint, headers, service name, resource
 * attributes) configure the exporter.
 */
export async function startTelemetry(
	env: Record<string, string | undefined> = process.env,
): Promise<() => Promise<void>> {
	if (!isTelemetryEnabled(env)) {
		return () => Promise.resolve();
	}

	// Only traces are exported; without this the SDK also starts OTLP metric and log exporters
	process.env.OTEL_METRICS_EXPORTER ??= "none";
	process.env.OTEL_LOGS_EXPORTER ??= "none";

	const [{ NodeSDK }, { OTLPTraceExporter }] = await Promise.all([
		import("@opentelemetry/sdk-node"),
		import("@opentelemetry/exporter-trace-otlp-http"),
	]);

	const sdk = new NodeSDK({
		serviceName: env.OTEL_SERVICE_NAME ?? "antbox",
		traceExporter: new OTLPTraceExporter(),
	});
	sdk.start();

	let stopping: Promise<void> | undefined;
	const shutdown = () => {
		stopping ??= sdk.shutdown().catch(() => undefined);
		return stopping;
	};

	for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
		process.once(signal, () => {
			const timer = setTimeout(() => process.exit(code), SHUTDOWN_TIMEOUT_MS);
			void shutdown().finally(() => {
				clearTimeout(timer);
				process.exit(code);
			});
		});
	}
	process.once("beforeExit", () => void shutdown());

	return shutdown;
}
