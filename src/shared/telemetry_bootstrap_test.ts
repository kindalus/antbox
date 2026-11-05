import { afterEach, describe, it } from "bdd";
import { expect } from "expect";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import process from "node:process";
import { isTelemetryEnabled, startTelemetry } from "./telemetry_bootstrap.ts";
import { withTelemetrySpan } from "./telemetry.ts";

const ENV_KEYS = [
	"OTEL_EXPORTER_OTLP_ENDPOINT",
	"OTEL_SERVICE_NAME",
	"OTEL_SDK_DISABLED",
	"OTEL_METRICS_EXPORTER",
	"OTEL_LOGS_EXPORTER",
];

describe("telemetry bootstrap", () => {
	const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

	afterEach(() => {
		for (const key of ENV_KEYS) {
			if (saved[key] === undefined) delete process.env[key];
			else process.env[key] = saved[key];
		}
	});

	it("is disabled unless an OTLP endpoint is configured", () => {
		expect(isTelemetryEnabled({})).toBe(false);
		expect(isTelemetryEnabled({ OTEL_EXPORTER_OTLP_ENDPOINT: " " })).toBe(false);
		expect(
			isTelemetryEnabled({
				OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
				OTEL_SDK_DISABLED: "true",
			}),
		).toBe(false);
		expect(isTelemetryEnabled({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318" })).toBe(
			true,
		);
	});

	it("exports spans with gen_ai and antbox attributes to the configured endpoint", async () => {
		const received: { path: string; body: string }[] = [];
		const sink = createServer((request, response) => {
			const chunks: Buffer[] = [];
			request.on("data", (chunk: Buffer) => chunks.push(chunk));
			request.on("end", () => {
				received.push({ path: request.url ?? "", body: Buffer.concat(chunks).toString() });
				response.writeHead(200, { "Content-Type": "application/json" }).end("{}");
			});
		});
		await new Promise<void>((resolve) => sink.listen(0, "127.0.0.1", resolve));
		const port = (sink.address() as AddressInfo).port;

		try {
			process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://127.0.0.1:${port}`;
			process.env.OTEL_SERVICE_NAME = "antbox-test";
			const shutdown = await startTelemetry();

			await withTelemetrySpan("antbox.test", {
				"gen_ai.operation.name": "chat",
				"antbox.tenant": "acme",
			}, () => Promise.resolve("ok"));
			await shutdown();

			expect(received).toHaveLength(1);
			expect(received[0].path).toBe("/v1/traces");
			expect(received[0].body).toContain("antbox.test");
			expect(received[0].body).toContain("gen_ai.operation.name");
			expect(received[0].body).toContain("antbox.tenant");
			expect(received[0].body).toContain("antbox-test");
		} finally {
			sink.close();
		}
	});
});
