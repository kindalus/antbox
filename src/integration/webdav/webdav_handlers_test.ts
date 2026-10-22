import { beforeEach, describe, it } from "bdd";
import { expect } from "expect";
import { SignJWT } from "jose";
import { JSDOM } from "jsdom";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { NodeService } from "application/nodes/node_service.ts";
import { ApiKeysService } from "application/security/api_keys_service.ts";
import { ExternalLoginService } from "application/security/external_login_service.ts";
import { UsersService } from "application/security/users_service.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import {
	copyHandler,
	getHandler,
	lockHandler,
	mkcolHandler,
	moveHandler,
	putHandler,
} from "./webdav_handlers.ts";
import { webdavPathCache } from "./webdav_path_cache.ts";

async function setup(name = "first") {
	const configRepo = new InMemoryConfigurationRepository();
	const repository = new InMemoryNodeRepository();
	const storage = new InMemoryStorageProvider();
	const nodeService = new NodeService({
		configRepo,
		repository,
		storage,
		bus: { publish() {}, subscribe() {}, unsubscribe() {} },
	});
	const ctx: AuthenticationContext = {
		mode: "Direct",
		tenant: name,
		principal: { email: Users.ROOT_USER_EMAIL, groups: [Groups.ADMINS_GROUP_UUID] },
	};
	const tenant = {
		name,
		nodeService,
		symmetricKey: `test-signing-key-${name}`,
		apiKeysService: new ApiKeysService(configRepo),
		externalLoginService: new ExternalLoginService(new UsersService(configRepo), {
			type: "local",
			jwks: { keys: [] },
		}),
	} as unknown as AntboxTenant;
	expect((await nodeService.create(ctx, {
		uuid: "folder",
		title: "Folder",
		parent: Nodes.ROOT_FOLDER_UUID,
		mimetype: Nodes.FOLDER_MIMETYPE,
	})).isRight()).toBe(true);
	for (const title of ["original.txt", "existing.txt"]) {
		expect((await nodeService.createFile(
			ctx,
			new File([`${name}:${title}`], title, {
				type: "text/plain",
			}),
			{ parent: "folder" },
		)).isRight()).toBe(true);
	}
	const token = await new SignJWT({})
		.setProtectedHeader({ alg: "HS256" })
		.setIssuer("urn:antbox")
		.setAudience(name)
		.setExpirationTime("1h")
		.sign(new TextEncoder().encode(tenant.symmetricKey));
	const authorization = `Basic ${btoa(`jwt:${token}`)}`;
	const request = (method: string, path: string, headers: Record<string, string> = {}) =>
		new Request(`http://localhost/webdav/${name}${path}`, {
			method,
			headers: { authorization, ...headers },
		});
	return { tenant, repository, ctx, request, authorization };
}

