import { describe, it } from "bdd";
import { expect } from "expect";
import { SERVER_HEADER_VALUE } from "shared/app_metadata.ts";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { MCP_PROTOCOL_VERSION } from "adapters/mcp/mcp_server.ts";
import setupOakServer, { serverHeaderMiddleware } from "./server.ts";

describe("oak server", () => {
	it("adds the canonical Server header to HTTP responses", async () => {
		const headers = new Headers();
		const ctx = {
			response: {
				headers,
			},
		};

		await serverHeaderMiddleware(
			ctx as never,
			async () => {
				headers.set("Content-Type", "application/json");
			},
		);

		expect(headers.get("Server")).toBe(SERVER_HEADER_VALUE);
		expect(headers.get("Content-Type")).toBe("application/json");
	});

	it("wires loaded MCP options into the live Oak handler", async () => {
		const tenants = [{ name: "default" }] as unknown as AntboxTenant[];
		const start = setupOakServer(tenants, async () => {}, undefined, undefined, {
			allowedOrigins: ["https://app.example"],
			maxRequestBodyBytes: 1024,
		});
		const abortController = new AbortController();
		const requestHeaders = {
			"Content-Type": "application/json",
			"Accept": "application/json, text/event-stream",
			"MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
			"Mcp-Method": "server/discover",
			"Origin": "https://app.example",
		};
		const meta = {
			"io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_VERSION,
			"io.modelcontextprotocol/clientCapabilities": {},
		};

		try {
			const evt = await start({ port: 0, signal: abortController.signal } as never) as {
				port: number;
			};
			const base = `http://localhost:${evt.port}/mcp`;

			const allowedOrigin = await fetch(base, {
				method: "POST",
				headers: requestHeaders,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "server/discover",
					params: { _meta: meta },
				}),
			});
			// The default allowlist would reject this Origin, so 200 proves the option reached the handler.
			expect(allowedOrigin.status).toBe(200);

			const oversized = await fetch(base, {
				method: "POST",
				headers: requestHeaders,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 2,
					method: "server/discover",
					params: { _meta: meta, padding: "x".repeat(2048) },
				}),
			});
			// The default 1048576-byte limit would accept this body, so 413 proves the configured limit is live.
			expect(oversized.status).toBe(413);
		} finally {
			abortController.abort();
		}
	});
});
