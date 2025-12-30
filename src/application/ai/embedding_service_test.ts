import { describe, it } from "bdd";
import { expect } from "expect";
import { EmbeddingService, type EmbeddingServiceContext } from "./embedding_service.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { DeterministicModel } from "adapters/models/deterministic.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import { NodeDeletedEvent } from "domain/nodes/node_deleted_event.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import { FolderNode } from "domain/nodes/folder_node.ts";
import { right } from "shared/either.ts";
import type { NodeService } from "application/nodes/node_service.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import type { Node } from "domain/nodes/node.ts";
import type { EventBus } from "shared/event_bus.ts";
import { EventHandler } from "shared/event_handler.ts";
import { Event } from "shared/event.ts";

// Mock EventBus
class MockEventBus implements EventBus {
	private handlers = new Map<string, EventHandler<Event>[]>();

	async publish() {}

	subscribe(eventId: string, handler: EventHandler<Event>) {
		if (!this.handlers.has(eventId)) {
			this.handlers.set(eventId, []);
		}
		this.handlers.get(eventId)!.push(handler);
	}

	unsubscribe() {}
}

// Mock NodeService
class MockNodeService {
	private files = new Map<string, File>();

	async export(
		_ctx: unknown,
		uuid: string,
	): Promise<import("shared/either.ts").Either<AntboxError, File>> {
		const file = this.files.get(uuid);
		if (!file) {
			return right(new File([], "not-found"));
		}
		return right(file);
	}

	async get(
		_ctx: unknown,
		uuid: string,
	): Promise<import("shared/either.ts").Either<AntboxError, Node>> {
		// Return a mock FileNode for testing
		const file = this.files.get(uuid);
		if (!file) {
			const nodeOrErr = FileNode.create({
				uuid: uuid,
				title: "not-found.txt",
				mimetype: "text/plain",
				size: 0,
				owner: "user@example.com",
				group: "test-group",
				parent: "root",
			});
			return nodeOrErr as import("shared/either.ts").Either<AntboxError, Node>;
		}

		const nodeOrErr = FileNode.create({
			uuid: uuid,
			title: "test.txt",
			mimetype: file.type,
			size: file.size,
			owner: "user@example.com",
			group: "test-group",
			parent: "root",
		});
		return nodeOrErr as import("shared/either.ts").Either<AntboxError, Node>;
	}

	// Helper method for tests
	setFile(uuid: string, content: string, mimetype: string) {
		this.files.set(uuid, new File([content], "test.txt", { type: mimetype }));
	}
}

