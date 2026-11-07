import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { AuthorizationService } from "application/security/authorization_service.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { Users } from "domain/users_groups/users.ts";
import { EmbeddingsGeneratedEvent } from "domain/ai/embeddings_generated_event.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { left, right } from "shared/either.ts";
import { AntboxError, BadRequestError } from "shared/antbox_error.ts";
import type { Event } from "shared/event.ts";
import { FindService } from "./find_service.ts";
import type { NodeServiceContext } from "./node_service_context.ts";

const ctx: AuthenticationContext = {
	tenant: "default",
	mode: "Direct",
	principal: { email: Users.ROOT_USER_EMAIL, groups: [] },
};

it("FindService preserves every parent constraint when resolving parent metadata", async () => {
	const repository = new InMemoryNodeRepository();
	const file = FileNode.create({
		uuid: "matching-file",
		title: "Example",
		mimetype: "text/plain",
		owner: Users.ROOT_USER_EMAIL,
		parent: Nodes.ROOT_FOLDER_UUID,
	});
	expect(file.isRight()).toBe(true);
	await repository.add(file.right);
	const service = new FindService(
		{ repository } as unknown as NodeServiceContext,
		new AuthorizationService(),
	);
	const noMatch = await service.find(ctx, [
		["@title", "==", "Root"],
		["parent", "==", Nodes.ROOT_FOLDER_UUID],
		["parent", "!=", Nodes.ROOT_FOLDER_UUID],
	]);
	expect(noMatch.isRight()).toBe(true);
	expect(noMatch.right.nodes).toEqual([]);
	const match = await service.find(ctx, [
		["@title", "==", "Root"],
		["parent", "in", [Nodes.ROOT_FOLDER_UUID, "other-folder"]],
		["parent", "!=", "other-folder"],
	]);
	expect(match.isRight()).toBe(true);
	expect(match.right.nodes.map((node) => node.uuid)).toEqual(["matching-file"]);
});

describe("FindService pagination", () => {
	it("rejects invalid values before repository queries and preserves internal bulk reads", async () => {
		const repo = new InMemoryNodeRepository();
		let queries = 0;
		repo.filter = (_filters, pageSize = 20, pageToken = 1) => {
			queries++;
			return Promise.resolve({ nodes: [], pageSize, pageToken });
		};
		const service = new FindService(
			{ repository: repo } as unknown as NodeServiceContext,
			new AuthorizationService(),
		);
		for (
			const [size, page] of [[-1, 2], [0, 1], [1.5, 1], [20, 0], [20, 1.5], [
				20,
				Number.MAX_SAFE_INTEGER,
			]]
		) {
			expect((await service.find(ctx, [], size, page)).isLeft()).toBe(true);
		}
		expect(queries).toBe(0);
		expect((await service.find(ctx, [], Number.MAX_SAFE_INTEGER, 1)).isRight()).toBe(true);
		expect(queries).toBe(1);
	});

	it("bounds semantic result windows before embedding and allows the last valid page", async () => {
		const repo = new InMemoryNodeRepository();
		let embeddings = 0;
		const topKs: number[] = [];
		repo.supportsEmbeddings = () => true;
		repo.vectorSearch = (_embedding, topK = 0) => {
			topKs.push(topK);
			return Promise.resolve(right({ nodes: [] }));
		};
		const service = new FindService({
			repository: repo,
			embeddingsProvider: {
				relevanceThreshold: () => 0,
				embed: () => {
					embeddings++;
					return Promise.resolve(right({ embeddings: [[1]] }));
				},
			},
		} as unknown as NodeServiceContext, new AuthorizationService());
		expect((await service.find(ctx, "?invoices", 200, 51)).isLeft()).toBe(true);
		expect(embeddings).toBe(0);
		expect(topKs).toHaveLength(0);
		expect((await service.find(ctx, "?invoices", 200, 50)).isRight()).toBe(true);
		expect(embeddings).toBe(1);
		expect(topKs).toEqual([10_000]);
	});
});

describe("FindService semantic search usage", () => {
	const usage = { promptTokens: 7, completionTokens: 0, totalTokens: 7 };

	function buildService(embed: () => Promise<unknown>) {
		const published: Event[] = [];
		const embedCalls = { count: 0 };
		const repository = new InMemoryNodeRepository();
		repository.supportsEmbeddings = () => true;
		repository.vectorSearch = () => Promise.resolve(right({ nodes: [] }));
		const service = new FindService(
			{
				repository,
				bus: { publish: (event: Event) => published.push(event) },
				embeddingsProvider: {
					relevanceThreshold: () => 0,
					embed: () => {
						embedCalls.count++;
						return embed();
					},
				},
			} as unknown as NodeServiceContext,
			new AuthorizationService(),
		);
		return { published, embedCalls, service };
	}

	it("records query embedding usage against the searching user and tenant", async () => {
		const { published, service } = buildService(() =>
			Promise.resolve(right({ embeddings: [[1]], model: "gemini-embedding-2", usage }))
		);

		const result = await service.find(ctx, "?invoices due this month");

		expect(result.isRight()).toBe(true);
		expect(published.length).toBe(1);
		const event = published[0] as EmbeddingsGeneratedEvent;
		expect(event).toBeInstanceOf(EmbeddingsGeneratedEvent);
		expect(event.userEmail).toBe(ctx.principal.email);
		expect(event.tenant).toBe(ctx.tenant);
		expect(event.payload).toEqual({
			nodeUuid: "query",
			model: "gemini-embedding-2",
			usage,
			context: "search",
		});
	});

	it("records nothing when the query embedding fails", async () => {
		const { published, embedCalls, service } = buildService(() =>
			Promise.resolve(left(new AntboxError("EmbeddingsDown", "embeddings unavailable")))
		);

		const result = await service.find(ctx, "?invoices due this month");

		expect(result.isRight()).toBe(true);
		expect(embedCalls.count).toBe(1);
		expect(published).toEqual([]);
	});
});

