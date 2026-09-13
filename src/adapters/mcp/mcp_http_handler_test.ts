import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { NodeService } from "application/nodes/node_service.ts";
import { ApiKeysService } from "application/security/api_keys_service.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import type { McpHttpOptions } from "api/http_server_configuration.ts";
import { MCP_PROTOCOL_VERSION } from "./mcp_server.ts";
import { mcpHttpHandler } from "./mcp_http_handler.ts";

const PROTOCOL_META_KEY = "io.modelcontextprotocol/protocolVersion";
const CAPABILITIES_META_KEY = "io.modelcontextprotocol/clientCapabilities";

interface Fixture {
	handler: (req: Request) => Promise<Response>;
	validToken: string;
}

interface PostOptions {
	id?: number | string | null;
	method?: string;
	params?: Record<string, unknown>;
	token?: string;
	origin?: string;
	name?: string;
	rawBody?: string;
	url?: string;
	headers?: Record<string, string>;
	omit?: string[];
	metaOverride?: Record<string, unknown>;
}

function requestBody(options: PostOptions): string {
	const method = options.method ?? "server/discover";
	const id = options.id === undefined ? 1 : options.id;
	const meta = options.metaOverride ?? {
		[PROTOCOL_META_KEY]: MCP_PROTOCOL_VERSION,
		[CAPABILITIES_META_KEY]: {},
	};
	const body: Record<string, unknown> = {
		jsonrpc: "2.0",
		method,
		params: { _meta: meta, ...options.params },
	};
	if (id !== null) body.id = id;
	return JSON.stringify(body);
}

function post(options: PostOptions = {}): Request {
	const method = options.method ?? "server/discover";
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"Accept": "application/json, text/event-stream",
		"MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
		"Mcp-Method": method,
		...(options.name !== undefined ? { "Mcp-Name": options.name } : {}),
		...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
		...(options.origin ? { Origin: options.origin } : {}),
		...options.headers,
	};
	for (const key of options.omit ?? []) {
		for (const existing of Object.keys(headers)) {
			if (existing.toLowerCase() === key.toLowerCase()) delete headers[existing];
		}
	}
	return new Request(options.url ?? "http://localhost:7180/mcp", {
		method: "POST",
		headers,
		body: options.rawBody ?? requestBody(options),
	});
}

function sentinel(value: string): string {
	const bytes = new TextEncoder().encode(value);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return `=?base64?${btoa(binary)}?=`;
}

interface StreamProbe {
	pulls: number;
	cancelled: boolean;
}

function streamPost(
	body: string,
	headers: Record<string, string>,
	probe: StreamProbe,
): Request {
	const bytes = new TextEncoder().encode(body);
	const chunks: Uint8Array[] = [];
	for (let offset = 0; offset < bytes.length; offset += 4) {
		chunks.push(bytes.slice(offset, offset + 4));
	}
	let index = 0;
	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			probe.pulls += 1;
			if (index < chunks.length) {
				controller.enqueue(chunks[index]);
				index += 1;
			} else {
				controller.close();
			}
		},
		cancel() {
			probe.cancelled = true;
		},
	}, { highWaterMark: 0 });
	return new Request("http://localhost:7180/mcp", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Accept": "application/json, text/event-stream",
			"MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
			"Mcp-Method": "server/discover",
			...headers,
		},
		body: stream,
		duplex: "half",
	} as RequestInit);
}

function rawStreamPost(
	stream: ReadableStream<Uint8Array>,
	headers: Record<string, string> = {},
): Request {
	return new Request("http://localhost:7180/mcp", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Accept": "application/json, text/event-stream",
			"MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
			"Mcp-Method": "server/discover",
			...headers,
		},
		body: stream,
		duplex: "half",
	} as RequestInit);
}

