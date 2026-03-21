import { type Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { Logger } from "shared/logger.ts";
import type { EventBus } from "shared/event_bus.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import type { NodeService } from "application/nodes/node_service.ts";
import type { EmbeddingsProvider } from "domain/ai/embeddings_provider.ts";
import type { OCRProvider } from "domain/ai/ocr_provider.ts";
import type { RagDocument } from "domain/ai/rag_document.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import { NodeDeletedEvent } from "domain/nodes/node_deleted_event.ts";
import { EmbeddingCreatedEvent } from "domain/nodes/embedding_created_event.ts";
import { EmbeddingUpdatedEvent } from "domain/nodes/embedding_updated_event.ts";
import { EmbeddingsGeneratedEvent } from "domain/ai/embeddings_generated_event.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { createElevatedContext } from "application/security/elevated_context.ts";
import { toEmbeddingMarkdown } from "application/nodes/node_markdown.ts";

/** Default number of top results to retrieve */
export const RAG_TOP_K = 5;

/**
 * RAGService - Handles both embedding indexing and semantic query.
 *
 * Indexing: Subscribes to node events → build markdown payload → embed → store vector + content.
 * Query: Embed query → vectorSearch → return RagDocument[] using stored markdown content.
 */
export class RAGService {
	readonly #repository: NodeRepository;
	readonly #nodeService: NodeService;
	readonly #embeddingsProvider: EmbeddingsProvider;
	readonly #ocrProvider: OCRProvider;
	readonly #eventBus: EventBus;

	constructor(
		eventBus: EventBus,
		repository: NodeRepository,
		nodeService: NodeService,
		embeddingsProvider: EmbeddingsProvider,
		ocrProvider: OCRProvider,
	) {
		this.#repository = repository;
		this.#nodeService = nodeService;
		this.#embeddingsProvider = embeddingsProvider;
		this.#ocrProvider = ocrProvider;
		this.#eventBus = eventBus;

		if (!repository.supportsEmbeddings()) {
			return;
		}

		eventBus.subscribe(NodeCreatedEvent.EVENT_ID, {
			handle: (evt: NodeCreatedEvent) => this.#handleNodeCreated(evt),
		});

		eventBus.subscribe(NodeUpdatedEvent.EVENT_ID, {
			handle: (evt: NodeUpdatedEvent) => this.#handleNodeUpdated(evt),
		});

		eventBus.subscribe(NodeDeletedEvent.EVENT_ID, {
			handle: (evt: NodeDeletedEvent) => this.#handleNodeDeleted(evt),
		});
	}

	/**
	 * Query the RAG index for documents semantically similar to the given text.
	 * @param text The query text
	 * @param topK Maximum number of results to return
	 * @param threshold Minimum similarity score [0, 1]
	 * @returns Array of matching documents ordered by score descending
	 */
	async query(
		text: string,
		topK = RAG_TOP_K,
		threshold?: number,
	): Promise<Either<AntboxError, RagDocument[]>> {
		const actualThreshold = threshold ?? this.#embeddingsProvider.relevanceThreshold();

		const embeddingOrErr = await this.#embeddingsProvider.embed([text]);
		if (embeddingOrErr.isLeft()) {
			return left(embeddingOrErr.value);
		}

		if (embeddingOrErr.value.usage) {
			this.#eventBus.publish(
				new EmbeddingsGeneratedEvent(
					"system", // RAG query runs as system
					"unknown", // Or pull from context if available
					{
						nodeUuid: "query", // Represents a search query
						model: "default",
						usage: embeddingOrErr.value.usage,
						context: "search",
					},
				),
			);
		}

		const queryVector = embeddingOrErr.value.embeddings[0];

		const searchOrErr = await this.#repository.vectorSearch(queryVector, topK);
		if (searchOrErr.isLeft()) {
			return left(searchOrErr.value);
		}

		const candidates = searchOrErr.value.nodes.filter((r) => r.score >= actualThreshold);
		const contentMdOrErr = await this.#repository.getEmbeddingContents(
			candidates.map(({ node }) => node.uuid),
		);
		if (contentMdOrErr.isLeft()) {
			return left(contentMdOrErr.value);
		}

		const docs: RagDocument[] = candidates.map(({ node, score }) => ({
			uuid: node.uuid,
			title: node.title,
			content: contentMdOrErr.value[node.uuid] ?? "",
			score,
		}));

		return right(docs);
	}

	// ========================================================================
	// PRIVATE — INDEXING
	// ========================================================================

	async #handleNodeCreated(event: NodeCreatedEvent): Promise<void> {
		const node = event.payload;

		let success: boolean;
		if (Nodes.isFile(node)) {
			success = await this.#indexFile(node, event.tenant);
		} else {
			success = await this.#indexNodeMetadata(node, event.tenant);
		}

		if (success) {
			this.#eventBus.publish(
				new EmbeddingCreatedEvent(event.userEmail, event.tenant, node.uuid),
			);
		}
	}

	async #handleNodeUpdated(event: NodeUpdatedEvent): Promise<void> {
		const nodeOrErr = await this.#nodeService.get(
			createElevatedContext(event.tenant),
			event.payload.uuid,
		);

		if (nodeOrErr.isLeft()) {
			Logger.error(`RAGService: failed to get node ${event.payload.uuid} for re-indexing`);
			return;
		}

		const node = nodeOrErr.value;

		let success: boolean;
		if (Nodes.isFile(node)) {
			success = await this.#indexFile(node, event.tenant);
		} else {
			success = await this.#indexNodeMetadata(node, event.tenant);
		}

		if (success) {
			this.#eventBus.publish(
				new EmbeddingUpdatedEvent(event.userEmail, event.tenant, node.uuid),
			);
		}
	}

	async #handleNodeDeleted(event: NodeDeletedEvent): Promise<void> {
		await this.#deleteEmbedding(event.payload.uuid);
	}

	async #indexFile(node: NodeMetadata, tenant: string): Promise<boolean> {
		let bodyContent = "";

		if ((node.size ?? 0) > 0) {
			const fileOrErr = await this.#nodeService.export(createElevatedContext(tenant), node.uuid);
			if (fileOrErr.isLeft()) {
				Logger.warn(`RAGService: failed to export file ${node.uuid}, indexing metadata only`);
			} else {
				const textOrErr = await this.#ocrProvider.ocr(fileOrErr.value);
				if (textOrErr.isLeft()) {
					Logger.warn(`RAGService: OCR failed for ${node.uuid}: ${textOrErr.value.message}`);
				} else {
					bodyContent = textOrErr.value;
				}
			}
		}

		const markdown = toEmbeddingMarkdown(node, bodyContent);
		return this.#generateAndStore(node.uuid, markdown, tenant);
	}

	async #indexNodeMetadata(metadata: NodeMetadata, tenant: string): Promise<boolean> {
		const markdown = toEmbeddingMarkdown(metadata);
		return this.#generateAndStore(metadata.uuid, markdown, tenant);
	}

	async #generateAndStore(uuid: string, text: string, tenant: string): Promise<boolean> {
		const embeddingsOrErr = await this.#embeddingsProvider.embed([text]);
		if (embeddingsOrErr.isLeft()) {
			Logger.error(`RAGService: embedding failed for ${uuid}: ${embeddingsOrErr.value.message}`);
			return false;
		}

		if (embeddingsOrErr.value.usage) {
			this.#eventBus.publish(
				new EmbeddingsGeneratedEvent(
					"system",
					tenant,
					{
						nodeUuid: uuid,
						model: "default",
						usage: embeddingsOrErr.value.usage,
						context: "indexing",
					},
				),
			);
		}

		const storeOrErr = await this.#repository.upsertEmbedding(
			uuid,
			embeddingsOrErr.value.embeddings[0],
			text,
		);
		if (storeOrErr.isLeft()) {
			Logger.error(
				`RAGService: store embedding failed for ${uuid}: ${storeOrErr.value.message}`,
			);
			return false;
		}

		return true;
	}

	async #deleteEmbedding(uuid: string): Promise<void> {
		const deleteOrErr = await this.#repository.deleteEmbedding(uuid);
		if (deleteOrErr.isLeft()) {
			Logger.error(
				`RAGService: delete embedding failed for ${uuid}: ${deleteOrErr.value.message}`,
			);
		}
	}
}
