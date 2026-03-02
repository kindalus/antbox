import { describe, it } from "bdd";
import { expect } from "expect";
import { RAG_TOP_K, RAGService } from "./rag_service.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { DeterministicEmbeddingsProvider } from "adapters/embeddings/deterministic_embeddings_provider.ts";
import { TextOCRProvider } from "adapters/ocr/text_ocr_provider.ts";
import { NullOCRProvider } from "adapters/ocr/null_ocr_provider.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import { FolderNode } from "domain/nodes/folder_node.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import { NodeDeletedEvent } from "domain/nodes/node_deleted_event.ts";
import { left, right } from "shared/either.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import type { EventBus } from "shared/event_bus.ts";
import type { EventHandler } from "shared/event_handler.ts";
import type { Event } from "shared/event.ts";
import type { NodeService } from "application/nodes/node_service.ts";
import type { Node } from "domain/nodes/node.ts";

// ============================================================================
// CAPTURING EVENT BUS — allows test to fire events at subscribed handlers
// ============================================================================

class CapturingEventBus implements EventBus {
	private handlers = new Map<string, EventHandler<Event>[]>();

	async publish() {}

	subscribe(eventId: string, handler: EventHandler<Event>) {
		if (!this.handlers.has(eventId)) {
			this.handlers.set(eventId, []);
		}
		this.handlers.get(eventId)!.push(handler);
	}

	unsubscribe() {}

	async fire(eventId: string, event: Event): Promise<void> {
		for (const handler of this.handlers.get(eventId) ?? []) {
			await handler.handle(event);
		}
	}
}

// ============================================================================
// MOCK NODE SERVICE
// ============================================================================

class MockNodeService {
	private files = new Map<string, File>();
	private nodes = new Map<string, Node>();

	async export(
		_ctx: unknown,
		uuid: string,
	): Promise<import("shared/either.ts").Either<AntboxError, File>> {
		const file = this.files.get(uuid);
		if (!file) {
			return left({ errorCode: "NotFound", message: `File not found: ${uuid}` } as AntboxError);
		}
		return right(file);
	}

	async get(
		_ctx: unknown,
		uuid: string,
	): Promise<import("shared/either.ts").Either<AntboxError, Node>> {
		const node = this.nodes.get(uuid);
		if (!node) {
			return left(
				{ errorCode: "NotFound", message: `Node not found: ${uuid}` } as AntboxError,
			);
		}
		return right(node);
	}

	setFile(uuid: string, content: string, mimetype: string) {
		this.files.set(uuid, new File([content], `${uuid}.txt`, { type: mimetype }));
	}

	setNode(node: Node) {
		this.nodes.set(node.uuid, node);
	}
}

class CountingOCRProvider {
	public calls = 0;

	ocr(_file: File): Promise<import("shared/either.ts").Either<AntboxError, string>> {
		this.calls += 1;
		return Promise.resolve(right("counted"));
	}
}

// ============================================================================
// HELPERS
// ============================================================================

function makeFileNode(uuid: string, mimetype = "text/plain", size = 100) {
	const result = FileNode.create({
		uuid,
		title: `${uuid}.txt`,
		mimetype,
		size,
		owner: "user@test.com",
		group: "group",
		parent: "root",
	});
	expect(result.isRight()).toBe(true);
	return result.right;
}

function makeFolderNode(uuid: string) {
	const result = FolderNode.create({
		uuid,
		title: `folder-${uuid}`,
		description: "A test folder",
		owner: "user@test.com",
		group: "group",
		parent: "root",
	});
	expect(result.isRight()).toBe(true);
	return result.right;
}

function buildService(
	mockNodeService: MockNodeService,
	bus: CapturingEventBus,
	repository = new InMemoryNodeRepository(),
	useTextOCR = true,
) {
	const embeddingsProvider = new DeterministicEmbeddingsProvider(128);
	const ocrProvider = useTextOCR ? new TextOCRProvider() : new NullOCRProvider();

	const service = new RAGService(
		bus,
		repository,
		mockNodeService as unknown as NodeService,
		embeddingsProvider,
		ocrProvider,
	);

	return { service, repository };
}

// ============================================================================
// TESTS
// ============================================================================

