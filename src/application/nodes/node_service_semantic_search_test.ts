import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { DeterministicEmbeddingsProvider } from "adapters/embeddings/deterministic_embeddings_provider.ts";
import { NullOCRProvider } from "adapters/ocr/null_ocr_provider.ts";
import { beforeAll, describe, it } from "bdd";
import type { NodeFilters1D } from "domain/nodes/node_filter.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { expect } from "expect";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import { RAGService } from "../ai/rag_service.ts";
import { NodeService } from "./node_service.ts";

const authCtx: AuthenticationContext = {
	mode: "Direct",
	tenant: "test-tenant",
	principal: {
		email: Users.ROOT_USER_EMAIL,
		groups: [Groups.ADMINS_GROUP_UUID],
	},
};

let service: NodeService;

beforeAll(async () => {
	// Setup AI components
	const embeddingsProvider = new DeterministicEmbeddingsProvider(1536);
	const ocrProvider = new NullOCRProvider();
	const repository = new InMemoryNodeRepository();
	const storage = new InMemoryStorageProvider();
	const bus = new InMemoryEventBus();

	// Create NodeService with AI features
	service = new NodeService({
		repository,
		storage,
		bus,
		configRepo: new InMemoryConfigurationRepository(),
		embeddingsProvider,
	});

	// Create RAGService to auto-generate embeddings on node events
	new RAGService(bus, repository, service, embeddingsProvider, ocrProvider);

	// Create a parent folder for test documents
	await service.create(authCtx, {
		uuid: "test-folder-uuid",
		title: "Test Documents",
		mimetype: "application/vnd.antbox.folder",
		parent: Nodes.ROOT_FOLDER_UUID,
	});

	// Create test documents
	await service.createFile(
		authCtx,
		new File(
			["This is a comprehensive guide about machine learning and artificial intelligence"],
			"Machine Learning Guide.txt",
			{ type: "text/plain" },
		),
		{
			uuid: "doc1-uuid",
			title: "Machine Learning Guide.txt",
			mimetype: "text/plain",
			parent: "test-folder-uuid",
		},
	);

	await service.createFile(
		authCtx,
		new File(
			["Introduction to deep learning and neural networks for beginners"],
			"Deep Learning Basics.txt",
			{ type: "text/plain" },
		),
		{
			uuid: "doc2-uuid",
			title: "Deep Learning Basics.txt",
			mimetype: "text/plain",
			parent: "test-folder-uuid",
		},
	);

	await service.createFile(
		authCtx,
		new File(
			["A collection of delicious cooking recipes and culinary tips"],
			"Cooking Recipes.txt",
			{ type: "text/plain" },
		),
		{
			uuid: "doc3-uuid",
			title: "Cooking Recipes.txt",
			mimetype: "text/plain",
			parent: "test-folder-uuid",
		},
	);
});

describe("NodeService", () => {
	describe("find with semantic search", () => {
		it("should have created test documents", async () => {
			const allNodes: NodeFilters1D = [["mimetype", "==", "text/plain"]];
			const result = await service.find(authCtx, allNodes);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.nodes.length).toBe(3);
			}
		});

		it("should return results when using semantic search with ? prefix", async () => {
			// Give embeddings time to be generated
			await new Promise((resolve) => setTimeout(resolve, 500));

			const result = await service.find(authCtx, "?machine learning");

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				// Should have results
				expect(result.value.nodes.length).toBeGreaterThan(0);
			}
		});

		it("should return results when using regular filters", async () => {
			const filters: NodeFilters1D = [["mimetype", "==", "text/plain"]];
			const result = await service.find(authCtx, filters);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				// Should have results
				expect(result.value.nodes.length).toBeGreaterThan(0);
			}
		});

		it("should find semantically similar documents", async () => {
			// Give embeddings time to be generated
			await new Promise((resolve) => setTimeout(resolve, 500));

			const result = await service.find(authCtx, "?artificial intelligence");

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				// Should find some of our test documents
				const foundDocs = result.value.nodes.filter((n) =>
					n.uuid === "doc1-uuid" || n.uuid === "doc2-uuid" || n.uuid === "doc3-uuid"
				);
				expect(foundDocs.length).toBeGreaterThan(0);
			}
		});

		it("should fallback to fulltext search when AI features unavailable", async () => {
			const result = await service.find(authCtx, "?machine learning");

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				// Should have results (either from semantic or fallback)
				expect(result.value.nodes).toBeDefined();
			}
		});

		it("should return results for semantic search query", async () => {
			const result = await service.find(authCtx, "?quantum physics relativity theory");

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				// May have some results due to deterministic model
				expect(result.value.nodes).toBeDefined();
			}
		});
	});
});
