import { describe, it } from "bdd";
import { expect } from "expect";
import { RAGService, type RAGServiceOptions } from "./rag_service.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { DeterministicEmbeddingsProvider } from "adapters/embeddings/deterministic_embeddings_provider.ts";
import { TextOCRProvider } from "adapters/ocr/text_ocr_provider.ts";
import { OcrCompletedEvent } from "domain/ai/ocr_completed_event.ts";
import type { OCRProvider, OCRResult } from "domain/ai/ocr_provider.ts";
import type { EmbeddingsProvider, EmbeddingsResult } from "domain/ai/embeddings_provider.ts";
import { TransientAIError } from "domain/ai/ai_provider_errors.ts";
import { NullOCRProvider } from "adapters/ocr/null_ocr_provider.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import { FolderNode } from "domain/nodes/folder_node.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import { NodeDeletedEvent } from "domain/nodes/node_deleted_event.ts";
import { EmbeddingCreatedEvent } from "domain/nodes/embedding_created_event.ts";
import { EmbeddingUpdatedEvent } from "domain/nodes/embedding_updated_event.ts";
import { type Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import type { EventBus } from "shared/event_bus.ts";
import type { EventHandler } from "shared/event_handler.ts";
import type { Event } from "shared/event.ts";
import type { NodeService } from "application/nodes/node_service.ts";
import type { NodeLike } from "domain/node_like.ts";

// ============================================================================
// TEST DOUBLES
// ============================================================================

class CapturingEventBus implements EventBus {
	private handlers = new Map<string, EventHandler<Event>[]>();
	readonly published: Event[] = [];

	async publish(event: Event) {
		this.published.push(event);
	}

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

class MockNodeService {
	private files = new Map<string, File>();
	readonly exportCalls: string[] = [];

	async export(_ctx: unknown, uuid: string): Promise<Either<AntboxError, File>> {
		this.exportCalls.push(uuid);
		const file = this.files.get(uuid);
		if (!file) {
			return left(new AntboxError("NotFound", `File not found: ${uuid}`));
		}
		return right(file);
	}

	setFile(uuid: string, content: string, mimetype: string) {
		this.files.set(uuid, new File([content], `${uuid}.txt`, { type: mimetype }));
	}
}

class ScriptedOCRProvider implements OCRProvider {
	calls = 0;
	gate?: Promise<void>;

	constructor(private readonly results: Either<AntboxError, OCRResult>[] = []) {}

	async ocr(_file: File): Promise<Either<AntboxError, OCRResult>> {
		this.calls++;
		if (this.gate) await this.gate;
		return this.results[this.calls - 1] ?? this.results.at(-1) ?? right({ text: "scanned" });
	}
}

class ScriptedEmbeddingsProvider implements EmbeddingsProvider {
	calls = 0;
	readonly texts: string[] = [];
	readonly #inner = new DeterministicEmbeddingsProvider(128);

	constructor(private readonly failures: AntboxError[] = []) {}

	embed(texts: string[]): Promise<Either<AntboxError, EmbeddingsResult>> {
		this.calls++;
		this.texts.push(...texts);
		const failure = this.failures[this.calls - 1];
		return failure ? Promise.resolve(left(failure)) : this.#inner.embed(texts);
	}

	relevanceThreshold(): number {
		return 0.5;
	}
}

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => (resolve = r));
	return { promise, resolve };
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

interface Setup {
	ocr?: OCRProvider;
	embeddings?: EmbeddingsProvider;
	options?: RAGServiceOptions;
}

function setup({ ocr, embeddings, options }: Setup = {}) {
	const nodeService = new MockNodeService();
	const bus = new CapturingEventBus();
	const repository = new InMemoryNodeRepository();
	const service = new RAGService(
		bus,
		repository,
		nodeService as unknown as NodeService,
		embeddings ?? new DeterministicEmbeddingsProvider(128),
		ocr ?? new TextOCRProvider(),
		{ retry: { sleep: () => Promise.resolve() }, ...options },
	);

	const created = async (node: NodeLike) => {
		await bus.fire(NodeCreatedEvent.EVENT_ID, new NodeCreatedEvent("u@test.com", "t", node));
	};
	const updated = async (uuid: string, mimetype: string, newValues: Record<string, unknown>) => {
		await bus.fire(
			NodeUpdatedEvent.EVENT_ID,
			new NodeUpdatedEvent("u@test.com", "t", {
				uuid,
				mimetype,
				oldValues: {},
				newValues,
			}),
		);
	};
	const content = async (uuid: string) => (await repository.getContents([uuid])).right[uuid];
	const status = async (uuid: string) =>
		(await repository.getEmbeddingStatuses([uuid])).right[uuid];
	const hasVector = async (uuid: string) =>
		(await repository.vectorSearch([1], 1, { filters: [[["uuid", "==", uuid]]] })).right.nodes
			.length > 0;
	const searchBody = async (uuid: string, query: string) =>
		(await repository.fts(query, { pageSize: 10, pageToken: 1 })).right.nodes
			.some((node) => node.uuid === uuid);

	return {
		service,
		repository,
		bus,
		nodeService,
		created,
		updated,
		content,
		status,
		hasVector,
		searchBody,
	};
}

// ============================================================================
// TESTS
// ============================================================================

describe("RAGService", () => {
	describe("search content", () => {
		it("adds the extracted text to the searchable body, keeping the stored metadata", async () => {
			const t = setup();
			const node = makeFileNode("ocr-file", "text/plain", 50);
			await t.repository.add(node);
			// What NodeService stores on create: the frontmatter and the searchable metadata.
			await t.repository.saveContent("ocr-file", {
				markdown: "---\nuuid: ocr-file\n---",
				searchMeta: "Scanned contract",
				searchBody: "",
			});
			t.nodeService.setFile("ocr-file", "Clause about narwhals", "text/plain");
			expect(await t.searchBody("ocr-file", "contract")).toBe(true);
			expect(await t.searchBody("ocr-file", "narwhals")).toBe(false);

			await t.created(node);
			await t.service.idle();

			expect(await t.searchBody("ocr-file", "narwhals")).toBe(true);
			expect(await t.searchBody("ocr-file", "contract")).toBe(true);
			expect(await t.content("ocr-file")).toContain("uuid: ocr-file");
			expect(await t.content("ocr-file")).toMatch(/\n---\n\nClause about narwhals$/);
			expect(await t.hasVector("ocr-file")).toBe(true);
		});

		it("keeps the extracted text searchable when the embedding fails", async () => {
			const embeddings = new ScriptedEmbeddingsProvider([
				new AntboxError("GeminiEmbeddingsError", "400 invalid argument"),
			]);
			const t = setup({ embeddings });
			const node = makeFileNode("unembedded", "text/plain", 50);
			await t.repository.add(node);
			await t.repository.saveContent("unembedded", { markdown: "-", searchMeta: "Unembedded" });
			t.nodeService.setFile("unembedded", "Text about axolotls", "text/plain");

			await t.created(node);
			await t.service.idle();

			expect((await t.status("unembedded")).status).toBe("failed");
			expect(await t.searchBody("unembedded", "axolotls")).toBe(true);
			expect(await t.hasVector("unembedded")).toBe(false);
		});
	});

	describe("indexing — NodeCreated", () => {
		it("stores embedding for FileNode with supported mimetype", async () => {
			const t = setup();
			const node = makeFileNode("file-1", "text/plain", 50);
			await t.repository.add(node);
			t.nodeService.setFile("file-1", "Hello indexing world", "text/plain");

			await t.created(node);
			await t.service.idle();

			const md = await t.content("file-1");
			expect(md).toContain("---");
			expect(md).toContain("uuid: file-1");
			expect(md).toContain("Hello indexing world");
			expect((await t.status("file-1")).status).toBe("indexed");
		});

		it("treats a mimetype with parameters as its base type", async () => {
			const t = setup();
			const node = makeFileNode("charset-file", "text/plain;charset=utf-8", 50);
			await t.repository.add(node);
			t.nodeService.setFile("charset-file", "Charset content", "text/plain");

			await t.created(node);
			await t.service.idle();

			expect(await t.content("charset-file")).toContain("Charset content");
		});

		it("stores embedding for FileNode with zero size using metadata only", async () => {
			const t = setup();
			const node = makeFileNode("empty-file", "text/plain", 0);
			await t.repository.add(node);

			await t.created(node);
			await t.service.idle();

			const md = await t.content("empty-file");
			expect(md).toContain("uuid: empty-file");
			expect(t.nodeService.exportCalls).toEqual([]);
		});

		it("skips unsupported file types without OCR or embedding", async () => {
			const ocr = new ScriptedOCRProvider();
			const embeddings = new ScriptedEmbeddingsProvider();
			const t = setup({ ocr, embeddings });
			const node = makeFileNode("image-file", "image/jpeg", 1000);
			await t.repository.add(node);
			await t.repository.saveContent("image-file", { markdown: "old" });
			await t.repository.upsertEmbedding("image-file", new Array(128).fill(0.1));

			await t.created(node);
			await t.service.idle();

			expect(ocr.calls).toBe(0);
			expect(embeddings.calls).toBe(0);
			expect(t.nodeService.exportCalls).toEqual([]);
			expect(await t.content("image-file")).toBe("old");
			expect(await t.hasVector("image-file")).toBe(false);
			expect((await t.status("image-file")).status).toBe("skipped");
			expect(t.bus.published.some((e) => e instanceof EmbeddingCreatedEvent)).toBe(false);
		});

		it("indexes csv and xlsx files", async () => {
			const ocr = new ScriptedOCRProvider();
			const t = setup({ ocr });
			for (
				const [uuid, mimetype] of [
					["csv-file", "text/csv"],
					["xlsx-file", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
				]
			) {
				const node = makeFileNode(uuid, mimetype, 10);
				await t.repository.add(node);
				t.nodeService.setFile(uuid, "a,b", mimetype);
				await t.created(node);
			}
			await t.service.idle();

			expect((await t.status("csv-file")).status).toBe("indexed");
			expect((await t.status("xlsx-file")).status).toBe("indexed");
		});

		it("stores embedding for FolderNode from metadata (no OCR)", async () => {
			const t = setup();
			const folder = makeFolderNode("folder-1");
			await t.repository.add(folder);

			await t.created(folder);
			await t.service.idle();

			expect(await t.content("folder-1")).toContain("uuid: folder-1");
			expect(t.nodeService.exportCalls).toEqual([]);
		});

		it("includes aspects and properties in stored markdown frontmatter", async () => {
			const t = setup();
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
			}).right;
			await t.repository.add(node);
			t.nodeService.setFile("aspect-file", "Aspect content", "text/plain");

			await t.created(node);
			await t.service.idle();

			const md = await t.content("aspect-file");
			expect(md).toContain("aspects:");
			expect(md).toContain("invoice:number");
			expect(md).toContain("Aspect content");
		});

		it("publishes EmbeddingCreated for a node without an embedding", async () => {
			const t = setup();
			const folder = makeFolderNode("created-event");
			await t.repository.add(folder);

			await t.created(folder);
			await t.service.idle();

			const events = t.bus.published.filter((e) => e instanceof EmbeddingCreatedEvent);
			expect(events).toHaveLength(1);
			expect(t.bus.published.some((e) => e instanceof EmbeddingUpdatedEvent)).toBe(false);
		});
	});

	describe("indexing — NodeUpdated", () => {
		it("reuses stored file content for metadata-only updates", async () => {
			const t = setup();
			const node = makeFileNode("metadata-update", "text/plain", 50);
			await t.repository.add(node);
			await t.repository.saveContent("metadata-update", {
				markdown: "---\nuuid: metadata-update\ndescription: Old\n---\n\nStored content",
			});
			await t.repository.upsertEmbedding("metadata-update", new Array(128).fill(0));
			expect(node.update({ description: "New description" }).isRight()).toBe(true);
			await t.repository.update(node);

			await t.updated("metadata-update", "text/plain", { description: "New description" });
			await t.service.idle();

			const md = await t.content("metadata-update");
			expect(md).toContain("description: New description");
			expect(md).toContain("Stored content");
			expect(t.nodeService.exportCalls).toEqual([]);
			const events = t.bus.published.filter((e) => e instanceof EmbeddingUpdatedEvent);
			expect(events).toHaveLength(1);
		});

		it("extracts new content when the file size is updated", async () => {
			const t = setup();
			const node = makeFileNode("content-update", "text/plain", 60);
			await t.repository.add(node);
			await t.repository.saveContent("content-update", {
				markdown: "---\nuuid: content-update\n---\n\nOld content",
			});
			await t.repository.upsertEmbedding("content-update", new Array(128).fill(0));
			t.nodeService.setFile("content-update", "New content", "text/plain");

			await t.updated("content-update", "text/plain", { size: 60 });
			await t.service.idle();

			const md = await t.content("content-update");
			expect(md).toContain("New content");
			expect(md).not.toContain("Old content");
			expect(t.nodeService.exportCalls).toEqual(["content-update"]);
		});

		it("drops the embedding when an update makes the file type unsupported", async () => {
			const t = setup();
			const node = makeFileNode("type-change", "text/plain", 60);
			await t.repository.add(node);
			await t.repository.saveContent("type-change", { markdown: "old" });
			await t.repository.upsertEmbedding("type-change", new Array(128).fill(0));
			await t.repository.update(makeFileNode("type-change", "application/zip", 60));

			await t.updated("type-change", "application/zip", { mimetype: "application/zip" });
			await t.service.idle();

			expect(await t.content("type-change")).toBe("old");
			expect(await t.hasVector("type-change")).toBe(false);
			expect((await t.status("type-change")).status).toBe("skipped");
		});

		it("keeps stored content and marks failed when exporting an updated file fails", async () => {
			const t = setup();
			const node = makeFileNode("failed-export", "text/plain", 60);
			await t.repository.add(node);
			await t.repository.saveContent("failed-export", {
				markdown: "---\nuuid: failed-export\n---\n\nPreviously extracted content",
			});
			await t.repository.upsertEmbedding("failed-export", new Array(128).fill(0));

			await t.updated("failed-export", "text/plain", { size: 60 });
			await t.service.idle();

			expect(await t.content("failed-export")).toContain("Previously extracted content");
			const record = await t.status("failed-export");
			expect(record.status).toBe("failed");
			expect(record.error).toContain("export");
		});

		it("records OCR usage when extracting file content", async () => {
			const ocr = new ScriptedOCRProvider([right({
				text: "scanned text",
				model: "gemini-flash-latest",
				usage: { promptTokens: 30, completionTokens: 12, totalTokens: 42 },
			})]);
			const t = setup({ ocr });
			const node = makeFileNode("metered-ocr", "application/pdf", 60);
			await t.repository.add(node);
			t.nodeService.setFile("metered-ocr", "binary", "application/pdf");

			await t.bus.fire(
				NodeUpdatedEvent.EVENT_ID,
				new NodeUpdatedEvent("u", "tenant-a", {
					uuid: "metered-ocr",
					mimetype: "application/pdf",
					oldValues: { size: 50 },
					newValues: { size: 60 },
				}),
			);
			await t.service.idle();

			const events = t.bus.published.filter((event) => event instanceof OcrCompletedEvent);
			expect(events.length).toBe(1);
			expect((events[0] as OcrCompletedEvent).tenant).toBe("tenant-a");
			expect((events[0] as OcrCompletedEvent).payload).toEqual({
				nodeUuid: "metered-ocr",
				model: "gemini-flash-latest",
				context: "indexing",
				usage: { promptTokens: 30, completionTokens: 12, totalTokens: 42 },
			});
			expect(await t.content("metered-ocr")).toContain("scanned text");
		});

		it("keeps stored content and marks failed when OCR of an updated file fails", async () => {
			const ocr = new ScriptedOCRProvider([left(new AntboxError("OCRFailed", "unreadable"))]);
			const t = setup({ ocr });
			const node = makeFileNode("failed-ocr", "application/pdf", 60);
			await t.repository.add(node);
			await t.repository.saveContent("failed-ocr", {
				markdown: "---\nuuid: failed-ocr\n---\n\nPreviously OCRed content",
			});
			await t.repository.upsertEmbedding("failed-ocr", new Array(128).fill(0));
			t.nodeService.setFile("failed-ocr", "unreadable", "application/pdf");

			await t.updated("failed-ocr", "application/pdf", { size: 60 });
			await t.service.idle();

			expect(await t.content("failed-ocr")).toContain("Previously OCRed content");
			const record = await t.status("failed-ocr");
			expect(record.status).toBe("failed");
			expect(record.error).toBe("ocr: unreadable");
			expect(ocr.calls).toBe(1);
		});
	});

	describe("retries and failures", () => {
		it("retries transient embedding errors and ends indexed", async () => {
			const embeddings = new ScriptedEmbeddingsProvider([
				new TransientAIError("429 Too Many Requests"),
				new TransientAIError("429 Too Many Requests"),
			]);
			const t = setup({ embeddings });
			const folder = makeFolderNode("flaky");
			await t.repository.add(folder);

			await t.created(folder);
			await t.service.idle();

			expect(embeddings.calls).toBe(3);
			expect((await t.status("flaky")).status).toBe("indexed");
		});

		it("does not retry permanent embedding errors and marks the node failed", async () => {
			const embeddings = new ScriptedEmbeddingsProvider([
				new AntboxError("GeminiEmbeddingsError", "400 invalid argument"),
			]);
			const t = setup({ embeddings });
			const folder = makeFolderNode("broken");
			await t.repository.add(folder);

			await t.created(folder);
			await t.service.idle();

			expect(embeddings.calls).toBe(1);
			const record = await t.status("broken");
			expect(record.status).toBe("failed");
			expect(record.error).toContain("400 invalid argument");
			expect(await t.content("broken")).toContain("uuid: broken");
			expect(await t.hasVector("broken")).toBe(false);
			expect(t.bus.published.some((e) => e instanceof EmbeddingCreatedEvent)).toBe(false);
		});

		it("retries transient OCR errors", async () => {
			const ocr = new ScriptedOCRProvider([
				left(new TransientAIError("503 unavailable")),
				right({ text: "second try" }),
			]);
			const t = setup({ ocr });
			const node = makeFileNode("flaky-ocr", "application/pdf", 10);
			await t.repository.add(node);
			t.nodeService.setFile("flaky-ocr", "pdf", "application/pdf");

			await t.created(node);
			await t.service.idle();

			expect(ocr.calls).toBe(2);
			expect(await t.content("flaky-ocr")).toContain("second try");
			expect((await t.status("flaky-ocr")).status).toBe("indexed");
		});

		it("stores a metadata embedding and marks failed when OCR keeps failing", async () => {
			const ocr = new ScriptedOCRProvider([left(new AntboxError("OCRFailed", "bad pdf"))]);
			const t = setup({ ocr });
			const node = makeFileNode("ocr-fails", "application/pdf", 10);
			await t.repository.add(node);
			t.nodeService.setFile("ocr-fails", "pdf", "application/pdf");

			await t.created(node);
			await t.service.idle();

			expect(await t.content("ocr-fails")).toContain("uuid: ocr-fails");
			const record = await t.status("ocr-fails");
			expect(record.status).toBe("failed");
			expect(record.error).toBe("ocr: bad pdf");
		});
	});

	describe("queue", () => {
		it("runs at most two indexing jobs at once", async () => {
			let running = 0;
			let peak = 0;
			const ocr: OCRProvider = {
				async ocr() {
					running++;
					peak = Math.max(peak, running);
					await new Promise((r) => setTimeout(r, 5));
					running--;
					return right({ text: "x" });
				},
			};
			const t = setup({ ocr });
			for (let i = 0; i < 6; i++) {
				const node = makeFileNode(`parallel-${i}`, "application/pdf", 10);
				await t.repository.add(node);
				t.nodeService.setFile(node.uuid, "pdf", "application/pdf");
				await t.created(node);
			}
			await t.service.idle();

			expect(peak).toBe(2);
		});

		it("a metadata update right after creation keeps one OCR and the final metadata", async () => {
			const ocr = new ScriptedOCRProvider();
			const gate = deferred();
			ocr.gate = gate.promise;
			const t = setup({ ocr });
			const node = makeFileNode("create-update", "application/pdf", 10);
			await t.repository.add(node);
			t.nodeService.setFile("create-update", "pdf", "application/pdf");

			await t.created(node);
			expect(node.update({ description: "Final description" }).isRight()).toBe(true);
			await t.repository.update(node);
			await t.updated("create-update", "application/pdf", { description: "Final description" });
			gate.resolve();
			await t.service.idle();

			expect(ocr.calls).toBe(1);
			const md = await t.content("create-update");
			expect(md).toContain("description: Final description");
			expect(md).toContain("scanned");
		});

		it("stores nothing for a node deleted before its job runs", async () => {
			const ocr = new ScriptedOCRProvider();
			const gate = deferred();
			ocr.gate = gate.promise;
			const t = setup({ ocr });
			const blocker = makeFileNode("blocker", "application/pdf", 10);
			await t.repository.add(blocker);
			t.nodeService.setFile("blocker", "pdf", "application/pdf");
			const other = makeFileNode("blocker-2", "application/pdf", 10);
			await t.repository.add(other);
			t.nodeService.setFile("blocker-2", "pdf", "application/pdf");
			const doomed = makeFolderNode("doomed");
			await t.repository.add(doomed);

			await t.created(blocker);
			await t.created(other);
			await t.created(doomed);
			await t.repository.delete("doomed");
			await t.bus.fire(
				NodeDeletedEvent.EVENT_ID,
				new NodeDeletedEvent("u", "t", doomed.metadata),
			);
			gate.resolve();
			await t.service.idle();

			expect(await t.content("doomed")).toBeUndefined();
			expect(t.bus.published.filter((e) => e instanceof EmbeddingCreatedEvent)).toHaveLength(2);
		});
	});

	describe("indexing — NodeDeleted", () => {
		it("removes embedding when node is deleted", async () => {
			const t = setup();
			const folder = makeFolderNode("delete-me");
			await t.repository.add(folder);
			await t.created(folder);
			await t.service.idle();

			await t.bus.fire(
				NodeDeletedEvent.EVENT_ID,
				new NodeDeletedEvent("u", "t", folder.metadata),
			);
			await t.service.idle();

			expect(await t.hasVector("delete-me")).toBe(false);
			expect((await t.status("delete-me")).status).toBeNull();
		});
	});

	describe("reindex", () => {
		async function seed() {
			const embeddings = new ScriptedEmbeddingsProvider();
			const ocr = new ScriptedOCRProvider();
			const t = setup({
				embeddings,
				ocr,
				options: { retry: { sleep: () => Promise.resolve() } },
			});
			const vector = new Array(128).fill(0.1);

			await t.repository.add(makeFolderNode("indexed"));
			await t.repository.upsertEmbedding("indexed", vector);
			await t.repository.add(makeFolderNode("pending"));
			await t.repository.add(makeFileNode("failed", "application/pdf", 10));
			t.nodeService.setFile("failed", "pdf", "application/pdf");
			await t.repository.upsertEmbedding("failed", vector);
			await t.repository.setEmbeddingStatus("failed", "failed", "ocr: timeout");
			await t.repository.add(makeFileNode("photo", "image/jpeg", 10));
			await t.repository.upsertEmbedding("photo", vector);

			return { t, embeddings, ocr };
		}

		it("missing indexes pending and failed nodes, skips unsupported files, publishes no events", async () => {
			const { t, embeddings, ocr } = await seed();

			const result = await t.service.reindex({ mode: "missing", tenant: "t", actor: "admin" });
			expect(result.right).toEqual({ mode: "missing", queued: 2 });
			await t.service.idle();

			expect(embeddings.texts.some((text) => text.includes("uuid: pending"))).toBe(true);
			expect(embeddings.texts.some((text) => text.includes("uuid: failed"))).toBe(true);
			expect(embeddings.texts.some((text) => text.includes("uuid: indexed"))).toBe(false);
			expect(ocr.calls).toBe(1);
			expect((await t.status("pending")).status).toBe("indexed");
			expect((await t.status("failed")).status).toBe("indexed");
			expect((await t.status("photo")).status).toBe("skipped");
			expect(await t.content("photo")).toBeUndefined();
			expect(
				t.bus.published.some((e) =>
					e instanceof EmbeddingCreatedEvent || e instanceof EmbeddingUpdatedEvent
				),
			).toBe(false);
		});

		it("all re-embeds every eligible node", async () => {
			const { t, embeddings } = await seed();

			const result = await t.service.reindex({ mode: "all", tenant: "t", actor: "admin" });
			expect(result.right).toEqual({ mode: "all", queued: 3 });
			await t.service.idle();

			expect(embeddings.texts.some((text) => text.includes("uuid: indexed"))).toBe(true);
			expect((await t.status("photo")).status).toBe("skipped");
		});

		it("refuses a second reindex while one is running", async () => {
			const { t, ocr } = await seed();
			const gate = deferred();
			ocr.gate = gate.promise;

			const first = await t.service.reindex({ mode: "missing", tenant: "t", actor: "admin" });
			expect(first.isRight()).toBe(true);
			const second = await t.service.reindex({ mode: "all", tenant: "t", actor: "admin" });
			expect(second.isLeft()).toBe(true);
			expect(second.value).toBeInstanceOf(AntboxError);
			expect((second.value as AntboxError).errorCode).toBe("ReindexInProgress");

			gate.resolve();
			await t.service.idle();
			const third = await t.service.reindex({ mode: "missing", tenant: "t", actor: "admin" });
			expect(third.isRight()).toBe(true);
			await t.service.idle();
		});

		it("reports counts, the last job and recent failures", async () => {
			const embeddings = new ScriptedEmbeddingsProvider([
				new AntboxError("GeminiEmbeddingsError", "400 bad"),
			]);
			const t = setup({ embeddings });
			await t.repository.add(makeFolderNode("will-fail"));

			await t.service.reindex({ mode: "missing", tenant: "t", actor: "admin" });
			await t.service.idle();

			const status = (await t.service.status()).right;
			expect(status.enabled).toBe(true);
			expect(status.counts).toEqual({ indexed: 0, failed: 1, skipped: 0, pending: 0 });
			expect(status.job?.mode).toBe("missing");
			expect(status.job?.queued).toBe(1);
			expect(status.job?.done).toBe(1);
			expect(status.job?.failed).toBe(1);
			expect(typeof status.job?.finishedAt).toBe("string");
			expect(status.failures).toHaveLength(1);
			expect(status.failures[0].uuid).toBe("will-fail");
			expect(status.failures[0].error).toContain("400 bad");
		});
	});

	describe("null OCR", () => {
		it("indexes metadata when the OCR provider extracts nothing", async () => {
			const t = setup({ ocr: new NullOCRProvider() });
			const node = makeFileNode("null-ocr", "application/pdf", 10);
			await t.repository.add(node);
			t.nodeService.setFile("null-ocr", "pdf", "application/pdf");

			await t.created(node);
			await t.service.idle();

			expect(await t.content("null-ocr")).toContain("uuid: null-ocr");
		});
	});
});