describe("RAGService", () => {
	describe("constants", () => {
		it("exports RAG_TOP_K > 0", () => {
			expect(RAG_TOP_K).toBeGreaterThan(0);
		});
	});

	describe("indexing — NodeCreated", () => {
		it("stores embedding for FileNode with supported mimetype", async () => {
			const mockNodeService = new MockNodeService();
			const bus = new CapturingEventBus();
			const repository = new InMemoryNodeRepository();
			buildService(mockNodeService, bus, repository);

			const node = makeFileNode("file-1", "text/plain", 50);
			await repository.add(node);
			mockNodeService.setFile("file-1", "Hello indexing world", "text/plain");

			await bus.fire(NodeCreatedEvent.EVENT_ID, new NodeCreatedEvent("u", "t", node));

			const search = await repository.vectorSearch(new Array(128).fill(0), 10);
			expect(search.isRight()).toBe(true);
			if (search.isRight()) {
				const hit = search.value.nodes.find((n) => n.node.uuid === "file-1");
				expect(hit).toBeDefined();
				if (hit) {
					expect(hit.content).toContain("---");
					expect(hit.content).toContain("uuid: file-1");
					expect(hit.content).toContain("Hello indexing world");
				}
			}
		});

		it("stores embedding for FileNode with zero size using metadata only", async () => {
			const mockNodeService = new MockNodeService();
			const bus = new CapturingEventBus();
			const repository = new InMemoryNodeRepository();
			buildService(mockNodeService, bus, repository);

			const node = makeFileNode("empty-file", "text/plain", 0);
			await repository.add(node);

			await bus.fire(NodeCreatedEvent.EVENT_ID, new NodeCreatedEvent("u", "t", node));

			const search = await repository.vectorSearch(new Array(128).fill(0), 10);
			expect(search.isRight()).toBe(true);
			if (search.isRight()) {
				const hit = search.value.nodes.find((n) => n.node.uuid === "empty-file");
				expect(hit).toBeDefined();
				if (hit) {
					expect(hit.content).toContain("---");
					expect(hit.content).toContain("uuid: empty-file");
					expect(hit.content).not.toContain("**Content**");
				}
			}
		});

		it("stores embedding for unsupported file mimetype with metadata fallback", async () => {
			const mockNodeService = new MockNodeService();
			const bus = new CapturingEventBus();
			const repository = new InMemoryNodeRepository();
			buildService(mockNodeService, bus, repository);

			const node = makeFileNode("image-file", "image/jpeg", 1000);
			await repository.add(node);

			await bus.fire(NodeCreatedEvent.EVENT_ID, new NodeCreatedEvent("u", "t", node));

			const search = await repository.vectorSearch(new Array(128).fill(0), 10);
			expect(search.isRight()).toBe(true);
			if (search.isRight()) {
				const hit = search.value.nodes.find((n) => n.node.uuid === "image-file");
				expect(hit).toBeDefined();
				if (hit) {
					expect(hit.content).toContain("---");
					expect(hit.content).toContain("mimetype: image/jpeg");
				}
			}
		});

		it("stores embedding for FolderNode from metadata (no OCR)", async () => {
			const mockNodeService = new MockNodeService();
			const bus = new CapturingEventBus();
			const repository = new InMemoryNodeRepository();
			buildService(mockNodeService, bus, repository);

			const folder = makeFolderNode("folder-1");
			await repository.add(folder);

			await bus.fire(NodeCreatedEvent.EVENT_ID, new NodeCreatedEvent("u", "t", folder));

			const search = await repository.vectorSearch(new Array(128).fill(0), 10);
			expect(search.isRight()).toBe(true);
			if (search.isRight()) {
				const hit = search.value.nodes.find((n) => n.node.uuid === "folder-1");
				expect(hit).toBeDefined();
				if (hit) {
					expect(hit.content).toContain("---");
					expect(hit.content).toContain("uuid: folder-1");
					expect(hit.content).not.toContain("**Content**");
				}
			}
		});

		it("includes aspects and properties in stored markdown frontmatter", async () => {
			const mockNodeService = new MockNodeService();
			const bus = new CapturingEventBus();
			const repository = new InMemoryNodeRepository();
			buildService(mockNodeService, bus, repository);

			const node = FileNode.create({
				uuid: "aspect-file",
				title: "aspect-file.txt",
				mimetype: "text/plain",
				size: 10,
				owner: "user@test.com",
				group: "group",
				parent: "root",
				aspects: ["finance", "invoice"],
				properties: {
					"finance:amount": 99.5,
					"invoice:number": "INV-2026-001",
				},
			});

			expect(node.isRight()).toBe(true);
			await repository.add(node.right);
			mockNodeService.setFile("aspect-file", "Aspect content", "text/plain");

			await bus.fire(NodeCreatedEvent.EVENT_ID, new NodeCreatedEvent("u", "t", node.right));

			const search = await repository.vectorSearch(new Array(128).fill(0), 10);
			expect(search.isRight()).toBe(true);
			if (search.isRight()) {
				const hit = search.value.nodes.find((n) => n.node.uuid === "aspect-file");
				expect(hit).toBeDefined();
				if (hit) {
					expect(hit.content).toContain("aspects:");
					expect(hit.content).toContain("finance");
					expect(hit.content).toContain("invoice:number");
					expect(hit.content).toContain("Aspect content");
				}
			}
		});
	});

	describe("indexing — NodeUpdated", () => {
		it("updates embedding when node is updated", async () => {
			const mockNodeService = new MockNodeService();
			const bus = new CapturingEventBus();
			const repository = new InMemoryNodeRepository();
			buildService(mockNodeService, bus, repository);

			const node = makeFileNode("update-file", "text/plain", 50);
			await repository.add(node);
			mockNodeService.setFile("update-file", "Initial content", "text/plain");
			mockNodeService.setNode(node);

			await bus.fire(NodeCreatedEvent.EVENT_ID, new NodeCreatedEvent("u", "t", node));

			// Update
			mockNodeService.setFile("update-file", "Updated content", "text/plain");
			await bus.fire(
				NodeUpdatedEvent.EVENT_ID,
				new NodeUpdatedEvent("u", "t", {
					uuid: "update-file",
					oldValues: {},
					newValues: { title: "update-file.txt" },
				}),
			);

			const search = await repository.vectorSearch(new Array(128).fill(0), 10);
			expect(search.isRight()).toBe(true);
			if (search.isRight()) {
				expect(search.value.nodes.some((n) => n.node.uuid === "update-file")).toBe(true);
			}
		});
	});

	describe("indexing — NodeDeleted", () => {
		it("removes embedding when node is deleted", async () => {
			const mockNodeService = new MockNodeService();
			const bus = new CapturingEventBus();
			const repository = new InMemoryNodeRepository();
			buildService(mockNodeService, bus, repository);

			const folder = makeFolderNode("delete-me");
			await repository.add(folder);

			await bus.fire(NodeCreatedEvent.EVENT_ID, new NodeCreatedEvent("u", "t", folder));

			await bus.fire(
				NodeDeletedEvent.EVENT_ID,
				new NodeDeletedEvent("u", "t", {
					uuid: "delete-me",
					fid: "delete-me",
					title: "delete-me",
					parent: "root",
					mimetype: "inode/directory",
					owner: "u",
					createdTime: new Date().toISOString(),
					modifiedTime: new Date().toISOString(),
				}),
			);

			const search = await repository.vectorSearch(new Array(128).fill(0), 10);
			expect(search.isRight()).toBe(true);
			if (search.isRight()) {
				expect(search.value.nodes.some((n) => n.node.uuid === "delete-me")).toBe(false);
			}
		});
	});

	describe("query", () => {
		it("returns RagDocument[] with uuid, title, score, content", async () => {
			const mockNodeService = new MockNodeService();
			const bus = new CapturingEventBus();
			const repository = new InMemoryNodeRepository();
			const embeddingsProvider = new DeterministicEmbeddingsProvider(128);
			const service = new RAGService(
				bus,
				repository,
				mockNodeService as unknown as NodeService,
				embeddingsProvider,
				new NullOCRProvider(),
			);

			const folder = makeFolderNode("query-folder");
			await repository.add(folder);
			await bus.fire(NodeCreatedEvent.EVENT_ID, new NodeCreatedEvent("u", "t", folder));

			const result = await service.query("test query", 5, 0.0);
			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.length).toBeGreaterThan(0);
				const doc = result.value[0];
				expect(doc.uuid).toBe("query-folder");
				expect(doc.title).toBeDefined();
				expect(doc.score).toBeGreaterThanOrEqual(0);
				expect(typeof doc.content).toBe("string");
				expect(doc.content).toContain("---");
				expect(doc.content).toContain("uuid: query-folder");
			}
		});

		it("does not call OCR in semantic query path", async () => {
			const mockNodeService = new MockNodeService();
			const bus = new CapturingEventBus();
			const repository = new InMemoryNodeRepository();
			const embeddingsProvider = new DeterministicEmbeddingsProvider(128);
			const ocrProvider = new CountingOCRProvider();
			const service = new RAGService(
				bus,
				repository,
				mockNodeService as unknown as NodeService,
				embeddingsProvider,
				ocrProvider,
			);

			const folder = makeFolderNode("query-no-ocr");
			await repository.add(folder);

			const contentMd = "---\nuuid: query-no-ocr\ntitle: query-no-ocr\n---";
			const embeddingOrErr = await embeddingsProvider.embed([contentMd]);
			expect(embeddingOrErr.isRight()).toBe(true);
			if (embeddingOrErr.isRight()) {
				await repository.upsertEmbedding("query-no-ocr", embeddingOrErr.value[0], contentMd);
			}

			const result = await service.query("query-no-ocr", 5, 0.0);
			expect(result.isRight()).toBe(true);
			expect(ocrProvider.calls).toBe(0);
		});

		it("returns empty array when nothing passes threshold=1.0", async () => {
			const mockNodeService = new MockNodeService();
			const bus = new CapturingEventBus();
			const repository = new InMemoryNodeRepository();
			const embeddingsProvider = new DeterministicEmbeddingsProvider(128);
			const service = new RAGService(
				bus,
				repository,
				mockNodeService as unknown as NodeService,
				embeddingsProvider,
				new NullOCRProvider(),
			);

			const folder = makeFolderNode("strict-folder");
			await repository.add(folder);
			await bus.fire(NodeCreatedEvent.EVENT_ID, new NodeCreatedEvent("u", "t", folder));

			const result = await service.query("totally unrelated query zzz", 5, 1.0);
			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value).toHaveLength(0);
			}
		});
	});
});
