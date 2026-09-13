import { describe, it } from "bdd";
import { expect } from "expect";
import { join } from "node:path";
import { stringify } from "toml";

import type { ServerConfiguration } from "api/http_server_configuration.ts";
import { MCP_PROTOCOL_VERSION } from "adapters/mcp/mcp_server.ts";
import { createAdkLogger, getTenantSetupConfiguration } from "./main.ts";

async function reservePort(): Promise<number> {
	const server = Deno.serve({ port: 0, hostname: "127.0.0.1" }, () => new Response(""));
	const port = (server.addr as Deno.NetAddr).port;
	await server.shutdown();
	return port;
}

describe("getTenantSetupConfiguration", () => {
	it("preserves global auth settings for tenant setup", () => {
		const config: ServerConfiguration = {
			engine: "oak",
			port: 7180,
			rootPasswd: "demo",
			key: "./.config/antbox.key",
			jwks: "http://localhost:8099/.well-known/jwks.json",
			tenants: [{
				name: "demox",
				storage: ["inmem/inmem_storage_provider.ts"],
				repository: ["inmem/inmem_node_repository.ts"],
				configurationRepository: ["./src/adapters/.tmp-test-config.ts"],
				eventStoreRepository: ["inmem/inmem_event_store_repository.ts"],
				limits: {
					storage: 10,
					tokens: 0,
				},
			}],
		};

		expect(getTenantSetupConfiguration(config)).toEqual(config);
	});
});

describe("createAdkLogger", () => {
	it("routes ADK info logs to the main debug logger", () => {
		const originalLevel = Deno.env.get("ANTBOX_LOG_LEVEL");
		const originalDebug = console.debug;
		const messages: unknown[][] = [];

		Deno.env.set("ANTBOX_LOG_LEVEL", "debug");
		console.debug = (...args: unknown[]) => {
			messages.push(args);
		};

		try {
			createAdkLogger().info("sensitive info");
		} finally {
			console.debug = originalDebug;
			if (originalLevel === undefined) {
				Deno.env.delete("ANTBOX_LOG_LEVEL");
			} else {
				Deno.env.set("ANTBOX_LOG_LEVEL", originalLevel);
			}
		}

		expect(messages).toHaveLength(1);
		expect(messages[0]?.[0]).toBe("[DEBUG]");
		expect(messages[0]?.[1]).toBe("[ADK]");
		expect(messages[0]?.[2]).toBe("sensitive info");
	});
});

describe("main entry point", () => {
	it("forwards loaded MCP settings through the real server process", async () => {
		const repoRoot = new URL(".", import.meta.url).pathname;
		const dir = await Deno.makeTempDir({ prefix: "antbox-main-mcp-" });
		const port = await reservePort();
		const config = {
			engine: "oak",
			port,
			logLevel: "error",
			mcpAllowedOrigins: ["https://app.example"],
			mcpMaxRequestBodyBytes: 512,
			tenants: [{
				name: "default",
				storage: ["inmem/inmem_storage_provider.ts"],
				repository: ["inmem/inmem_node_repository.ts"],
				configurationRepository: ["inmem/inmem_configuration_repository.ts"],
				eventStoreRepository: ["inmem/inmem_event_store_repository.ts"],
				limits: { storage: 10, tokens: 0 },
			}],
		};
		await Deno.writeTextFile(join(dir, "config.toml"), stringify(config));

		const child = new Deno.Command(Deno.execPath(), {
			args: ["run", "-A", "main.ts", "-c", dir, "-d", join(dir, "data")],
			cwd: repoRoot,
			stdout: "piped",
			stderr: "piped",
		}).spawn();

		const decoder = new TextDecoder();
		let stdoutText = "";
		let stderrText = "";
		const pump = async (
			stream: ReadableStream<Uint8Array> | null,
			append: (chunk: string) => void,
		) => {
			if (!stream) return;
			for await (const chunk of stream) append(decoder.decode(chunk));
		};
		void pump(child.stdout, (chunk) => {
			stdoutText += chunk;
		});
		void pump(child.stderr, (chunk) => {
			stderrText += chunk;
		});

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
			const deadline = Date.now() + 60000;
			while (!stdoutText.includes("started successfully on")) {
				if (Date.now() > deadline) {
					throw new Error(
						`server did not start within timeout\nstdout:\n${stdoutText}\nstderr:\n${stderrText}`,
					);
				}
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			const base = `http://localhost:${port}/mcp`;
			const allowlisted = await fetch(base, {
				method: "POST",
				headers: requestHeaders,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "server/discover",
					params: { _meta: meta },
				}),
			});
			// The default allowlist would reject this Origin; 200 proves loadConfiguration -> main -> server wiring.
			expect(allowlisted.status).toBe(200);

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
			// The default 1048576-byte limit would accept this; 413 proves the loaded limit is forwarded.
			expect(oversized.status).toBe(413);
		} finally {
			try {
				child.kill("SIGKILL");
			} catch {
				// Process already exited.
			}
			await child.status.catch(() => {});
			await Deno.remove(dir, { recursive: true });
		}
	});
});