describe("WebDAV handlers", () => {
	beforeEach(() => webdavPathCache.clear());

	it("preserves raw file bytes and restricts browser documents on GET and HEAD", async () => {
		const { tenant, request, ctx } = await setup();
		const content = "<h1>Document preview</h1>";
		const file = new File([content], "document.html", { type: "text/html" });
		expect((await tenant.nodeService.createFile(ctx, file, { parent: "folder" })).isRight())
			.toBe(true);
		for (const method of ["GET", "HEAD"]) {
			const response = await getHandler([tenant])(request(method, "/Folder/document.html"));
			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toBe("text/html");
			expect(response.headers.get("Content-Length")).toBe(String(file.size));
			expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
			expect(response.headers.get("Content-Security-Policy"))
				.toBe("sandbox; default-src 'none'; base-uri 'none'; form-action 'none'");
			expect(await response.text()).toBe(method === "GET" ? content : "");
		}
	});

	it("reads from the tenant named in the URL including encoded tenant names", async () => {
		const first = await setup();
		const second = await setup("second");
		const handler = getHandler([first.tenant, second.tenant]);
		const response = await handler(second.request("GET", "/Folder/original.txt"));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("second:original.txt");
		const encoded = await handler(
			new Request("http://localhost/webdav/%66irst/Folder/original.txt", {
				headers: { authorization: first.authorization },
			}),
		);
		expect(encoded.status).toBe(200);
		expect(await encoded.text()).toBe("first:original.txt");
	});

	it("copies to the decoded destination title with a single validated creation", async () => {
		const { tenant, request, ctx, repository } = await setup();
		const handler = copyHandler([tenant]);
		const copied = await handler(request("COPY", "/Folder/original.txt", {
			Destination: "/webdav/first/Folder/Copy%20name.txt",
		}));
		expect(copied.status).toBe(201);
		const result = await tenant.nodeService.find(ctx, [["title", "==", "Copy name.txt"]]);
		expect(result.right.nodes).toHaveLength(1);
		const count = repository.count;
		const invalid = await handler(request("COPY", "/Folder/original.txt", {
			Destination: "http://localhost/webdav/first/Folder/x",
		}));
		expect(invalid.status).toBe(400);
		expect(repository.count).toBe(count);
	});

	for (const [method, factory] of [["COPY", copyHandler], ["MOVE", moveHandler]] as const) {
		it(`${method} rejects foreign, malformed, and conflicting destination URLs before mutation`, async () => {
			const { tenant, request, repository } = await setup();
			const handler = factory([tenant]);
			const before = repository.records.map((node) => node.metadata);
			for (
				const Destination of [
					"http://remote/webdav/first/Folder/new.txt",
					"http://localhost/webdav/other/Folder/new.txt",
					"http://localhost/webdav/first/Folder/new.txt?x-tenant=other",
					"http://[",
					"relative-path",
				]
			) {
				const response = await handler(
					request(method, "/Folder/original.txt", { Destination }),
				);
				expect(response.status).toBe(400);
				expect(repository.records.map((node) => node.metadata)).toEqual(before);
			}
		});

		it(`${method} does not create ambiguous duplicate paths over an existing destination`, async () => {
			const { tenant, request, repository } = await setup();
			const handler = factory([tenant]);
			const before = repository.records.map((node) => node.metadata);
			for (const [Overwrite, status] of [["F", 412], ["T", 409]] as const) {
				const response = await handler(request(method, "/Folder/original.txt", {
					Destination: "http://localhost/webdav/first/Folder/existing.txt",
					Overwrite,
				}));
				expect(response.status).toBe(status);
				expect(repository.records.map((node) => node.metadata)).toEqual(before);
			}
		});
	}

	it("creates collections whose URI ends in a slash", async () => {
		const { tenant, request, ctx } = await setup();
		const response = await mkcolHandler([tenant])(request("MKCOL", "/Folder/New%20folder/"));
		expect(response.status).toBe(201);
		expect((await tenant.nodeService.find(ctx, [["title", "==", "New folder"]])).right.nodes)
			.toHaveLength(1);
		const existing = await mkcolHandler([tenant])(request("MKCOL", "/Folder/New%20folder/"));
		expect(existing.status).toBe(405);
		expect((await tenant.nodeService.find(ctx, [["title", "==", "New folder"]])).right.nodes)
			.toHaveLength(1);
	});

	it("moves with a decoded title and rejects same-path or descendant destinations", async () => {
		const { tenant, request, ctx, repository } = await setup();
		const destination = await tenant.nodeService.create(ctx, {
			title: "Other",
			parent: Nodes.ROOT_FOLDER_UUID,
			mimetype: Nodes.FOLDER_MIMETYPE,
		});
		if (destination.isLeft()) throw destination.value;
		const handler = moveHandler([tenant]);
		const before = repository.records.map((node) => node.metadata);
		const same = await handler(request("MOVE", "/Folder/original.txt", {
			Destination: "/webdav/first/Folder/original.txt",
		}));
		expect(same.status).toBe(403);
		const descendant = await handler(request("MOVE", "/Folder/", {
			Destination: "/webdav/first/Folder/Nested/",
		}));
		expect(descendant.status).toBe(400);
		expect(repository.records.map((node) => node.metadata)).toEqual(before);
		const moved = await handler(request("MOVE", "/Folder/original.txt", {
			Destination: "/webdav/first/Other/Moved%20file.txt",
		}));
		if (moved.status !== 201) throw new Error(await moved.text());
		expect(moved.status).toBe(201);
		const result = await tenant.nodeService.find(ctx, [["title", "==", "Moved file.txt"]]);
		expect(result.right.nodes).toHaveLength(1);
		expect(result.right.nodes[0].metadata.parent).toBe(destination.value.uuid);
	});

	it("escapes request values in lock XML", async () => {
		const { tenant, request } = await setup();
		const timeout = "Second-3600 & <injected/>";
		const response = await lockHandler([tenant])(request("LOCK", "/Folder/original.txt", {
			Timeout: timeout,
		}));
		expect(response.status).toBe(200);
		const dom = new JSDOM(await response.text(), { contentType: "application/xml" });
		try {
			expect(dom.window.document.getElementsByTagNameNS("DAV:", "timeout")[0].textContent)
				.toBe(timeout);
			expect(dom.window.document.getElementsByTagName("injected")).toHaveLength(0);
		} finally {
			dom.window.close();
		}
	});

	it("returns HEAD headers without a body and accepts empty PUT content", async () => {
		const { tenant, request, ctx } = await setup();
		const head = await getHandler([tenant])(request("HEAD", "/Folder/original.txt"));
		expect(head.status).toBe(200);
		expect(head.headers.get("Content-Length")).toBe("18");
		expect(await head.text()).toBe("");
		const put = await putHandler([tenant])(request("PUT", "/Folder/empty.txt"));
		expect(put.status).toBe(201);
		const nodes = await tenant.nodeService.find(ctx, [["title", "==", "empty.txt"]]);
		expect(nodes.right.nodes[0].metadata.size).toBe(0);
	});

	it("lists a collection with its own href followed by child hrefs", async () => {
		const { tenant, request } = await setup();
		const response = await getHandler([tenant])(request("GET", "/Folder/"));
		expect(response.status).toBe(207);
		const dom = new JSDOM(await response.text(), { contentType: "application/xml" });
		try {
			const hrefs = [...dom.window.document.getElementsByTagNameNS("DAV:", "href")]
				.map((element) => element.textContent);
			expect(hrefs[0]).toBe("/webdav/first/Folder/");
			expect(hrefs).toContain("/webdav/first/Folder/original.txt");
			expect(hrefs).toContain("/webdav/first/Folder/existing.txt");
		} finally {
			dom.window.close();
		}
	});

	it("rejects malformed encoded paths before handlers decode titles", async () => {
		const { tenant, request, repository } = await setup();
		const count = repository.count;
		const result = await mkcolHandler([tenant])(request("MKCOL", "/Folder/%invalid"));
		expect(result.status).toBe(400);
		expect(repository.count).toBe(count);
	});
});
