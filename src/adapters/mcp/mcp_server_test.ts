import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { NodeService } from "application/nodes/node_service.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { APP_NAME, APP_VERSION } from "shared/app_metadata.ts";
import { MCP_PROTOCOL_VERSION, type McpRequestContext, processMcpRequest } from "./mcp_server.ts";

const PROTOCOL_META_KEY = "io.modelcontextprotocol/protocolVersion";
const CAPABILITIES_META_KEY = "io.modelcontextprotocol/clientCapabilities";
const SERVER_INFO_META_KEY = "io.modelcontextprotocol/serverInfo";

function modernParams(extra: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		_meta: {
			[PROTOCOL_META_KEY]: MCP_PROTOCOL_VERSION,
			[CAPABILITIES_META_KEY]: {},
		},
		...extra,
	};
}

function modernRequest(
	id: number,
	method: string,
	params: Record<string, unknown> = {},
): Record<string, unknown> {
	return { jsonrpc: "2.0", id, method, params: modernParams(params) };
}

interface ResultEnvelope {
	resultType?: string;
	ttlMs?: number;
	cacheScope?: string;
	_meta?: Record<string, { name?: string; version?: string }>;
	[key: string]: unknown;
}

async function createFixture() {
	const nodeService = new NodeService({
		repository: new InMemoryNodeRepository(),
		storage: new InMemoryStorageProvider(),
		bus: new InMemoryEventBus(),
		configRepo: new InMemoryConfigurationRepository(),
	});

	const adminAuthContext: AuthenticationContext = {
		tenant: "default",
		mode: "Direct",
		principal: {
			email: "root@antbox.io",
			groups: [Groups.ADMINS_GROUP_UUID],
		},
	};

	await nodeService.create(adminAuthContext, {
		uuid: "public-folder",
		title: "Public Folder",
		mimetype: Nodes.FOLDER_MIMETYPE,
		parent: Nodes.ROOT_FOLDER_UUID,
		permissions: {
			group: ["Read", "Write", "Export"],
			authenticated: ["Read"],
			anonymous: [],
			advanced: {},
		},
	});

	await nodeService.createFile(
		adminAuthContext,
		new File(["hello from mcp"], "public.txt", { type: "text/plain" }),
		{
			uuid: "public-file",
			parent: "public-folder",
		},
	);

	await nodeService.create(adminAuthContext, {
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
		adminAuthContext,
		new File(["hello anonymous"], "anonymous.txt", { type: "text/plain" }),
		{
			uuid: "anonymous-file",
			parent: "anonymous-folder",
		},
	);

	await nodeService.create(adminAuthContext, {
		uuid: "restricted-folder",
		title: "Restricted Folder",
		mimetype: Nodes.FOLDER_MIMETYPE,
		parent: Nodes.ROOT_FOLDER_UUID,
		permissions: {
			group: ["Read", "Write", "Export"],
			authenticated: [],
			anonymous: [],
			advanced: {},
		},
		group: Groups.ADMINS_GROUP_UUID,
	});

	await nodeService.createFile(
		adminAuthContext,
		new File(["top secret"], "secret.txt", { type: "text/plain" }),
		{
			uuid: "restricted-file",
			parent: "restricted-folder",
			group: Groups.ADMINS_GROUP_UUID,
		},
	);

	const memberAuthContext: AuthenticationContext = {
		tenant: "default",
		mode: "Direct",
		principal: {
			email: "user@example.com",
			groups: ["group1"],
		},
	};

	const outsiderAuthContext: AuthenticationContext = {
		tenant: "default",
		mode: "Direct",
		principal: {
			email: "outsider@example.com",
			groups: ["group2"],
		},
	};

	const anonymousAuthContext: AuthenticationContext = {
		tenant: "default",
		mode: "Direct",
		principal: {
			email: "anonymous@antbox.io",
			groups: [],
		},
	};

	const base = {
		tenant: "default",
		nodeService,
	};

	return {
		memberContext: {
			...base,
			authContext: memberAuthContext,
			toolsEnabled: true,
		} satisfies McpRequestContext,
		outsiderContext: {
			...base,
			authContext: outsiderAuthContext,
			toolsEnabled: true,
		} satisfies McpRequestContext,
		anonymousContext: {
			...base,
			authContext: anonymousAuthContext,
			toolsEnabled: false,
		} satisfies McpRequestContext,
	};
}

describe("mcp_server", () => {
	it("supports only the 2026-07-28 protocol version", () => {
		expect(MCP_PROTOCOL_VERSION).toBe("2026-07-28");
	});

	it("discovers the modern contract with private zero-ttl cache hints", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			modernRequest(1, "server/discover"),
			fixture.memberContext,
		);

		expect(response?.error).toBeUndefined();
		const result = response?.result as ResultEnvelope & {
			supportedVersions: string[];
			capabilities: { tools?: unknown; resources: unknown };
			instructions: string;
		};

		expect(result.supportedVersions).toEqual(["2026-07-28"]);
		expect(result.capabilities.resources).toBeDefined();
		expect(result.capabilities.tools).toBeDefined();
		expect(typeof result.instructions).toBe("string");
		expect(result.resultType).toBe("complete");
		expect(result.ttlMs).toBe(0);
		expect(result.cacheScope).toBe("private");
		expect(result._meta?.[SERVER_INFO_META_KEY]).toEqual({
			name: APP_NAME,
			version: APP_VERSION,
		});
	});

	it("omits tools capability during anonymous discover", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			modernRequest(10, "server/discover"),
			fixture.anonymousContext,
		);

		expect(response?.error).toBeUndefined();
		const result = response?.result as {
			capabilities: { tools?: unknown; resources: unknown };
		};
		expect(result.capabilities.resources).toBeDefined();
		expect(result.capabilities.tools).toBeUndefined();
	});

	it("requires modern request metadata on every request", async () => {
		const fixture = await createFixture();

		const missingMetadata = await processMcpRequest(
			{ jsonrpc: "2.0", id: 20, method: "server/discover" },
			fixture.memberContext,
		);
		expect(missingMetadata?.error?.code).toBe(-32602);
		expect(missingMetadata?.result).toBeUndefined();

		const missingCapabilities = await processMcpRequest(
			{
				jsonrpc: "2.0",
				id: 21,
				method: "tools/list",
				params: { _meta: { [PROTOCOL_META_KEY]: MCP_PROTOCOL_VERSION } },
			},
			fixture.memberContext,
		);
		expect(missingCapabilities?.error?.code).toBe(-32602);
	});

	it("accepts optional clientInfo and trace metadata without trusting identity", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			{
				jsonrpc: "2.0",
				id: 22,
				method: "server/discover",
				params: {
					_meta: {
						[PROTOCOL_META_KEY]: MCP_PROTOCOL_VERSION,
						[CAPABILITIES_META_KEY]: {},
						"io.modelcontextprotocol/clientInfo": {
							name: "root@antbox.io",
							version: "1.0.0",
						},
						"io.modelcontextprotocol/logLevel": "debug",
						traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
						"com.example/vendor": { anything: [1, 2, 3] },
					},
				},
			},
			fixture.anonymousContext,
		);

		expect(response?.error).toBeUndefined();
		const result = response?.result as { capabilities: { tools?: unknown } };
		expect(result.capabilities.tools).toBeUndefined();
	});

	it("rejects malformed known optional metadata but keeps vendor metadata passthrough", async () => {
		const fixture = await createFixture();

		const withMeta = (meta: Record<string, unknown>, id: number) =>
			processMcpRequest(
				{
					jsonrpc: "2.0",
					id,
					method: "server/discover",
					params: {
						_meta: {
							[PROTOCOL_META_KEY]: MCP_PROTOCOL_VERSION,
							[CAPABILITIES_META_KEY]: {},
							...meta,
						},
					},
				},
				fixture.memberContext,
			);

		const malformedClientInfo = await withMeta({
			"io.modelcontextprotocol/clientInfo": { name: "client-without-version" },
		}, 24);
		expect(malformedClientInfo?.error?.code).toBe(-32602);

		const numericTraceparent = await withMeta({ traceparent: 42 }, 26);
		expect(numericTraceparent?.error?.code).toBe(-32602);

		const malformedTraceparentFormat = await withMeta(
			{ traceparent: "not-a-w3c-traceparent" },
			27,
		);
		expect(malformedTraceparentFormat?.error?.code).toBe(-32602);

		const vendorMetadata = await withMeta(
			{ "com.example/vendor": { anything: [1, 2, 3] } },
			28,
		);
		expect(vendorMetadata?.error).toBeUndefined();
	});

	it("accepts every official LoggingLevel and rejects out-of-enum values", async () => {
		const fixture = await createFixture();
		const officialLevels = [
			"debug",
			"info",
			"notice",
			"warning",
			"error",
			"critical",
			"alert",
			"emergency",
		];

		for (const [index, level] of officialLevels.entries()) {
			const response = await processMcpRequest(
				{
					jsonrpc: "2.0",
					id: 100 + index,
					method: "server/discover",
					params: {
						_meta: {
							[PROTOCOL_META_KEY]: MCP_PROTOCOL_VERSION,
							[CAPABILITIES_META_KEY]: {},
							"io.modelcontextprotocol/logLevel": level,
						},
					},
				},
				fixture.memberContext,
			);
			expect(response?.error).toBeUndefined();
		}

		const outOfEnum = await processMcpRequest(
			{
				jsonrpc: "2.0",
				id: 120,
				method: "server/discover",
				params: {
					_meta: {
						[PROTOCOL_META_KEY]: MCP_PROTOCOL_VERSION,
						[CAPABILITIES_META_KEY]: {},
						"io.modelcontextprotocol/logLevel": "verbose",
					},
				},
			},
			fixture.memberContext,
		);
		expect(outOfEnum?.error?.code).toBe(-32602);
	});

	it("rejects unsupported protocol versions with the supported list", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			{
				jsonrpc: "2.0",
				id: 23,
				method: "server/discover",
				params: {
					_meta: {
						[PROTOCOL_META_KEY]: "2025-11-25",
						[CAPABILITIES_META_KEY]: {},
					},
				},
			},
			fixture.memberContext,
		);

		expect(response?.error?.code).toBe(-32022);
		expect(response?.error?.data).toEqual({
			supported: ["2026-07-28"],
			requested: "2025-11-25",
		});
	});

	it("does not support initialize, ping or initialized notifications", async () => {
		const fixture = await createFixture();

		const initializeResponse = await processMcpRequest(
			modernRequest(30, "initialize", { protocolVersion: MCP_PROTOCOL_VERSION }),
			fixture.memberContext,
		);
		expect(initializeResponse?.error?.code).toBe(-32601);

		const pingResponse = await processMcpRequest(
			modernRequest(31, "ping"),
			fixture.memberContext,
		);
		expect(pingResponse?.error?.code).toBe(-32601);

		const initializedAsNotification = await processMcpRequest(
			{
				jsonrpc: "2.0",
				method: "notifications/initialized",
				params: modernParams(),
			},
			fixture.memberContext,
		);
		expect(initializedAsNotification?.error?.code).toBe(-32601);
		expect(initializedAsNotification?.result).toBeUndefined();

		const initializedWithoutMetadata = await processMcpRequest(
			{ jsonrpc: "2.0", method: "notifications/initialized" },
			fixture.memberContext,
		);
		expect(initializedWithoutMetadata?.error?.code).toBe(-32602);

		const unknownNotification = await processMcpRequest(
			{
				jsonrpc: "2.0",
				method: "notifications/unknown",
				params: modernParams(),
			},
			fixture.memberContext,
		);
		expect(unknownNotification?.error?.code).toBe(-32601);
	});

	it("lists available MCP tools deterministically with private cache hints", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			modernRequest(2, "tools/list"),
			fixture.memberContext,
		);

		expect(response?.error).toBeUndefined();

		const result = response?.result as ResultEnvelope & {
			tools: Array<{
				name: string;
				inputSchema: {
					properties?: {
						filters?: {
							anyOf?: Array<Record<string, unknown>>;
						};
					};
				};
			}>;
		};

		const names = result.tools.map((tool) => tool.name);
		expect(names).toEqual([
			"nodes.get",
			"nodes.find",
			"nodes.list",
		]);
		expect(result.resultType).toBe("complete");
		expect(result.ttlMs).toBe(300000);
		expect(result.cacheScope).toBe("private");
		expect(result._meta?.[SERVER_INFO_META_KEY]).toEqual({
			name: APP_NAME,
			version: APP_VERSION,
		});

		const nodesFindTool = result.tools.find((tool) => tool.name === "nodes.find");
		const filtersAnyOf = nodesFindTool?.inputSchema.properties?.filters?.anyOf;
		expect(filtersAnyOf?.length).toBe(2);
	});

	it("executes nodes.find tool", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			modernRequest(3, "tools/call", {
				name: "nodes.find",
				arguments: {
					filters: [["parent", "==", "public-folder"]],
					pageSize: 10,
					pageToken: 1,
				},
			}),
			fixture.memberContext,
		);

		expect(response?.error).toBeUndefined();

		const toolResult = response?.result as ResultEnvelope & {
			isError?: boolean;
			structuredContent?: { nodes: Array<{ uuid: string }> };
		};

		expect(toolResult.isError).toBeUndefined();
		expect(toolResult.structuredContent?.nodes).toHaveLength(1);
		expect(toolResult.structuredContent?.nodes[0].uuid).toBe("public-file");
		expect(toolResult.resultType).toBe("complete");
		expect(toolResult._meta?.[SERVER_INFO_META_KEY]).toEqual({
			name: APP_NAME,
			version: APP_VERSION,
		});
	});

	it("executes nodes.list tool", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			modernRequest(31, "tools/call", {
				name: "nodes.list",
				arguments: {
					parent: "public-folder",
				},
			}),
			fixture.memberContext,
		);

		expect(response?.error).toBeUndefined();

		const toolResult = response?.result as {
			isError?: boolean;
			structuredContent?: { nodes: Array<{ uuid: string }> };
		};

		expect(toolResult.isError).toBeUndefined();
		expect(toolResult.structuredContent?.nodes).toHaveLength(1);
		expect(toolResult.structuredContent?.nodes[0].uuid).toBe("public-file");
	});

	it("keeps known-tool business failures as isError results", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			modernRequest(33, "tools/call", {
				name: "nodes.get",
				arguments: { uuid: "missing-node" },
			}),
			fixture.memberContext,
		);

		expect(response?.error).toBeUndefined();
		const toolResult = response?.result as ResultEnvelope & { isError?: boolean };
		expect(toolResult.isError).toBe(true);
		expect(toolResult.resultType).toBe("complete");
	});

	it("returns -32602 for unknown tool names", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			modernRequest(34, "tools/call", { name: "nodes.nope", arguments: {} }),
			fixture.memberContext,
		);

		expect(response?.error?.code).toBe(-32602);
		expect(response?.result).toBeUndefined();
	});

	it("rejects tools/list anonymously", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			modernRequest(11, "tools/list"),
			fixture.anonymousContext,
		);

		expect(response?.error?.code).toBe(-32601);
		expect(response?.error?.message).toBe("Method not found: tools/list");
	});

	it("rejects tools/call anonymously", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			modernRequest(12, "tools/call", {
				name: "nodes.list",
				arguments: {
					parent: "anonymous-folder",
				},
			}),
			fixture.anonymousContext,
		);

		expect(response?.error?.code).toBe(-32601);
		expect(response?.error?.message).toBe("Method not found: tools/call");
	});

	it("lists curated documentation resources only with private cache hints", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			modernRequest(40, "resources/list"),
			fixture.memberContext,
		);

		expect(response?.error).toBeUndefined();

		const result = response?.result as ResultEnvelope & {
			resources: Array<{ name: string }>;
		};
		const names = result.resources.map((resource) => resource.name).sort();

		expect(names).toEqual([
			"llms",
			"node-querying",
			"nodes-and-aspects",
			"overview",
			"webdav",
		]);
		expect(result.resultType).toBe("complete");
		expect(result.ttlMs).toBe(300000);
		expect(result.cacheScope).toBe("private");

		const repeat = await processMcpRequest(
			modernRequest(41, "resources/list"),
			fixture.memberContext,
		);
		expect((repeat?.result as { resources: unknown }).resources).toEqual(result.resources);
	});

	it("lists resource templates with private cache hints", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			modernRequest(42, "resources/templates/list"),
			fixture.memberContext,
		);

		expect(response?.error).toBeUndefined();
		const result = response?.result as ResultEnvelope & {
			resourceTemplates: Array<{ uriTemplate: string }>;
		};
		expect(result.resourceTemplates).toHaveLength(1);
		expect(result.resultType).toBe("complete");
		expect(result.ttlMs).toBe(300000);
		expect(result.cacheScope).toBe("private");
	});

	it("reads documentation resources with public cache hints", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			modernRequest(43, "resources/read", { uri: "antbox://docs/overview" }),
			fixture.memberContext,
		);

		expect(response?.error).toBeUndefined();
		const result = response?.result as ResultEnvelope & {
			contents: Array<{ text: string }>;
		};
		expect(result.contents).toHaveLength(1);
		expect(result.resultType).toBe("complete");
		expect(result.ttlMs).toBe(300000);
		expect(result.cacheScope).toBe("public");
	});

	it("reads anonymous node resource with private cache hints", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			modernRequest(44, "resources/read", { uri: "antbox://nodes/anonymous-file" }),
			fixture.anonymousContext,
		);

		expect(response?.error).toBeUndefined();
		const result = response?.result as ResultEnvelope & {
			contents: Array<{ text: string }>;
		};
		expect(result.contents).toHaveLength(1);
		expect(result.contents[0].text).toContain("anonymous-file");
		expect(result.resultType).toBe("complete");
		expect(result.ttlMs).toBe(0);
		expect(result.cacheScope).toBe("private");
	});

	it("reads node resources for authenticated clients", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			modernRequest(4, "resources/read", { uri: "antbox://nodes/anonymous-file" }),
			fixture.memberContext,
		);

		expect(response?.error).toBeUndefined();

		const contents = (response?.result as {
			contents: Array<{ text: string }>;
		}).contents;

		expect(contents).toHaveLength(1);
		expect(contents[0].text).toContain("anonymous-file");
	});

	it("uses -32602 for missing resources", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			modernRequest(45, "resources/read", { uri: "antbox://docs/getting-started" }),
			fixture.memberContext,
		);

		expect(response?.error?.code).toBe(-32602);
	});

	it("never exposes public cache scope for protected node reads", async () => {
		const fixture = await createFixture();

		// public-file is authenticated-only, so an anonymous read must be denied without leaking content.
		const anonymousRead = await processMcpRequest(
			modernRequest(5, "resources/read", { uri: "antbox://nodes/public-file" }),
			fixture.anonymousContext,
		);
		expect(anonymousRead?.error?.code).toBe(-32602);
		expect(anonymousRead?.result).toBeUndefined();

		const authorizedRead = await processMcpRequest(
			modernRequest(6, "resources/read", { uri: "antbox://nodes/public-file" }),
			fixture.memberContext,
		);
		expect(authorizedRead?.error).toBeUndefined();
		const authorizedResult = authorizedRead?.result as ResultEnvelope & {
			contents: Array<{ text: string }>;
		};
		expect(authorizedResult.contents[0].text).toContain("public-file");
		expect(authorizedResult.cacheScope).toBe("private");
		expect(authorizedResult.ttlMs).toBe(0);

		const outsiderRestricted = await processMcpRequest(
			modernRequest(7, "resources/read", { uri: "antbox://nodes/restricted-file" }),
			fixture.outsiderContext,
		);
		expect(outsiderRestricted?.error?.code).toBe(-32602);
		expect(outsiderRestricted?.result).toBeUndefined();
	});
});
