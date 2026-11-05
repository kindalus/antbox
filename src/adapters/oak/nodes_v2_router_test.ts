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
import setupOakServer from "./server.ts";

async function tenant(
	name: string,
	content: string,
	exportAllowed = true,
	storage = new InMemoryStorageProvider(),
	repository = new InMemoryNodeRepository(),
	readAllowed = true,
): Promise<AntboxTenant> {
	const nodeService = new NodeService({
		repository,
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
			advanced: { exporters: readAllowed ? exportAllowed ? ["Read", "Export"] : ["Read"] : [] },
		},
	})).isRight()).toBe(true);
	expect(
		(await nodeService.createFile(
			ctx,
			new File([content], "report.txt", { type: "text/plain" }),
			{
				uuid: "file",
				fid: "report",
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

describe("nodes v2 content-md over a real HTTP server", () => {
	const frontmatter = "---\nuuid: file\ntitle: report.txt\n---";
	const apiKey = { Authorization: "ApiKey test-key", "X-Tenant": "first" };

	async function serve(
		options: { contentMd?: string; readAllowed?: boolean; exportAllowed?: boolean },
		run: (url: string, reads: { storage: number; content: number }) => Promise<void>,
	) {
		const repository = new InMemoryNodeRepository();
		const storage = new InMemoryStorageProvider();
		const tenants = [
			await tenant(
				"first",
				"original file",
				options.exportAllowed ?? true,
				storage,
				repository,
				options.readAllowed ?? true,
			),
		];
		const adminCtx: AuthenticationContext = {
			tenant: "first",
			mode: "Direct",
			principal: { email: Users.ROOT_USER_EMAIL, groups: [Groups.ADMINS_GROUP_UUID] },
		};
		expect(
			(await tenants[0].nodeService.create(adminCtx, {
				uuid: "subfolder",
				title: "Subfolder",
				parent: "files",
				mimetype: Nodes.FOLDER_MIMETYPE,
			})).isRight(),
		).toBe(true);
		await repository.upsertEmbedding("subfolder", [1], `${frontmatter}\n\nCorpo de pasta`);
		if (options.contentMd !== undefined) {
			await repository.upsertEmbedding("file", [1], options.contentMd);
		}
		const reads = { storage: 0, content: 0 };
		const readFile = storage.read.bind(storage);
		storage.read = (uuid) => {
			reads.storage++;
			return readFile(uuid);
		};
		const readContents = repository.getEmbeddingContents.bind(repository);
		repository.getEmbeddingContents = (uuids) => {
			reads.content++;
			return readContents(uuids);
		};
		const abortController = new AbortController();
		const start = setupOakServer(tenants, async () => {});
		const { port } = await start({ port: 0, signal: abortController.signal } as never) as {
			port: number;
		};
		try {
			await run(`http://localhost:${port}/v2/nodes/file/-/content-md`, reads);
		} finally {
			abortController.abort();
		}
	}

	it("GET returns the body without frontmatter", async () => {
		await serve({ contentMd: `${frontmatter}\n\n# Título\n\nConteúdo` }, async (url) => {
			const response = await fetch(url, { headers: apiKey });
			const body = await response.text();

			expect(response.status).toBe(200);
			expect(body).toBe("# Título\n\nConteúdo");
			expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
			expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
			expect(response.headers.get("Cache-Control")).toBe("no-store");
		});
	});

	it("resolves FID identifiers to the stored content", async () => {
		await serve({ contentMd: `${frontmatter}\n\nConteúdo` }, async (url) => {
			const response = await fetch(url.replace("/file/", "/--fid--report/"), {
				headers: apiKey,
			});

			expect(await response.text()).toBe("Conteúdo");
			expect(response.status).toBe(200);
		});
	});

	it("returns 404 when no content is stored", async () => {
		await serve({}, async (url) => {
			const response = await fetch(url, { headers: apiKey });
			const body = await response.json();

			expect(response.status).toBe(404);
			expect(body.errorCode).toBe("NotFoundError");
			expect(response.headers.get("Cache-Control")).toBe("no-store");
		});
	});

	it("returns 404 when only frontmatter is stored", async () => {
		await serve({ contentMd: frontmatter }, async (url) => {
			const response = await fetch(url, { headers: apiKey });
			await response.body?.cancel();

			expect(response.status).toBe(404);
		});
	});

	it("returns 404 for an unknown node", async () => {
		await serve({}, async (url) => {
			const response = await fetch(url.replace("/file/", "/missing/"), { headers: apiKey });
			const body = await response.json();

			expect(response.status).toBe(404);
			expect(body.errorCode).toBe("NodeNotFoundError");
		});
	});

	it("returns 403 without read permission, even when content exists", async () => {
		await serve({ contentMd: `${frontmatter}\n\nSegredo`, readAllowed: false }, async (url) => {
			const response = await fetch(url, { headers: apiKey });
			const body = await response.text();

			expect(response.status).toBe(403);
			expect(body).not.toContain("Segredo");
		});
	});

	for (const method of ["GET", "HEAD"]) {
		it(`${method} returns the same 403 without Export, with or without content`, async () => {
			const responses: { status: number; body: string }[] = [];
			for (const contentMd of [`${frontmatter}\n\nSegredo`, frontmatter, undefined]) {
				await serve({ contentMd, exportAllowed: false }, async (url, reads) => {
					const response = await fetch(url, { method, headers: apiKey });
					responses.push({ status: response.status, body: await response.text() });
					expect(reads).toEqual({ storage: 0, content: 0 });
				});
			}

			expect(responses[0].status).toBe(403);
			expect(responses[0].body).not.toContain("Segredo");
			expect(responses[1]).toEqual(responses[0]);
			expect(responses[2]).toEqual(responses[0]);
			if (method === "HEAD") expect(responses[0].body).toBe("");
		});

		it(`${method} with Read and Export returns 200 without reading the file`, async () => {
			await serve({ contentMd: `${frontmatter}\n\nConteúdo` }, async (url, reads) => {
				const response = await fetch(url, { method, headers: apiKey });
				await response.text();

				expect(response.status).toBe(200);
				expect(reads.storage).toBe(0);
			});
		});

		it(`${method} returns 404 for folders, whatever the Export permission`, async () => {
			for (const exportAllowed of [true, false]) {
				await serve({ exportAllowed }, async (url, reads) => {
					const response = await fetch(url.replace("/file/", "/subfolder/"), {
						method,
						headers: apiKey,
					});
					const body = await response.text();

					expect(response.status).toBe(404);
					expect(body).not.toContain("Corpo de pasta");
					expect(reads).toEqual({ storage: 0, content: 0 });
				});
			}
		});
	}

	it("HEAD mirrors GET status and headers with an empty body", async () => {
		await serve({ contentMd: `${frontmatter}\n\n# Título` }, async (url) => {
			const get = await fetch(url, { headers: apiKey });
			const getBody = await get.text();
			const head = await fetch(url, { method: "HEAD", headers: apiKey });

			expect(await head.text()).toBe("");
			expect(head.status).toBe(200);
			for (const name of ["Content-Type", "X-Content-Type-Options", "Cache-Control"]) {
				expect(head.headers.get(name)).toBe(get.headers.get(name));
			}
			expect(head.headers.get("Content-Length")).toBe(
				String(new TextEncoder().encode(getBody).length),
			);
		});
	});

	it("HEAD reports missing and frontmatter-only content as 404 without a body", async () => {
		for (const contentMd of [undefined, frontmatter]) {
			await serve({ contentMd }, async (url) => {
				const head = await fetch(url, { method: "HEAD", headers: apiKey });

				expect(await head.text()).toBe("");
				expect(head.status).toBe(404);
			});
		}
	});

	it("HEAD returns 403 without read permission and without a body", async () => {
		await serve({ contentMd: `${frontmatter}\n\nSegredo`, readAllowed: false }, async (url) => {
			const head = await fetch(url, { method: "HEAD", headers: apiKey });

			expect(await head.text()).toBe("");
			expect(head.status).toBe(403);
		});
	});
});
