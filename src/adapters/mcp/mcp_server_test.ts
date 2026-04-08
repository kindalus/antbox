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
	it("initializes with protocol version and capabilities", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			{
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: { protocolVersion: MCP_PROTOCOL_VERSION },
			},
			fixture.memberContext,
		);

		expect(response?.error).toBeUndefined();
		const result = response?.result as {
			protocolVersion: string;
			serverInfo: { name: string; version: string };
		};
		expect(result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
		expect(result.serverInfo.name).toBe(APP_NAME);
		expect(result.serverInfo.version).toBe(APP_VERSION);
	});

	it("omits tools capability during anonymous initialize", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			{
				jsonrpc: "2.0",
				id: 10,
				method: "initialize",
				params: { protocolVersion: MCP_PROTOCOL_VERSION },
			},
			fixture.anonymousContext,
		);

		expect(response?.error).toBeUndefined();
		const result = response?.result as {
			capabilities: { tools?: unknown; resources: unknown };
		};
		expect(result.capabilities.resources).toBeDefined();
		expect(result.capabilities.tools).toBeUndefined();
	});

	it("lists available MCP tools", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			{
				jsonrpc: "2.0",
				id: 2,
				method: "tools/list",
			},
			fixture.memberContext,
		);

		expect(response?.error).toBeUndefined();

		const tools = (response?.result as {
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
		}).tools;
		const names = tools.map((t) => t.name).sort();

		expect(names).toEqual([
			"nodes.find",
			"nodes.get",
			"nodes.list",
		]);

		const nodesFindTool = tools.find((tool) => tool.name === "nodes.find");
		expect(nodesFindTool).toBeDefined();

		const filtersAnyOf = nodesFindTool?.inputSchema.properties?.filters?.anyOf;
		expect(filtersAnyOf?.length).toBe(2);

		const arraySchema = filtersAnyOf?.[1] as { items?: unknown } | undefined;
		expect(arraySchema?.items !== undefined).toBe(true);
	});

	it("executes nodes.find tool", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			{
				jsonrpc: "2.0",
				id: 3,
				method: "tools/call",
				params: {
					name: "nodes.find",
					arguments: {
						filters: [["parent", "==", "public-folder"]],
						pageSize: 10,
						pageToken: 1,
					},
				},
			},
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

	it("executes nodes.list tool", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			{
				jsonrpc: "2.0",
				id: 31,
				method: "tools/call",
				params: {
					name: "nodes.list",
					arguments: {
						parent: "public-folder",
					},
				},
			},
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

	it("rejects tools/list anonymously", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			{
				jsonrpc: "2.0",
				id: 11,
				method: "tools/list",
			},
			fixture.anonymousContext,
		);

		expect(response?.error?.code).toBe(-32601);
		expect(response?.error?.message).toBe("Method not found: tools/list");
	});

	it("rejects tools/call anonymously", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			{
				jsonrpc: "2.0",
				id: 12,
				method: "tools/call",
				params: {
					name: "nodes.list",
					arguments: {
						parent: "anonymous-folder",
					},
				},
			},
			fixture.anonymousContext,
		);

		expect(response?.error?.code).toBe(-32601);
		expect(response?.error?.message).toBe("Method not found: tools/call");
	});

	it("lists curated documentation resources only", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			{
				jsonrpc: "2.0",
				id: 40,
				method: "resources/list",
			},
			fixture.memberContext,
		);

		expect(response?.error).toBeUndefined();

		const resources = (response?.result as {
			resources: Array<{ name: string }>;
		}).resources;
		const names = resources.map((resource) => resource.name).sort();

		expect(names).toEqual([
			"llms",
			"node-querying",
			"nodes-and-aspects",
			"overview",
			"webdav",
		]);
	});

	it("reads anonymous node resource when permissions allow it", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			{
				jsonrpc: "2.0",
				id: 42,
				method: "resources/read",
				params: { uri: "antbox://nodes/anonymous-file" },
			},
			fixture.anonymousContext,
		);

		expect(response?.error).toBeUndefined();
		const contents = (response?.result as {
			contents: Array<{ text: string }>;
		}).contents;
		expect(contents).toHaveLength(1);
		expect(contents[0].text).toContain("anonymous-file");
	});

	it("reads node resources for authenticated clients", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			{
				jsonrpc: "2.0",
				id: 4,
				method: "resources/read",
				params: { uri: "antbox://nodes/anonymous-file" },
			},
			fixture.memberContext,
		);

		expect(response?.error).toBeUndefined();

		const contents = (response?.result as {
			contents: Array<{ text: string }>;
		}).contents;

		expect(contents).toHaveLength(1);
		expect(contents[0].text).toContain("anonymous-file");
	});

	it("rejects non-allowlisted documentation resource", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			{
				jsonrpc: "2.0",
				id: 41,
				method: "resources/read",
				params: { uri: "antbox://docs/getting-started" },
			},
			fixture.memberContext,
		);

		expect(response?.error?.code).toBe(-32004);
	});

	it("returns forbidden when outsider reads restricted node resource", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			{
				jsonrpc: "2.0",
				id: 5,
				method: "resources/read",
				params: { uri: "antbox://nodes/restricted-file" },
			},
			fixture.outsiderContext,
		);

		expect(response?.error?.code).toBe(-32003);
	});

	it("accepts initialized notification without response", async () => {
		const fixture = await createFixture();

		const response = await processMcpRequest(
			{
				jsonrpc: "2.0",
				method: "notifications/initialized",
			},
			fixture.memberContext,
		);

		expect(response).toBeNull();
	});
});