describe("EmbeddingService", () => {
	describe("handleNodeCreated", () => {
		it("should generate embedding for FileNode with supported mimetype", async () => {
			const nodeService = new MockNodeService() as unknown as NodeService;
			const embeddingModel = new DeterministicModel("text-embedding-3-small", 1536);
			const ocrModel = new DeterministicModel("deterministic-ocr", 1536);
			const repository = new InMemoryNodeRepository();
			const bus = new MockEventBus();

			const context: EmbeddingServiceContext = {
				embeddingModel,
				ocrModel,
				nodeService,
				repository,
				bus,
			};

			const embeddingService = new EmbeddingService(context);

			const fileNodeOrErr = FileNode.create({
				uuid: "test-uuid",
				title: "test.txt",
				mimetype: "text/plain",
				size: 100,
				owner: "user@example.com",
				group: "test-group",
				parent: "root",
			});

			expect(fileNodeOrErr.isRight()).toBe(true);
			const fileNode = fileNodeOrErr.right;

			// Add node to repository first
			await repository.add(fileNode);

			(nodeService as unknown as MockNodeService).setFile(
				"test-uuid",
				"This is test content",
				"text/plain",
			);

			const event = new NodeCreatedEvent("user@example.com", "test-tenant", fileNode);
			await embeddingService.handleNodeCreated(event);

			// Verify embedding was stored by doing a vector search
			const searchResult = await repository.vectorSearch(
				new Array(1536).fill(0),
				10,
			);
			expect(searchResult.isRight()).toBe(true);
			if (searchResult.isRight()) {
				expect(searchResult.value.nodes.length).toBe(1);
				expect(searchResult.value.nodes[0].node.uuid).toBe("test-uuid");
			}
		});

		it("should not generate embedding for FileNode with zero size", async () => {
			const nodeService = new MockNodeService() as unknown as NodeService;
			const embeddingModel = new DeterministicModel("text-embedding-3-small", 1536);
			const ocrModel = new DeterministicModel("deterministic-ocr", 1536);
			const repository = new InMemoryNodeRepository();
			const bus = new MockEventBus();

			const context: EmbeddingServiceContext = {
				embeddingModel,
				ocrModel,
				nodeService,
				repository,
				bus,
			};

			const embeddingService = new EmbeddingService(context);

			const fileNodeOrErr = FileNode.create({
				uuid: "test-uuid",
				title: "empty.txt",
				mimetype: "text/plain",
				size: 0,
				owner: "user@example.com",
				group: "test-group",
				parent: "root",
			});
			expect(fileNodeOrErr.isRight()).toBe(true);
			const fileNode = fileNodeOrErr.right;

			await repository.add(fileNode);

			const event = new NodeCreatedEvent("user@example.com", "test-tenant", fileNode);
			await embeddingService.handleNodeCreated(event);

			// Verify no embedding was stored
			const searchResult = await repository.vectorSearch(
				new Array(1536).fill(0),
				10,
			);
			expect(searchResult.isRight()).toBe(true);
			if (searchResult.isRight()) {
				expect(searchResult.value.nodes.length).toBe(0);
			}
		});

		it("should not generate embedding for FolderNode", async () => {
			const nodeService = new MockNodeService() as unknown as NodeService;
			const embeddingModel = new DeterministicModel("text-embedding-3-small", 1536);
			const ocrModel = new DeterministicModel("deterministic-ocr", 1536);
			const repository = new InMemoryNodeRepository();
			const bus = new MockEventBus();

			const context: EmbeddingServiceContext = {
				embeddingModel,
				ocrModel,
				nodeService,
				repository,
				bus,
			};

			const embeddingService = new EmbeddingService(context);

			const folderNodeOrErr = FolderNode.create({
				uuid: "folder-uuid",
				title: "test-folder",
				owner: "user@example.com",
				group: "test-group",
				parent: "root",
			});

			expect(folderNodeOrErr.isRight()).toBe(true);
			const folderNode = folderNodeOrErr.right;

			await repository.add(folderNode);

			const event = new NodeCreatedEvent("user@example.com", "test-tenant", folderNode);
			await embeddingService.handleNodeCreated(event);

			// Verify no embedding was stored
			const searchResult = await repository.vectorSearch(
				new Array(1536).fill(0),
				10,
			);
			expect(searchResult.isRight()).toBe(true);
			if (searchResult.isRight()) {
				expect(searchResult.value.nodes.length).toBe(0);
			}
		});

		it("should not generate embedding for FileNode with unsupported mimetype", async () => {
			const nodeService = new MockNodeService() as unknown as NodeService;
			const embeddingModel = new DeterministicModel("text-embedding-3-small", 1536);
			const ocrModel = new DeterministicModel("deterministic-ocr", 1536);
			const repository = new InMemoryNodeRepository();
			const bus = new MockEventBus();

			const context: EmbeddingServiceContext = {
				embeddingModel,
				ocrModel,
				nodeService,
				repository,
				bus,
			};

			const embeddingService = new EmbeddingService(context);

			const fileNodeOrErr = FileNode.create({
				uuid: "test-uuid",
				title: "test.jpg",
				mimetype: "image/jpeg",
				size: 100,
				owner: "user@example.com",
				group: "test-group",
				parent: "root",
			});

			expect(fileNodeOrErr.isRight()).toBe(true);
			const fileNode = fileNodeOrErr.right;

			await repository.add(fileNode);

			const event = new NodeCreatedEvent("user@example.com", "test-tenant", fileNode);
			await embeddingService.handleNodeCreated(event);

			// Verify no embedding was stored
			const searchResult = await repository.vectorSearch(
				new Array(1536).fill(0),
				10,
			);
			expect(searchResult.isRight()).toBe(true);
			if (searchResult.isRight()) {
				expect(searchResult.value.nodes.length).toBe(0);
			}
		});
	});

	describe("handleNodeUpdated", () => {
		it("should update embedding when node is updated", async () => {
			const nodeService = new MockNodeService() as unknown as NodeService;
			const embeddingModel = new DeterministicModel("text-embedding-3-small", 1536);
			const ocrModel = new DeterministicModel("deterministic-ocr", 1536);
			const repository = new InMemoryNodeRepository();
			const bus = new MockEventBus();

			const context: EmbeddingServiceContext = {
				embeddingModel,
				ocrModel,
				nodeService,
				repository,
				bus,
			};

			const embeddingService = new EmbeddingService(context);

			const fileNodeOrErr = FileNode.create({
				uuid: "test-uuid",
				title: "test.txt",
				mimetype: "text/plain",
				size: 100,
				owner: "user@example.com",
				group: "test-group",
				parent: "root",
			});

			expect(fileNodeOrErr.isRight()).toBe(true);
			const fileNode = fileNodeOrErr.right;

			await repository.add(fileNode);

			// Create initial embedding
			(nodeService as unknown as MockNodeService).setFile(
				"test-uuid",
				"Initial content",
				"text/plain",
			);
			const createEvent = new NodeCreatedEvent("user@example.com", "test-tenant", fileNode);
			await embeddingService.handleNodeCreated(createEvent);

			// Update the file content
			(nodeService as unknown as MockNodeService).setFile(
				"test-uuid",
				"Updated content",
				"text/plain",
			);
			const updateEvent = new NodeUpdatedEvent(
				"user@example.com",
				"test-tenant",
				{
					uuid: "test-uuid",
					oldValues: {},
					newValues: { title: "test.txt" },
				},
			);
			await embeddingService.handleNodeUpdated(updateEvent);

			// Verify embedding exists (should be updated)
			const searchResult = await repository.vectorSearch(
				new Array(1536).fill(0),
				10,
			);
			expect(searchResult.isRight()).toBe(true);
			if (searchResult.isRight()) {
				expect(searchResult.value.nodes.length).toBe(1);
				expect(searchResult.value.nodes[0].node.uuid).toBe("test-uuid");
			}
		});
	});
});