describe("FindService full-text search", () => {
	const reader: AuthenticationContext = {
		tenant: "default",
		mode: "Direct",
		principal: { email: "reader@antbox.io", groups: ["readers"] },
	};

	function setup() {
		const repository = new InMemoryNodeRepository();
		const calls = { fts: [] as Array<[string, unknown]>, filter: 0 };
		const fts = repository.fts.bind(repository);
		repository.fts = (query, options) => {
			calls.fts.push([query, options.filters]);
			return fts(query, options);
		};
		const filter = repository.filter.bind(repository);
		repository.filter = (filters, pageSize, pageToken) => {
			calls.filter++;
			return filter(filters, pageSize, pageToken);
		};
		const service = new FindService(
			{ repository } as unknown as NodeServiceContext,
			new AuthorizationService(),
		);
		return { repository, service, calls };
	}

	async function addSearchable(repository: InMemoryNodeRepository, uuid: string, title: string) {
		const file = FileNode.create({
			uuid,
			title,
			mimetype: "text/plain",
			owner: Users.ROOT_USER_EMAIL,
			parent: Nodes.ROOT_FOLDER_UUID,
		}).right;
		await repository.add(file);
		await repository.saveContent(uuid, { markdown: title, searchMeta: title });
	}

	it("uses filter() when no group searches text", async () => {
		const { service, calls } = setup();
		const result = await service.find(ctx, [["title", "==", "x"]]);
		expect(result.isRight()).toBe(true);
		expect(calls).toEqual({ fts: [], filter: 1 });
		expect(result.right.scores).toBeUndefined();
	});

	it("uses fts() with the other filters when every group searches the same text", async () => {
		const { repository, service, calls } = setup();
		await addSearchable(repository, "annual-report", "Annual report");
		await addSearchable(repository, "annual-budget", "Annual budget");

		const result = await service.find(ctx, [
			[["fulltext", "match", "annual"], ["title", "!=", "Annual budget"]],
			[["fulltext", "match", " annual "], ["uuid", "==", "annual-budget"]],
		]);
		expect(result.isRight()).toBe(true);
		expect(calls.filter).toBe(0);
		expect(calls.fts).toEqual([["annual", [
			[["title", "!=", "Annual budget"]],
			[["uuid", "==", "annual-budget"]],
		]]]);
		expect(result.right.nodes.map((node) => node.uuid).sort()).toEqual([
			"annual-budget",
			"annual-report",
		]);
		expect(result.right.scores).toEqual({ "annual-budget": 1, "annual-report": 1 });
	});

	it("keeps the query in every permission group of a non-admin principal", async () => {
		const { service, calls } = setup();
		const result = await service.find(reader, [["fulltext", "match", "annual"]]);
		expect(result.isRight()).toBe(true);
		expect(calls.fts).toHaveLength(1);
		const [query, filters] = calls.fts[0];
		expect(query).toBe("annual");
		expect((filters as unknown[]).length).toBeGreaterThan(1);
		expect(JSON.stringify(filters)).not.toContain("fulltext");
	});

	it("rejects text searches that only some groups have or that differ between groups", async () => {
		const { service, calls } = setup();
		const invalid = [
			[[["fulltext", "match", "annual"]], [["title", "==", "x"]]],
			[[["fulltext", "match", "annual"]], [["fulltext", "match", "budget"]]],
			[[["fulltext", "match", { $ne: null }]]],
		];
		for (const filters of invalid) {
			const result = await service.find(ctx, filters as never);
			expect(result.isLeft()).toBe(true);
			expect(result.value).toBeInstanceOf(BadRequestError);
		}
		expect(calls).toEqual({ fts: [], filter: 0 });
	});

	it("searches text given as a plain string and as a semantic query without AI", async () => {
		const { repository, service, calls } = setup();
		await addSearchable(repository, "annual-report", "Annual report");
		for (const query of ["annual", "?annual"]) {
			const result = await service.find(ctx, query);
			expect(result.right.nodes.map((node) => node.uuid)).toEqual(["annual-report"]);
			expect(result.right.scores).toEqual({ "annual-report": 1 });
		}
		expect(calls.fts.map(([query]) => query)).toEqual(["annual", "annual"]);
	});
});
