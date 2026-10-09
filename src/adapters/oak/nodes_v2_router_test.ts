import { Application } from "@oak/oak";
import { describe, it } from "bdd";
import { expect } from "expect";
import { strFromU8, unzipSync } from "fflate";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { NodeService } from "application/nodes/node_service.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { left, right } from "shared/either.ts";
import { UnknownError } from "shared/antbox_error.ts";
import nodesRouter from "./nodes_v2_router.ts";

async function tenant(
	name: string,
	content: string,
	exportAllowed = true,
	storage = new InMemoryStorageProvider(),
): Promise<AntboxTenant> {
	const nodeService = new NodeService({
		repository: new InMemoryNodeRepository(),
		storage,
		configRepo: new InMemoryConfigurationRepository(),
		bus: new InMemoryEventBus(),
	});
	const ctx: AuthenticationContext = {
		tenant: name,
		mode: "Direct",
		principal: { email: Users.ROOT_USER_EMAIL, groups: [Groups.ADMINS_GROUP_UUID] },
	};
	expect((await nodeService.create(ctx, {
		uuid: "files",
		title: "Files",
		parent: Nodes.ROOT_FOLDER_UUID,
		mimetype: Nodes.FOLDER_MIMETYPE,
		group: "owners",
		permissions: {
			group: [],
			authenticated: [],
			anonymous: [],
			advanced: { exporters: exportAllowed ? ["Read", "Export"] : ["Read"] },
		},
	})).isRight()).toBe(true);
	expect(
		(await nodeService.createFile(
			ctx,
			new File([content], "report.txt", { type: "text/plain" }),
			{
				uuid: "file",
				title: "report.txt",
				parent: "files",
				mimetype: "text/plain",
			},
		)).isRight(),
	).toBe(true);
	return {
		name,
		nodeService,
		symmetricKey: "test-secret",
		apiKeysService: { getApiKeyBySecret: () => Promise.resolve(right({ group: "exporters" })) },
		externalLoginService: {},
	} as unknown as AntboxTenant;
}

function app(tenants: AntboxTenant[]) {
	const application = new Application();
	const router = nodesRouter(tenants);
	application.use(router.routes(), router.allowedMethods());
	return application;
}

function request(body: string, name = "first", authenticated = true) {
	return new Request("http://localhost/nodes/-/export-all", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Tenant": name,
			...(authenticated ? { Authorization: "ApiKey test-key" } : {}),
		},
		body,
	});
}

describe("nodes v2 bulk export", () => {
	it("downloads a ZIP with attachment headers and isolates tenant storage", async () => {
		const application = app([
			await tenant("first", "first tenant"),
			await tenant("second", "second tenant"),
		]);
		for (const name of ["first", "second"]) {
			const response = await application.handle(request('{"uuids":["file"]}', name));
			if (!response) throw new Error("No response from Oak");
			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toBe("application/zip");
			expect(response.headers.get("Content-Disposition")).toBe(
				'attachment; filename="antbox-export.zip"',
			);
			expect(response.headers.get("Cache-Control")).toBe("no-store");
			const bytes = new Uint8Array(await response.arrayBuffer());
			expect(Number(response.headers.get("Content-Length"))).toBe(bytes.length);
			expect(strFromU8(unzipSync(bytes)["report.txt"])).toBe(`${name} tenant`);
		}
	});

	for (
		const body of [
			"{",
			"{}",
			'{"uuids":[]}',
			'{"uuids":[42]}',
			'{"uuids":[""]}',
			'{"uuids":["bad/uuid"]}',
			'{"uuids":["abc"]}',
			'{"uuids":["--fid--"]}',
			"null",
		]
	) {
		it(`rejects invalid input ${body}`, async () => {
			const response = await app([await tenant("first", "a")]).handle(request(body));
			if (!response) throw new Error("No response from Oak");
			expect(response.status).toBe(400);
			expect((await response.json()).errorCode).toBe("BadRequestError");
		});
	}

	it("requires a JSON content type", async () => {
		const req = request('{"uuids":["file"]}');
		req.headers.set("Content-Type", "text/plain");
		const response = await app([await tenant("first", "a")]).handle(req);
		if (!response) throw new Error("No response from Oak");
		expect(response.status).toBe(400);
		await response.json();
	});

	it("rejects anonymous access and ignores a forged principal header", async () => {
		const req = request('{"uuids":["file"]}', "first", false);
		req.headers.set(
			"X-Principal",
			JSON.stringify({ email: Users.ROOT_USER_EMAIL, groups: [Groups.ADMINS_GROUP_UUID] }),
		);
		const response = await app([await tenant("first", "a")]).handle(req);
		if (!response) throw new Error("No response from Oak");
		expect(response.status).toBe(401);
		expect((await response.json()).errorCode).toBe("UnauthorizedError");
	});

	it("returns 403 when an authenticated principal can read but cannot export", async () => {
		const response = await app([await tenant("first", "a", false)]).handle(
			request('{"uuids":["file"]}'),
		);
		if (!response) throw new Error("No response from Oak");
		expect(response.status).toBe(403);
		expect((await response.json()).errorCode).toBe("ForbiddenError");
	});

	it("returns 500 rather than a partial ZIP on storage failure", async () => {
		const storage = new InMemoryStorageProvider();
		const first = await tenant("first", "a", true, storage);
		storage.read = () => Promise.resolve(left(new UnknownError("Storage unavailable")));
		const response = await app([first]).handle(request('{"uuids":["file"]}'));
		if (!response) throw new Error("No response from Oak");
		expect(response.status).toBe(500);
		expect(response.headers.get("Content-Disposition")).toBeNull();
		expect((await response.json()).errorCode).toBe("UnknownError");
	});

	for (const [uuid, status] of [["files", 400], ["missing", 404]] as const) {
		it(`maps batch failure ${uuid} to ${status}`, async () => {
			const response = await app([await tenant("first", "a")]).handle(
				request(JSON.stringify({ uuids: ["file", uuid] })),
			);
			if (!response) throw new Error("No response from Oak");
			expect(response.status).toBe(status);
			await response.json();
		});
	}
});