async function createFixture(options: McpHttpOptions = {}): Promise<Fixture> {
	const configRepo = new InMemoryConfigurationRepository();
	const nodeService = new NodeService({
		repository: new InMemoryNodeRepository(),
		storage: new InMemoryStorageProvider(),
		bus: new InMemoryEventBus(),
		configRepo,
	});
	const apiKeysService = new ApiKeysService(configRepo);

	const adminContext: AuthenticationContext = {
		tenant: "default",
		mode: "Direct",
		principal: {
			email: "root@antbox.io",
			groups: [Groups.ADMINS_GROUP_UUID],
		},
	};

	await nodeService.create(adminContext, {
		uuid: "anonymous-folder",
		title: "Anonymous Folder",
		mimetype: Nodes.FOLDER_MIMETYPE,
		parent: Nodes.ROOT_FOLDER_UUID,
		permissions: {
			group: ["Read", "Write", "Export"],
			authenticated: ["Read"],
			anonymous: ["Read"],
			advanced: {},
		},
	});

	await nodeService.createFile(
		adminContext,
		new File(["hello anonymous"], "anonymous.txt", { type: "text/plain" }),
		{
			uuid: "anonymous-file",
			parent: "anonymous-folder",
		},
	);

	const createdApiKey = await apiKeysService.createApiKey(adminContext, {
		title: "mcp token",
		group: "mcp-group",
		description: "MCP test token",
		active: true,
	});

	if (createdApiKey.isLeft()) {
		throw new Error(`Cannot create API key fixture: ${createdApiKey.value.message}`);
	}

	const tenant = {
		name: "default",
		nodeService,
		apiKeysService,
	} as unknown as AntboxTenant;

	return {
		handler: mcpHttpHandler([tenant], {
			allowedOrigins: ["https://app.example"],
			...options,
		}),
		validToken: createdApiKey.value.secret,
	};
}

