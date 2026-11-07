import { beforeAll, describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import type { EmbeddingsProvider, EmbeddingsResult } from "domain/ai/embeddings_provider.ts";
import { EmbeddingsGeneratedEvent } from "domain/ai/embeddings_generated_event.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { type Either, right } from "shared/either.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import type { Event } from "shared/event.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import { NodeService } from "./node_service.ts";

const DIMENSIONS = 8;

function vectorWithScore(score: number): number[] {
	const vector = new Array(DIMENSIONS).fill(0);
	vector[0] = score;
	vector[1] = Math.sqrt(1 - score * score);
	return vector;
}

/** Embeds every query as the first axis, so a stored vector's score is its first component. */
class AxisEmbeddings implements EmbeddingsProvider {
	constructor(private readonly threshold: number) {}

	embed(texts: string[]): Promise<Either<AntboxError, EmbeddingsResult>> {
		return Promise.resolve(right({
			embeddings: texts.map(() => vectorWithScore(1)),
			model: "axis",
			usage: { promptTokens: 3, completionTokens: 0, totalTokens: 3 },
		}));
	}

	relevanceThreshold(): number {
		return this.threshold;
	}
}

const rootCtx: AuthenticationContext = {
	mode: "Direct",
	tenant: "tenant-x",
	principal: { email: Users.ROOT_USER_EMAIL, groups: [Groups.ADMINS_GROUP_UUID] },
};

const readerCtx: AuthenticationContext = {
	mode: "Direct",
	tenant: "tenant-x",
	principal: { email: "reader@tenant.test", groups: ["readers"] },
};

async function build(threshold: number) {
	const repository = new InMemoryNodeRepository();
	const bus = new InMemoryEventBus();
	const events: Event[] = [];
	bus.subscribe(EmbeddingsGeneratedEvent.EVENT_ID, { handle: (e: Event) => void events.push(e) });
	const service = new NodeService({
		repository,
		storage: new InMemoryStorageProvider(),
		bus,
		configRepo: new InMemoryConfigurationRepository(),
		embeddingsProvider: new AxisEmbeddings(threshold),
	});

	const folder = async (uuid: string, readable: boolean) => {
		const result = await service.create(rootCtx, {
			uuid,
			title: uuid,
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
		expect(result.isRight()).toBe(true);
	};

	const doc = async (uuid: string, parent: string, score: number) => {
		const result = await service.create(rootCtx, {
			uuid,
			title: uuid,
			mimetype: Nodes.FOLDER_MIMETYPE,
			parent,
		});
		expect(result.isRight()).toBe(true);
		await repository.upsertEmbedding(uuid, vectorWithScore(score), `content of ${uuid}`);
	};

	return { service, repository, events, folder, doc };
}

describe("FindService semantic search", () => {
	describe("permissions before the cut", () => {
		let t: Awaited<ReturnType<typeof build>>;

		beforeAll(async () => {
			t = await build(0.6);
			await t.folder("private", false);
			await t.folder("public", true);
			for (let i = 0; i < 120; i++) {
				await t.doc(`private-${String(i).padStart(3, "0")}`, "private", 0.99 - i * 0.0001);
			}
			await t.doc("public-a", "public", 0.9);
			await t.doc("public-b", "public", 0.8);
			await t.doc("public-c", "public", 0.7);
			// Let the indexing-free event bus settle.
			await new Promise((r) => setTimeout(r, 10));
		});

		it("finds readable nodes even with more than 100 better unreadable nodes", async () => {
			const result = await t.service.find(readerCtx, "?anything");
			expect(result.isRight()).toBe(true);
			expect(result.right.nodes.map((n) => n.uuid)).toEqual([
				"public-a",
				"public-b",
				"public-c",
			]);
			expect(Object.keys(result.right.scores ?? {})).toEqual([
				"public-a",
				"public-b",
				"public-c",
			]);
		});

		it("paginates the readable results consistently", async () => {
			const page1 = await t.service.find(readerCtx, "?anything", 2, 1);
			const page2 = await t.service.find(readerCtx, "?anything", 2, 2);
			expect(page1.right.nodes.map((n) => n.uuid)).toEqual(["public-a", "public-b"]);
			expect(page2.right.nodes.map((n) => n.uuid)).toEqual(["public-c"]);
		});

		it("returns the readable documents with content for agents", async () => {
			const before = t.events.length;
			const result = await t.service.semanticDocuments(readerCtx, "anything", 2);
			expect(result.isRight()).toBe(true);
			expect(result.right.map((d) => d.uuid)).toEqual(["public-a", "public-b"]);
			expect(result.right[0].content).toBe("content of public-a");
			expect(result.right[0].title).toBe("public-a");
			await new Promise((r) => setTimeout(r, 0));
			const usage = t.events.slice(before) as EmbeddingsGeneratedEvent[];
			expect(usage).toHaveLength(1);
			expect(usage[0].userEmail).toBe("reader@tenant.test");
			expect(usage[0].tenant).toBe("tenant-x");
			expect(usage[0].payload.context).toBe("search");
		});
	});

	describe("relevance threshold", () => {
		it("lowers the threshold by 10 points when nothing passes it", async () => {
			const t = await build(0.6);
			await t.folder("docs", true);
			await t.doc("near-a", "docs", 0.55);
			await t.doc("near-b", "docs", 0.52);
			await t.doc("far-doc", "docs", 0.3);

			const result = await t.service.find(rootCtx, "?anything");
			expect(result.right.nodes.map((n) => n.uuid)).toEqual(["near-a", "near-b"]);

			const documents = await t.service.semanticDocuments(rootCtx, "anything", 10);
			expect(documents.right.map((d) => d.uuid)).toEqual(["near-a", "near-b"]);
		});

		it("returns nothing when nothing passes the lowered threshold", async () => {
			const t = await build(0.6);
			await t.folder("docs", true);
			await t.doc("far-a", "docs", 0.45);
			await t.doc("far-b", "docs", 0.2);

			const result = await t.service.find(rootCtx, "?far-a");
			expect(result.isRight()).toBe(true);
			expect(result.right.nodes).toEqual([]);

			const documents = await t.service.semanticDocuments(rootCtx, "anything", 10);
			expect(documents.right).toEqual([]);
		});

		it("keeps the provider threshold when the best result passes it", async () => {
			const t = await build(0.6);
			await t.folder("docs", true);
			await t.doc("good", "docs", 0.7);
			await t.doc("weak", "docs", 0.55);

			const result = await t.service.find(rootCtx, "?anything");
			expect(result.right.nodes.map((n) => n.uuid)).toEqual(["good"]);
		});
	});
});
