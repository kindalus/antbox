import { afterAll, beforeAll, describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { SqliteNodeRepository } from "adapters/sqlite/sqlite_node_repository.ts";
import type { EmbeddingsProvider, EmbeddingsResult } from "domain/ai/embeddings_provider.ts";
import { EMBEDDING_DIMENSIONS } from "domain/nodes/embedding.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import type { FindDocumentsOptions } from "./find_documents.ts";
import { NodeService } from "./node_service.ts";

/** A unit vector whose cosine similarity with the query axis is `score`. */
function vectorWithScore(score: number): number[] {
	const vector = new Array(EMBEDDING_DIMENSIONS).fill(0);
	vector[0] = score;
	vector[1] = Math.sqrt(1 - score * score);
	return vector;
}

/** Embeds every query on the first axis, so a stored vector's score is its first component. */
class AxisEmbeddings implements EmbeddingsProvider {
	constructor(private readonly threshold: number, private readonly fail = false) {}

	embed(texts: string[]): Promise<Either<AntboxError, EmbeddingsResult>> {
		if (this.fail) return Promise.resolve(left(new AntboxError("EmbedFailed", "offline")));
		return Promise.resolve(right({
			embeddings: texts.map(() => vectorWithScore(1)),
			usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
		}));
	}

	relevanceThreshold(): number {
		return this.threshold;
	}
}

const admin: AuthenticationContext = {
	mode: "Direct",
	tenant: "t",
	principal: { email: Users.ROOT_USER_EMAIL, groups: [Groups.ADMINS_GROUP_UUID] },
};

const reader: AuthenticationContext = {
	mode: "Direct",
	tenant: "t",
	principal: { email: "reader@tenant.test", groups: ["readers"] },
};

const INVOICES: NodeFilters = [["aspects", "contains", "invoice"]];
const OPEN_INVOICES: NodeFilters = [...INVOICES, ["invoice:status", "==", "Open"]];

const repositories: [string, () => NodeRepository & { close?: () => void }][] = [
	["in-memory", () => new InMemoryNodeRepository()],
	["sqlite", () => new SqliteNodeRepository()],
];

interface Fixture {
	repository: NodeRepository & { close?: () => void };
	contentCalls: string[][];
	service(provider?: EmbeddingsProvider): NodeService;
}

/**
 * Invoices (readable): inv-1 Open 0.9, inv-2 Open 0.7, inv-3 Closed 0.95.
 * Contracts (readable): inv-4 Open 0.8, contract-a 0.85 with a long body, contract-b 0.2.
 * Private (not readable by the reader): inv-secret Open 0.99.
 */
async function buildFixture(makeRepository: () => Fixture["repository"]): Promise<Fixture> {
	const repository = makeRepository();
	const configRepo = new InMemoryConfigurationRepository();
	const now = new Date().toISOString();
	await configRepo.save("aspects", {
		uuid: "invoice",
		title: "Invoice",
		filters: [],
		properties: [
			{ name: "status", title: "Status", type: "string", validationList: ["Open", "Closed"] },
			{ name: "amount", title: "Amount", type: "number" },
		],
		createdTime: now,
		modifiedTime: now,
	});
	const service = (embeddingsProvider?: EmbeddingsProvider) =>
		new NodeService({
			repository,
			storage: new InMemoryStorageProvider(),
			bus: new InMemoryEventBus(),
			configRepo,
			embeddingsProvider,
		});
	const setup = service();

	const folder = async (uuid: string, title: string, readable: boolean) => {
		const created = await setup.create(admin, {
			uuid,
			title,
			mimetype: Nodes.FOLDER_MIMETYPE,
			parent: Nodes.ROOT_FOLDER_UUID,
			group: Groups.ADMINS_GROUP_UUID,
			permissions: {
				group: ["Read", "Write", "Export"],
				authenticated: readable ? ["Read"] : [],
				anonymous: [],
				advanced: {},
			},
		});
		if (created.isLeft()) throw created.value;
	};

	const doc = async (
		uuid: string,
		title: string,
		parent: string,
		score: number,
		invoice?: { status: string; amount: number },
		body = `Body of ${title}.`,
	) => {
		const created = await setup.create(admin, {
			uuid,
			title,
			mimetype: Nodes.META_NODE_MIMETYPE,
			parent,
			...(invoice
				? {
					aspects: ["invoice"],
					properties: { "invoice:status": invoice.status, "invoice:amount": invoice.amount },
				}
				: {}),
		});
		if (created.isLeft()) throw created.value;
		await repository.saveContent(uuid, {
			markdown: `---\ntitle: ${title}\nowner: root\n---\n\n${body}`,
			searchBody: body,
		});
		await repository.upsertEmbedding(uuid, vectorWithScore(score));
	};

	await folder("invoices", "Invoices", true);
	await folder("contracts", "Contracts", true);
	await folder("private", "Private", false);
	await doc("inv-1", "Invoice Alpha", "invoices", 0.9, { status: "Open", amount: 100 });
	await doc("inv-2", "Invoice Beta", "invoices", 0.7, { status: "Open", amount: 200 });
	await doc("inv-3", "Invoice Gamma", "invoices", 0.95, { status: "Closed", amount: 300 });
	await doc("inv-4", "Invoice Delta", "contracts", 0.8, { status: "Open", amount: 400 });
	await doc("inv-secret", "Invoice Secret", "private", 0.99, { status: "Open", amount: 999 });
	await doc("contract-a", "Supply contract", "contracts", 0.85, undefined, "x".repeat(10_000));
	await doc("contract-b", "Lease contract", "contracts", 0.2);

	const contentCalls: string[][] = [];
	const getContents = repository.getContents.bind(repository);
	repository.getContents = (uuids: string[]) => {
		contentCalls.push(uuids);
		return getContents(uuids);
	};

	return { repository, contentCalls, service };
}

for (const [name, makeRepository] of repositories) {
	describe(`FindService.findDocuments (${name})`, () => {
		let f: Fixture;

		beforeAll(async () => {
			f = await buildFixture(makeRepository);
		});

		afterAll(() => f.repository.close?.());

		const find = async (
			ctx: AuthenticationContext,
			options: FindDocumentsOptions,
			provider: EmbeddingsProvider | null = new AxisEmbeddings(0.6),
		) => {
			const result = await f.service(provider ?? undefined).findDocuments(ctx, options);
			if (result.isLeft()) throw result.value;
			return result.value;
		};
		const uuids = (result: { nodes: { uuid: string }[] }) => result.nodes.map((n) => n.uuid);

		describe("filters only", () => {
			it("returns the exact total of the readable matches", async () => {
				const result = await find(reader, { filters: OPEN_INVOICES, limit: 1 });
				expect(result.mode).toBe("filters");
				expect(result.total).toBe(3);
				expect(result.returned).toBe(1);
				expect(result.totalIsLowerBound).toBeUndefined();
				expect(result.nodes[0].score).toBeUndefined();
			});

			it("never returns or counts a node the user cannot read", async () => {
				const result = await find(reader, { filters: OPEN_INVOICES });
				expect(uuids(result).sort()).toEqual(["inv-1", "inv-2", "inv-4"]);
				const asAdmin = await find(admin, { filters: OPEN_INVOICES });
				expect(asAdmin.total).toBe(4);
				expect(uuids(asAdmin)).toContain("inv-secret");
			});

			it("resolves @ parent filters and OR groups", async () => {
				const underInvoices = await find(reader, {
					filters: [...INVOICES, ["@title", "==", "Invoices"]],
				});
				expect(uuids(underInvoices).sort()).toEqual(["inv-1", "inv-2", "inv-3"]);
				expect(underInvoices.total).toBe(3);

				const either = await find(reader, {
					filters: [[["invoice:status", "==", "Closed"]], [["title", "==", "Lease contract"]]],
				});
				expect(uuids(either).sort()).toEqual(["contract-b", "inv-3"]);
				expect(either.total).toBe(2);
			});

			it("returns the node metadata an agent needs", async () => {
				const result = await find(reader, {
					filters: [["invoice:amount", ">=", 300], ["invoice:amount", "<", 400], ...INVOICES],
				});
				expect(result.nodes).toEqual([expect.objectContaining({
					uuid: "inv-3",
					title: "Invoice Gamma",
					mimetype: Nodes.META_NODE_MIMETYPE,
					parent: "invoices",
					aspects: ["invoice"],
					properties: { "invoice:status": "Closed", "invoice:amount": 300 },
				})]);
			});
		});

		describe("query", () => {
			it("ranks readable nodes by meaning above the relevance threshold", async () => {
				const result = await find(reader, { query: "anything" }, new AxisEmbeddings(0.75));
				expect(result.mode).toBe("semantic");
				expect(uuids(result)).toEqual(["inv-3", "inv-1", "contract-a", "inv-4"]);
				expect(result.total).toBe(4);
				expect(result.nodes[0].score).toBeCloseTo(0.95, 2);
				expect(result.notice).toBeUndefined();
			});

			it("lowers the threshold by 10 points when nothing passes it", async () => {
				const result = await find(reader, { query: "anything" }, new AxisEmbeddings(0.99));
				expect(uuids(result)).toEqual(["inv-3", "inv-1"]);
			});

			it("ranks by meaning only within the filters, including @ filters", async () => {
				const result = await find(reader, { query: "anything", filters: OPEN_INVOICES });
				expect(result.mode).toBe("semantic");
				expect(uuids(result)).toEqual(["inv-1", "inv-4", "inv-2"]);

				const underInvoices = await find(reader, {
					query: "anything",
					filters: [...INVOICES, ["@title", "==", "Invoices"]],
				});
				expect(uuids(underInvoices)).toEqual(["inv-3", "inv-1", "inv-2"]);
				expect(underInvoices.total).toBe(3);
			});

			it("falls back to full-text search within the filters without embeddings", async () => {
				const result = await find(reader, { query: "invoice", filters: OPEN_INVOICES }, null);
				expect(result.mode).toBe("fulltext");
				expect(result.notice).toContain("not available");
				expect(uuids(result).sort()).toEqual(["inv-1", "inv-2", "inv-4"]);
				expect(result.total).toBe(3);
			});

			it("falls back to full-text search when semantic search fails", async () => {
				const result = await find(reader, { query: "alpha" }, new AxisEmbeddings(0.6, true));
				expect(result.mode).toBe("fulltext");
				expect(result.notice).toContain("failed");
				expect(uuids(result)).toEqual(["inv-1"]);
			});
		});

		describe("content", () => {
			it("loads the page's text in one batched call, without frontmatter", async () => {
				f.contentCalls.length = 0;
				const result = await find(reader, { filters: OPEN_INVOICES });
				expect(f.contentCalls).toHaveLength(1);
				expect(f.contentCalls[0].sort()).toEqual(["inv-1", "inv-2", "inv-4"]);
				const alpha = result.nodes.find((n) => n.uuid === "inv-1");
				expect(alpha?.content).toBe("Body of Invoice Alpha.");
				expect(alpha?.contentTruncated).toBeUndefined();
			});

			it("truncates long text with a marker and caps maxCharsPerNode", async () => {
				const short = await find(reader, {
					filters: [["title", "==", "Supply contract"]],
					maxCharsPerNode: 100,
				});
				expect(short.nodes[0].content).toBe(
					`${"x".repeat(100)}\n\n[truncated: first 100 of 10000 characters]`,
				);
				expect(short.nodes[0].contentTruncated).toBe(true);

				const capped = await find(reader, {
					filters: [["title", "==", "Supply contract"]],
					maxCharsPerNode: 50_000,
				});
				expect(capped.nodes[0].content).toStartWith("x".repeat(8000) + "\n\n[truncated");
			});

			it("skips the content read when includeContent is false", async () => {
				f.contentCalls.length = 0;
				const result = await find(reader, { filters: OPEN_INVOICES, includeContent: false });
				expect(f.contentCalls).toHaveLength(0);
				expect(result.nodes.every((n) => n.content === undefined)).toBe(true);
			});
		});

		describe("errors", () => {
			const failure = async (options: FindDocumentsOptions) => {
				const result = await f.service().findDocuments(reader, options);
				expect(result.isLeft()).toBe(true);
				expect(result.value).toBeInstanceOf(BadRequestError);
				return (result.value as BadRequestError).message;
			};

			it("requires a query or filters", async () => {
				expect(await failure({})).toContain("needs a query, filters, or both");
				expect(await failure({ filters: [] })).toContain("needs a query");
				expect(await failure({ filters: [[]] })).toContain("needs a query");
				expect(await failure({ query: "   " })).toContain("needs a query");
			});

			it("rejects invalid filters and fulltext filters", async () => {
				expect(
					await failure({ filters: [["title", "like", "x"]] as unknown as NodeFilters }),
				).toContain("Invalid find_documents options");
				expect(await failure({ filters: [["fulltext", "match", "x"]] })).toContain(
					"Use query",
				);
			});
		});
	});
}

describe("FindService.findDocuments limits", () => {
	it("returns 10 nodes by default and never more than 20, with the full total", async () => {
		const repository = new InMemoryNodeRepository();
		const service = new NodeService({
			repository,
			storage: new InMemoryStorageProvider(),
			bus: new InMemoryEventBus(),
			configRepo: new InMemoryConfigurationRepository(),
		});
		for (let i = 0; i < 25; i++) {
			const created = await service.create(admin, {
				title: `Bulk ${i}`,
				mimetype: Nodes.FOLDER_MIMETYPE,
				parent: Nodes.ROOT_FOLDER_UUID,
				tags: ["bulk"],
			});
			if (created.isLeft()) throw created.value;
		}
		const filters: NodeFilters = [["tags", "contains", "bulk"]];

		const byDefault = await service.findDocuments(admin, { filters });
		expect(byDefault.right.returned).toBe(10);
		expect(byDefault.right.total).toBe(25);

		const capped = await service.findDocuments(admin, { filters, limit: 500 });
		expect(capped.right.returned).toBe(20);
		expect(capped.right.nodes).toHaveLength(20);
		expect(capped.right.total).toBe(25);
	});

	it("rejects a non-positive limit", async () => {
		const service = new NodeService({
			repository: new InMemoryNodeRepository(),
			storage: new InMemoryStorageProvider(),
			bus: new InMemoryEventBus(),
			configRepo: new InMemoryConfigurationRepository(),
		});
		const result = await service.findDocuments(admin, { query: "x", limit: 0 });
		expect(result.isLeft()).toBe(true);
		expect(result.value).toBeInstanceOf(BadRequestError);
	});
});
