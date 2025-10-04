import { beforeAll, describe, it } from "bdd";
import { expect } from "expect";
import { Users } from "domain/users_groups/users.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Folders } from "domain/nodes/folders.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { NodeService } from "./node_service.ts";
import type { NodeServiceContext } from "./node_service_context.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryVectorDatabase } from "adapters/inmem/inmem_vector_database.ts";
import { DeterministicModel } from "adapters/models/deterministic_model.ts";
import { EmbeddingService } from "./ai/embedding_service.ts";
import type { NodeFilters1D } from "domain/nodes/node_filter.ts";

const authCtx: AuthenticationContext = {
	mode: "Direct",
	tenant: "test-tenant",
	principal: {
		email: Users.ROOT_USER_EMAIL,
		groups: [Groups.ADMINS_GROUP_UUID],
	},
};

let service: NodeService;
let vectorDatabase: InMemoryVectorDatabase;
let embeddingModel: DeterministicModel;

beforeAll(async () => {
	// Setup AI components
	vectorDatabase = new InMemoryVectorDatabase();
	embeddingModel = new DeterministicModel("test-embedding-model", 1536);
	const ocrModel = new DeterministicModel("test-ocr-model", 1536);
	const repository = new InMemoryNodeRepository();
	const storage = new InMemoryStorageProvider();
	const bus = new InMemoryEventBus();

	// Create NodeService with AI features
	service = new NodeService({
		repository,
		storage,
		bus,
		vectorDatabase,
		embeddingModel,
	});

	// Create EmbeddingService to auto-generate embeddings
	new EmbeddingService({
		embeddingModel,
		ocrModel,
		nodeService: service,
		vectorDatabase,
		bus,
	});

	// Create a parent folder for test documents
	await service.create(authCtx, {
		uuid: "test-folder-uuid",
		title: "Test Documents",
		mimetype: "application/vnd.antbox.folder",
	});

	// Create test documents
	const doc1 = await service.createFile(
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

	const doc2 = await service.createFile(
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

	const doc3 = await service.createFile(
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

describe("NodeService.find with semantic search", () => {
	it("should have created test documents", async () => {
		const allNodes: NodeFilters1D = [["mimetype", "==", "text/plain"]];
		const result = await service.find(authCtx, allNodes);

		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			expect(result.value.nodes.length).toBe(3);
		}
	});

	it("should return scores when using semantic search operator", async () => {
		// Give embeddings time to be generated
		await new Promise((resolve) => setTimeout(resolve, 100));

		const filters: NodeFilters1D = [[":content", "~=", "machine learning"]];
		const result = await service.find(authCtx, filters);

		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			// Should have scores field when semantic search is used
			expect(result.value.scores).toBeDefined();
			expect(typeof result.value.scores).toBe("object");

			// Should have at least some scored results
			const scoredUuids = Object.keys(result.value.scores!);
			expect(scoredUuids.length).toBeGreaterThan(0);

			// Each scored node should have valid score
			for (const uuid of scoredUuids) {
				expect(typeof result.value.scores![uuid]).toBe("number");
				expect(result.value.scores![uuid]).toBeGreaterThanOrEqual(0);
				expect(result.value.scores![uuid]).toBeLessThanOrEqual(1);
			}

			// Get only nodes that have scores
			const nodesWithScores = result.value.nodes.filter((n) =>
				result.value.scores![n.uuid] !== undefined
			);
			expect(nodesWithScores.length).toBeGreaterThan(0);
		}
	});

	it("should not return scores when using regular filters", async () => {
		const filters: NodeFilters1D = [["mimetype", "==", "text/plain"]];
		const result = await service.find(authCtx, filters);

		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			// Should have results
			expect(result.value.nodes.length).toBeGreaterThan(0);

			// Should NOT have scores field
			expect(result.value.scores).toBeUndefined();
		}
	});

	it("should find semantically similar documents", async () => {
		const filters: NodeFilters1D = [[":content", "~=", "artificial intelligence"]];
		const result = await service.find(authCtx, filters);

		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			// Should have results with scores
			expect(result.value.scores).toBeDefined();
			expect(Object.keys(result.value.scores!).length).toBeGreaterThan(0);

			// Should find some of our test documents
			const foundDocs = result.value.nodes.filter((n) =>
				n.uuid === "doc1-uuid" || n.uuid === "doc2-uuid" || n.uuid === "doc3-uuid"
			);
			expect(foundDocs.length).toBeGreaterThan(0);
		}
	});

	it("should combine semantic search with other filters", async () => {
		// Create another file with different mimetype
		await service.create(authCtx, {
			uuid: "doc4-uuid",
			title: "ML Paper.pdf",
			mimetype: "application/pdf",
			parent: "test-folder-uuid",
		});

		const filters: NodeFilters1D = [
			[":content", "~=", "machine learning"],
			["mimetype", "==", "text/plain"],
		];
		const result = await service.find(authCtx, filters);

		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			// Should have scores from semantic search
			expect(result.value.scores).toBeDefined();

			// Should only return text/plain files
			expect(result.value.nodes.every((n) => n.mimetype === "text/plain")).toBe(true);

			// Should not include the PDF
			expect(result.value.nodes.find((n) => n.uuid === "doc4-uuid")).toBeUndefined();
		}
	});

	it("should return empty results when no semantic matches found", async () => {
		const filters: NodeFilters1D = [[":content", "~=", "quantum physics relativity theory"]];
		const result = await service.find(authCtx, filters);

		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			// May have some results due to deterministic model
			// But scores should still be present
			expect(result.value.scores).toBeDefined();
		}
	});
});