describe("mcp_http_handler", () => {
	it("accepts a modern discover request without an Origin header", async () => {
		const fixture = await createFixture();

		const response = await fixture.handler(post());

		expect(response.status).toBe(200);
		const payload = await response.json() as {
			result: { supportedVersions: string[]; resultType: string };
		};
		expect(payload.result.supportedVersions).toEqual([MCP_PROTOCOL_VERSION]);
		expect(payload.result.resultType).toBe("complete");
	});

	it("accepts a request from an allowlisted Origin", async () => {
		const fixture = await createFixture();

		const response = await fixture.handler(post({ origin: "https://app.example" }));

		expect(response.status).toBe(200);
	});

	it("checks Origin before tenant and bearer work", async () => {
		const fixture = await createFixture();

		const invalidBearer = await fixture.handler(
			post({ origin: "https://evil.example", token: "invalid-token" }),
		);
		expect(invalidBearer.status).toBe(403);

		const invalidTenant = await fixture.handler(
			post({ origin: "https://evil.example", headers: { "X-Tenant": "unknown" } }),
		);
		expect(invalidTenant.status).toBe(403);
	});

	it("rejects an over-limit declared Content-Length without consuming the body", async () => {
		const fixture = await createFixture({ maxRequestBodyBytes: 64 });
		const probe: StreamProbe = { pulls: 0, cancelled: false };

		const response = await fixture.handler(
			streamPost("{".repeat(300), { "Content-Length": "5000" }, probe),
		);

		expect(response.status).toBe(413);
		expect(probe.pulls).toBe(0);
	});

	it("stops reading and cancels a stream that exceeds the limit without Content-Length", async () => {
		const fixture = await createFixture({ maxRequestBodyBytes: 64 });
		const probe: StreamProbe = { pulls: 0, cancelled: false };

		const response = await fixture.handler(streamPost("{".repeat(400), {}, probe));

		expect(response.status).toBe(413);
		expect(probe.cancelled).toBe(true);
		expect(probe.pulls).toBeLessThan(30);
	});

	it("counts UTF-8 bytes rather than characters for the body limit", async () => {
		const multibyte = `"${"é".repeat(20)}"`; // 22 characters, 42 bytes

		const tight = await createFixture({ maxRequestBodyBytes: 30 });
		expect((await tight.handler(post({ rawBody: multibyte }))).status).toBe(413);

		const generous = await createFixture({ maxRequestBodyBytes: 100 });
		expect((await generous.handler(post({ rawBody: multibyte }))).status).not.toBe(413);
	});

	it("processes a body within the configured byte limit", async () => {
		const fixture = await createFixture({ maxRequestBodyBytes: 4096 });

		const response = await fixture.handler(post());

		expect(response.status).toBe(200);
	});

	it("requires both application/json and text/event-stream in Accept with acceptable quality", async () => {
		const fixture = await createFixture();

		const jsonOnly = await fixture.handler(post({ headers: { Accept: "application/json" } }));
		expect(jsonOnly.status).toBe(400);
		expect((await jsonOnly.json() as { error: { code: number } }).error.code).toBe(-32020);

		const missing = await fixture.handler(post({ omit: ["Accept"] }));
		expect(missing.status).toBe(400);
		expect((await missing.json() as { error: { code: number } }).error.code).toBe(-32020);

		const parameterized = await fixture.handler(
			post({ headers: { Accept: "application/json; charset=utf-8, text/event-stream;q=0.9" } }),
		);
		expect(parameterized.status).toBe(200);

		const weighted = await fixture.handler(
			post({ headers: { Accept: "application/json;q=0.5, text/event-stream;q=0.9" } }),
		);
		expect(weighted.status).toBe(200);

		const jsonZero = await fixture.handler(
			post({ headers: { Accept: "application/json;q=0, text/event-stream" } }),
		);
		expect(jsonZero.status).toBe(400);

		const streamZero = await fixture.handler(
			post({ headers: { Accept: "application/json, text/event-stream;q=0" } }),
		);
		expect(streamZero.status).toBe(400);

		const malformedQuality = await fixture.handler(
			post({ headers: { Accept: "application/json;q=abc, text/event-stream" } }),
		);
		expect(malformedQuality.status).toBe(400);

		const wildcard = await fixture.handler(post({ headers: { Accept: "*/*" } }));
		expect(wildcard.status).toBe(400);

		const lookalike = await fixture.handler(
			post({ headers: { Accept: "application/jsonx, text/event-stream" } }),
		);
		expect(lookalike.status).toBe(400);

		const zeroDigitFraction = await fixture.handler(
			post({ headers: { Accept: "application/json;q=1., text/event-stream" } }),
		);
		expect(zeroDigitFraction.status).toBe(200);

		const zeroValueFraction = await fixture.handler(
			post({ headers: { Accept: "application/json;q=0., text/event-stream" } }),
		);
		expect(zeroValueFraction.status).toBe(400);

		const extraDelimiter = await fixture.handler(
			post({ headers: { Accept: "application/json;q=1=garbage, text/event-stream" } }),
		);
		expect(extraDelimiter.status).toBe(400);

		const spacedEquals = await fixture.handler(
			post({ headers: { Accept: "application/json;q =1, text/event-stream" } }),
		);
		expect(spacedEquals.status).toBe(400);

		const spacedValue = await fixture.handler(
			post({ headers: { Accept: "application/json;q= 1, text/event-stream" } }),
		);
		expect(spacedValue.status).toBe(400);

		const duplicateQuality = await fixture.handler(
			post({ headers: { Accept: "application/json;q=0.5;q=0.9, text/event-stream" } }),
		);
		expect(duplicateQuality.status).toBe(400);

		const zeroPaddedOne = await fixture.handler(
			post({ headers: { Accept: "application/json;q=1.000, text/event-stream" } }),
		);
		expect(zeroPaddedOne.status).toBe(200);

		const tooManyFractionDigits = await fixture.handler(
			post({ headers: { Accept: "application/json;q=0.1234, text/event-stream" } }),
		);
		expect(tooManyFractionDigits.status).toBe(400);
	});

	it("releases the request body lock and keeps 413 when cancellation fails", async () => {
		const fixture = await createFixture({ maxRequestBodyBytes: 16 });
		let sent = false;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (sent) {
					controller.close();
					return;
				}
				sent = true;
				controller.enqueue(new TextEncoder().encode("{".repeat(64)));
			},
			cancel() {
				throw new Error("cancel rejected");
			},
		});
		const request = rawStreamPost(stream);

		const response = await fixture.handler(request);

		expect(response.status).toBe(413);
		expect(request.body?.locked).toBe(false);
	});

	it("releases the request body lock when reading the stream fails", async () => {
		const fixture = await createFixture();
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.error(new Error("stream failed"));
			},
		});
		const request = rawStreamPost(stream);

		const response = await fixture.handler(request);

		expect(response.status).toBe(400);
		expect(request.body?.locked).toBe(false);
	});

	it("releases the request body lock after a successful bounded read", async () => {
		const fixture = await createFixture();
		const probe: StreamProbe = { pulls: 0, cancelled: false };
		const request = streamPost(requestBody({}), {}, probe);

		const response = await fixture.handler(request);

		expect(response.status).toBe(200);
		expect(request.body?.locked).toBe(false);
	});

	it("requires a supported MCP-Protocol-Version header", async () => {
		const fixture = await createFixture();

		const missing = await fixture.handler(post({ omit: ["MCP-Protocol-Version"] }));
		expect(missing.status).toBe(400);
		expect((await missing.json() as { error: { code: number } }).error.code).toBe(-32020);

		const unsupported = await fixture.handler(
			post({
				headers: { "MCP-Protocol-Version": "2025-11-25" },
				metaOverride: {
					[PROTOCOL_META_KEY]: "2025-11-25",
					[CAPABILITIES_META_KEY]: {},
				},
			}),
		);
		expect(unsupported.status).toBe(400);
		const unsupportedPayload = await unsupported.json() as {
			error: { code: number; data: { supported: string[]; requested: string } };
		};
		expect(unsupportedPayload.error.code).toBe(-32022);
		expect(unsupportedPayload.error.data).toEqual({
			supported: [MCP_PROTOCOL_VERSION],
			requested: "2025-11-25",
		});
	});

	it("rejects a MCP-Protocol-Version header that differs from the body", async () => {
		const fixture = await createFixture();

		const response = await fixture.handler(
			post({ headers: { "MCP-Protocol-Version": "2026-07-27" } }),
		);

		expect(response.status).toBe(400);
		expect((await response.json() as { error: { code: number } }).error.code).toBe(-32020);
	});

	it("requires an Mcp-Method header matching the body method", async () => {
		const fixture = await createFixture();

		const missing = await fixture.handler(post({ omit: ["Mcp-Method"] }));
		expect(missing.status).toBe(400);
		expect((await missing.json() as { error: { code: number } }).error.code).toBe(-32020);

		const mismatch = await fixture.handler(
			post({ method: "server/discover", headers: { "Mcp-Method": "tools/list" } }),
		);
		expect(mismatch.status).toBe(400);
		expect((await mismatch.json() as { error: { code: number } }).error.code).toBe(-32020);

		const wrongCase = await fixture.handler(
			post({ method: "server/discover", headers: { "Mcp-Method": "Server/Discover" } }),
		);
		expect(wrongCase.status).toBe(400);
	});

	it("requires Mcp-Name for tools/call and resources/read and matches it to the body", async () => {
		const fixture = await createFixture();

		const missingTool = await fixture.handler(
			post({
				method: "tools/call",
				params: { name: "nodes.list", arguments: {} },
				token: fixture.validToken,
			}),
		);
		expect(missingTool.status).toBe(400);
		expect((await missingTool.json() as { error: { code: number } }).error.code).toBe(-32020);

		const mismatchedUri = await fixture.handler(
			post({
				method: "resources/read",
				params: { uri: "antbox://nodes/anonymous-file" },
				name: "antbox://nodes/other-file",
			}),
		);
		expect(mismatchedUri.status).toBe(400);
		expect((await mismatchedUri.json() as { error: { code: number } }).error.code).toBe(-32020);

		const validRead = await fixture.handler(
			post({
				method: "resources/read",
				params: { uri: "antbox://nodes/anonymous-file" },
				name: "antbox://nodes/anonymous-file",
			}),
		);
		expect(validRead.status).toBe(200);
	});

	it("decodes only strict canonical Base64 sentinel Mcp-Name values", async () => {
		const fixture = await createFixture();

		const validAscii = await fixture.handler(
			post({
				method: "tools/call",
				params: { name: "nodes.get", arguments: { uuid: "anonymous-file" } },
				name: sentinel("nodes.get"),
				token: fixture.validToken,
			}),
		);
		expect(validAscii.status).toBe(200);

		const nonAsciiName = "nós.get";
		const validNonAscii = await fixture.handler(
			post({
				method: "tools/call",
				params: { name: nonAsciiName, arguments: {} },
				name: sentinel(nonAsciiName),
				token: fixture.validToken,
			}),
		);
		expect(validNonAscii.status).toBe(200);
		expect((await validNonAscii.json() as { error: { code: number } }).error.code).toBe(-32602);

		const sentinelName = "=?base64?literal?=";
		const encodedSentinelValue = await fixture.handler(
			post({
				method: "tools/call",
				params: { name: sentinelName, arguments: {} },
				name: sentinel(sentinelName),
				token: fixture.validToken,
			}),
		);
		expect(encodedSentinelValue.status).toBe(200);

		const rejectsHeader = async (name: string) => {
			const response = await fixture.handler(
				post({
					method: "tools/call",
					params: { name: "nodes.get", arguments: { uuid: "anonymous-file" } },
					name,
					token: fixture.validToken,
				}),
			);
			expect(response.status).toBe(400);
			expect((await response.json() as { error: { code: number } }).error.code).toBe(-32020);
		};

		await rejectsHeader("=?base64?!!!not-base64!!!?=");
		await rejectsHeader("=?base64?bm9kZXMu Z2V0?=");
		await rejectsHeader("=?base64?bm9kZXMubGlzdA=?=");
		await rejectsHeader("=?base64?bm9kZXMubGlzdA===?=");
		await rejectsHeader("=?base64?literal?=");
		await rejectsHeader("=?BASE64?bm9kZXMuZ2V0?=");

		const canonical = sentinel("nodes.ge").replace(/^=\?base64\?/, "").replace(/\?=$/, "");
		const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
		const dataIndex = canonical.length - 2;
		const shifted = alphabet[(alphabet.indexOf(canonical[dataIndex]) + 1) % 64];
		const nonCanonical = canonical.slice(0, dataIndex) + shifted + canonical.slice(dataIndex + 1);
		await rejectsHeader(`=?base64?${nonCanonical}?=`);
	});

	it("preserves the request id on pre-dispatch errors", async () => {
		const fixture = await createFixture();

		const methodMismatch = await fixture.handler(
			post({ id: 7, method: "server/discover", headers: { "Mcp-Method": "tools/list" } }),
		);
		expect((await methodMismatch.json() as { id: unknown }).id).toBe(7);

		const unsupportedVersion = await fixture.handler(
			post({
				id: "req-abc",
				headers: { "MCP-Protocol-Version": "2025-11-25" },
				metaOverride: {
					[PROTOCOL_META_KEY]: "2025-11-25",
					[CAPABILITIES_META_KEY]: {},
				},
			}),
		);
		expect((await unsupportedVersion.json() as { id: unknown }).id).toBe("req-abc");

		const missingMetadata = await fixture.handler(post({ id: 9, metaOverride: {} }));
		expect((await missingMetadata.json() as { id: unknown }).id).toBe(9);

		const missingName = await fixture.handler(
			post({
				id: 11,
				method: "resources/read",
				params: { uri: "antbox://nodes/anonymous-file" },
			}),
		);
		expect((await missingName.json() as { id: unknown }).id).toBe(11);
	});

	it("returns HTTP 400 with -32602 for invalid optional MCP metadata", async () => {
		const fixture = await createFixture();
		const baseMeta = { [PROTOCOL_META_KEY]: MCP_PROTOCOL_VERSION, [CAPABILITIES_META_KEY]: {} };

		const invalidLogLevel = await fixture.handler(
			post({
				id: "meta-loglevel",
				metaOverride: { ...baseMeta, "io.modelcontextprotocol/logLevel": "verbose" },
			}),
		);
		expect(invalidLogLevel.status).toBe(400);
		const logLevelPayload = await invalidLogLevel.json() as {
			id: unknown;
			error: { code: number };
		};
		expect(logLevelPayload.error.code).toBe(-32602);
		expect(logLevelPayload.id).toBe("meta-loglevel");

		const clientInfoWithoutVersion = await fixture.handler(
			post({
				id: 31,
				metaOverride: {
					...baseMeta,
					"io.modelcontextprotocol/clientInfo": { name: "client-without-version" },
				},
			}),
		);
		expect(clientInfoWithoutVersion.status).toBe(400);
		const clientInfoPayload = await clientInfoWithoutVersion.json() as {
			id: unknown;
			error: { code: number };
		};
		expect(clientInfoPayload.error.code).toBe(-32602);
		expect(clientInfoPayload.id).toBe(31);

		const malformedTraceparent = await fixture.handler(
			post({ id: 32, metaOverride: { ...baseMeta, traceparent: "not-a-w3c-traceparent" } }),
		);
		expect(malformedTraceparent.status).toBe(400);
		expect((await malformedTraceparent.json() as { error: { code: number } }).error.code).toBe(
			-32602,
		);
	});

	it("keeps HTTP 200 for ordinary tool and resource INVALID_PARAMS", async () => {
		const fixture = await createFixture();

		const unknownTool = await fixture.handler(
			post({
				id: 41,
				method: "tools/call",
				params: { name: "missing.tool", arguments: {} },
				name: "missing.tool",
				token: fixture.validToken,
			}),
		);
		expect(unknownTool.status).toBe(200);
		const unknownToolPayload = await unknownTool.json() as {
			id: unknown;
			error: { code: number };
		};
		expect(unknownToolPayload.error.code).toBe(-32602);
		expect(unknownToolPayload.id).toBe(41);

		const unsupportedUri = await fixture.handler(
			post({
				id: 42,
				method: "resources/read",
				params: { uri: "antbox://unknown/thing" },
				name: "antbox://unknown/thing",
			}),
		);
		expect(unsupportedUri.status).toBe(200);
		expect((await unsupportedUri.json() as { error: { code: number } }).error.code).toBe(-32602);

		const missingResource = await fixture.handler(
			post({
				id: 43,
				method: "resources/read",
				params: { uri: "antbox://nodes/does-not-exist" },
				name: "antbox://nodes/does-not-exist",
			}),
		);
		expect(missingResource.status).toBe(200);
		expect((await missingResource.json() as { error: { code: number } }).error.code).toBe(-32602);

		const invalidToolArguments = await fixture.handler(
			post({
				id: 44,
				method: "tools/call",
				params: { name: "nodes.get", arguments: {} },
				name: "nodes.get",
				token: fixture.validToken,
			}),
		);
		expect(invalidToolArguments.status).toBe(200);
		const invalidArgsPayload = await invalidToolArguments.json() as {
			result: { isError?: boolean };
		};
		expect(invalidArgsPayload.result.isError).toBe(true);
	});

	it("rejects JSON-RPC response envelopes sent by clients", async () => {
		const fixture = await createFixture();

		const response = await fixture.handler(
			post({ rawBody: JSON.stringify({ jsonrpc: "2.0", id: 12, result: { ok: true } }) }),
		);

		expect(response.status).toBe(400);
		expect((await response.json() as { error: { code: number } }).error.code).toBe(-32600);
	});

	it("returns 404 for unknown and legacy methods", async () => {
		const fixture = await createFixture();

		const unknown = await fixture.handler(post({ method: "foo/bar" }));
		expect(unknown.status).toBe(404);
		expect((await unknown.json() as { error: { code: number } }).error.code).toBe(-32601);

		const legacy = await fixture.handler(
			post({ method: "initialize", params: { protocolVersion: MCP_PROTOCOL_VERSION } }),
		);
		expect(legacy.status).toBe(404);
		expect((await legacy.json() as { error: { code: number } }).error.code).toBe(-32601);
	});

	it("does not accept notifications with a 202", async () => {
		const fixture = await createFixture();

		const response = await fixture.handler(
			post({ id: null, method: "notifications/initialized", token: fixture.validToken }),
		);

		expect(response.status).toBe(404);
		expect((await response.json() as { error: { code: number } }).error.code).toBe(-32601);
	});

	it("rejects unsupported query auth", async () => {
		const fixture = await createFixture();

		const response = await fixture.handler(
			post({ token: fixture.validToken, url: "http://localhost:7180/mcp?api_key=abc" }),
		);

		expect(response.status).toBe(401);
	});

	it("rejects an invalid Bearer API key", async () => {
		const fixture = await createFixture();

		const response = await fixture.handler(post({ token: "invalid-token" }));

		expect(response.status).toBe(401);
	});

	it("preserves tenant selection by header and query", async () => {
		const fixture = await createFixture();

		const byHeader = await fixture.handler(
			post({
				method: "tools/list",
				token: fixture.validToken,
				headers: { "X-Tenant": "default" },
			}),
		);
		expect(byHeader.status).toBe(200);

		const byQuery = await fixture.handler(
			post({
				method: "tools/list",
				token: fixture.validToken,
				url: "http://localhost:7180/mcp?x-tenant=default",
			}),
		);
		expect(byQuery.status).toBe(200);

		const unknown = await fixture.handler(
			post({ token: fixture.validToken, headers: { "X-Tenant": "unknown" } }),
		);
		expect(unknown.status).toBe(400);
	});

	it("keeps anonymous resource access and hides tools", async () => {
		const fixture = await createFixture();

		const resources = await fixture.handler(post({ method: "resources/list" }));
		expect(resources.status).toBe(200);

		const tools = await fixture.handler(post({ method: "tools/list" }));
		expect(tools.status).toBe(404);
		expect((await tools.json() as { error: { code: number } }).error.code).toBe(-32601);

		const toolsCall = await fixture.handler(
			post({
				method: "tools/call",
				params: { name: "nodes.list", arguments: {} },
				name: "nodes.list",
			}),
		);
		expect(toolsCall.status).toBe(404);
		expect((await toolsCall.json() as { error: { code: number } }).error.code).toBe(-32601);

		const authenticatedTools = await fixture.handler(
			post({ method: "tools/list", token: fixture.validToken }),
		);
		expect(authenticatedTools.status).toBe(200);
		const toolsPayload = await authenticatedTools.json() as { result: { tools: unknown[] } };
		expect(toolsPayload.result.tools.length).toBeGreaterThan(0);
	});
});
