import { describe, it } from "bdd";
import { expect } from "expect";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import process from "node:process";
import { stringify } from "smol-toml";

import type { ServerConfiguration } from "api/http_server_configuration.ts";
import { MCP_PROTOCOL_VERSION } from "adapters/mcp/mcp_server.ts";
import { createAdkLogger, getTenantSetupConfiguration, resolveEngine } from "./main.ts";

async function reservePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	const port = typeof address === "object" && address ? address.port : 0;
	await new Promise<void>((resolve) => server.close(() => resolve()));
	return port;
}

describe("getTenantSetupConfiguration", () => {
	it("preserves global auth settings for tenant setup", () => {
		const config: ServerConfiguration = {
			engine: "hono",
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

describe("resolveEngine", () => {
	it("serves the legacy oak engine with hono and logs a deprecation warning", () => {
		const originalWarn = console.warn;
		const messages: unknown[][] = [];
		console.warn = (...args: unknown[]) => {
			messages.push(args);
		};

		try {
			expect(resolveEngine("oak")).toBe("hono");
		} finally {
			console.warn = originalWarn;
		}

		expect(messages).toHaveLength(1);
		expect(String(messages[0]?.join(" "))).toContain("deprecated");
	});

	it("leaves other engines untouched without warning", () => {
		const originalWarn = console.warn;
		let warned = false;
		console.warn = () => {
			warned = true;
		};

		try {
			expect(resolveEngine("hono")).toBe("hono");
		} finally {
			console.warn = originalWarn;
		}

		expect(warned).toBe(false);
	});
});

describe("createAdkLogger", () => {
	it("routes ADK info logs to the main debug logger", () => {
		const originalLevel = process.env.ANTBOX_LOG_LEVEL;
		const originalDebug = console.debug;
		const messages: unknown[][] = [];

		process.env.ANTBOX_LOG_LEVEL = "debug";
		console.debug = (...args: unknown[]) => {
			messages.push(args);
		};

		try {
			createAdkLogger().info("sensitive info");
		} finally {
			console.debug = originalDebug;
			if (originalLevel === undefined) {
				delete process.env.ANTBOX_LOG_LEVEL;
			} else {
				process.env.ANTBOX_LOG_LEVEL = originalLevel;
			}
		}

		expect(messages).toHaveLength(1);
		expect(messages[0]?.[0]).toBe("[DEBUG]");
		expect(messages[0]?.[1]).toBe("[ADK]");
		expect(messages[0]?.[2]).toBe("sensitive info");
	});
});

describe("main entry point", () => {
	it("prints key information without inventing a default root password", async () => {
		const dir = await fs.mkdtemp(join(tmpdir(), "antbox-print-keys-"));
		try {
			await fs.writeFile(join(dir, "antbox.key"), "test-key");
			await fs.writeFile(join(dir, "antbox.jwks"), JSON.stringify({ keys: [] }));
			const result = spawnSync(
				process.execPath,
				["--no-env-file", "main.ts", "--keys", "-c", dir],
				{
					cwd: fileURLToPath(new URL(".", import.meta.url)),
					env: { ...process.env, ANTBOX_LOG_LEVEL: "info" },
					encoding: "utf8",
				},
			);
			expect(result.status).toBe(0);
			const output = result.stdout;
			expect(output).toContain("rootPasswd in config.toml or tenants.d");
			expect(output).toContain("test-key");
			expect(output).not.toContain("demo");
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	it("forwards loaded MCP settings through the real server process", async () => {
		const repoRoot = fileURLToPath(new URL(".", import.meta.url));
		const dir = await fs.mkdtemp(join(tmpdir(), "antbox-main-mcp-"));
		const port = await reservePort();
		const config = {
			engine: "oak",
			rootPasswd: "test-root",
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
		await fs.writeFile(join(dir, "config.toml"), stringify(config));

		const child = spawn(
			process.execPath,
			["--no-env-file", "main.ts", "-c", dir, "-d", join(dir, "data")],
			{ cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
		);
		const exited = new Promise<void>((resolve) => {
			child.once("exit", () => resolve());
			child.once("error", () => resolve());
		});

		let stdoutText = "";
		let stderrText = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdoutText += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
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

			expect(stdoutText).toContain("(hono) started successfully");

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
			await allowlisted.body?.cancel();
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
			await oversized.body?.cancel();
			expect(oversized.status).toBe(413);
		} finally {
			try {
				child.kill("SIGKILL");
			} catch {
				// Process already exited.
			}
			await exited;
			await fs.rm(dir, { recursive: true, force: true });
		}
	});
});
