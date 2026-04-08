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
import { MCP_PROTOCOL_VERSION } from "./mcp_server.ts";
import { mcpHttpHandler } from "./mcp_http_handler.ts";

interface Fixture {
	handler: (req: Request) => Promise<Response>;
	validToken: string;
}

async function createFixture(): Promise<Fixture> {
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
		handler: mcpHttpHandler([tenant]),
		validToken: createdApiKey.value.secret,
	};
}

function createRequest(payload: unknown, headers: HeadersInit = {}): Request {
	return new Request("http://localhost:7180/mcp", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...headers,
		},
		body: JSON.stringify(payload),
	});
}

describe("mcp_http_handler", () => {
	it("allows anonymous initialize in resource-only mode", async () => {
		const fixture = await createFixture();

		const response = await fixture.handler(
			createRequest({ jsonrpc: "2.0", id: 1, method: "initialize" }),
		);

		expect(response.status).toBe(200);
		const payload = await response.json() as {
			result: {
				protocolVersion: string;
				capabilities: {
					tools?: unknown;
					resources: unknown;
				};
			};
		};
		expect(payload.result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
		expect(payload.result.capabilities.resources).toBeDefined();
		expect(payload.result.capabilities.tools).toBeUndefined();
	});

	it("rejects unsupported auth query parameter", async () => {
		const fixture = await createFixture();

		const req = new Request("http://localhost:7180/mcp?api_key=abc", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${fixture.validToken}`,
			},
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
		});

		const response = await fixture.handler(req);
		expect(response.status).toBe(401);
	});

	it("rejects invalid Bearer API key", async () => {
		const fixture = await createFixture();

		const response = await fixture.handler(
			createRequest(
				{ jsonrpc: "2.0", id: 1, method: "initialize" },
				{ Authorization: "Bearer invalid-token" },
			),
		);

		expect(response.status).toBe(401);
	});

	it("accepts Bearer API key with optional X-Tenant", async () => {
		const fixture = await createFixture();

		const response = await fixture.handler(
			createRequest(
				{
					jsonrpc: "2.0",
					id: 1,
					method: "initialize",
					params: { protocolVersion: MCP_PROTOCOL_VERSION },
				},
				{ Authorization: `Bearer ${fixture.validToken}` },
			),
		);

		expect(response.status).toBe(200);
		const payload = await response.json() as {
			result: { protocolVersion: string };
		};
		expect(payload.result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
	});

	it("accepts tenant selection via x-tenant query parameter", async () => {
		const fixture = await createFixture();

		const response = await fixture.handler(
			new Request("http://localhost:7180/mcp?x-tenant=default", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${fixture.validToken}`,
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "initialize",
					params: { protocolVersion: MCP_PROTOCOL_VERSION },
				}),
			}),
		);

		expect(response.status).toBe(200);
	});

	it("rejects unknown X-Tenant header", async () => {
		const fixture = await createFixture();

		const response = await fixture.handler(
			createRequest(
				{ jsonrpc: "2.0", id: 1, method: "initialize" },
				{
					Authorization: `Bearer ${fixture.validToken}`,
					"X-Tenant": "unknown",
				},
			),
		);

		expect(response.status).toBe(400);
		const payload = await response.json() as { error: { message: string } };
		expect(payload.error.message).toContain("Invalid tenant selection");
	});

	it("allows anonymous resources/list", async () => {
		const fixture = await createFixture();

		const response = await fixture.handler(
			createRequest({ jsonrpc: "2.0", id: 20, method: "resources/list" }),
		);

		expect(response.status).toBe(200);
		const payload = await response.json() as { result: { resources: unknown[] } };
		expect(payload.result.resources.length > 0).toBe(true);
	});

	it("allows anonymous resources/templates/list", async () => {
		const fixture = await createFixture();

		const response = await fixture.handler(
			createRequest({ jsonrpc: "2.0", id: 21, method: "resources/templates/list" }),
		);

		expect(response.status).toBe(200);
		const payload = await response.json() as { result: { resourceTemplates: unknown[] } };
		expect(payload.result.resourceTemplates.length > 0).toBe(true);
	});

	it("allows anonymous node resources/read when permissions allow it", async () => {
		const fixture = await createFixture();

		const response = await fixture.handler(
			createRequest(
				{
					jsonrpc: "2.0",
					id: 22,
					method: "resources/read",
					params: { uri: "antbox://nodes/anonymous-file" },
				},
			),
		);

		expect(response.status).toBe(200);
		const payload = await response.json() as {
			result: { contents: Array<{ text: string }> };
		};
		expect(payload.result.contents[0].text).toContain("anonymous-file");
	});

	it("does not expose tools/list anonymously", async () => {
		const fixture = await createFixture();

		const response = await fixture.handler(
			createRequest({ jsonrpc: "2.0", id: 23, method: "tools/list" }),
		);

		expect(response.status).toBe(200);
		const payload = await response.json() as { error: { code: number; message: string } };
		expect(payload.error.code).toBe(-32601);
		expect(payload.error.message).toBe("Method not found: tools/list");
	});

	it("does not expose tools/call anonymously", async () => {
		const fixture = await createFixture();

		const response = await fixture.handler(
			createRequest(
				{
					jsonrpc: "2.0",
					id: 24,
					method: "tools/call",
					params: { name: "nodes.list", arguments: {} },
				},
			),
		);

		expect(response.status).toBe(200);
		const payload = await response.json() as { error: { code: number; message: string } };
		expect(payload.error.code).toBe(-32601);
		expect(payload.error.message).toBe("Method not found: tools/call");
	});

	it("returns 202 for notifications", async () => {
		const fixture = await createFixture();

		const response = await fixture.handler(
			createRequest(
				{ jsonrpc: "2.0", method: "notifications/initialized" },
				{ Authorization: `Bearer ${fixture.validToken}` },
			),
		);

		expect(response.status).toBe(202);
	});

	it("returns 202 for JSON-RPC responses", async () => {
		const fixture = await createFixture();

		const response = await fixture.handler(
			createRequest(
				{ jsonrpc: "2.0", id: 12, result: { ok: true } },
				{ Authorization: `Bearer ${fixture.validToken}` },
			),
		);

		expect(response.status).toBe(202);
	});

	it("returns 400 for unsupported protocol version header", async () => {
		const fixture = await createFixture();

		const response = await fixture.handler(
			createRequest(
				{ jsonrpc: "2.0", id: 1, method: "tools/list" },
				{
					Authorization: `Bearer ${fixture.validToken}`,
					"MCP-Protocol-Version": "2024-11-05",
				},
			),
		);

		expect(response.status).toBe(400);
	});
});
