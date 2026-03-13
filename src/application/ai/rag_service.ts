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

		const queryVector = embeddingOrErr.value[0];

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

		if (Nodes.isFile(node)) {
			await this.#indexFile(node, event.tenant);
			return;
		}

		await this.#indexNodeMetadata(node);
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

		if (Nodes.isFile(node)) {
			await this.#indexFile(node, event.tenant);
			return;
		}

		await this.#indexNodeMetadata(node);
	}

	async #handleNodeDeleted(event: NodeDeletedEvent): Promise<void> {
		await this.#deleteEmbedding(event.payload.uuid);
	}

	async #indexFile(node: NodeMetadata, tenant: string): Promise<void> {
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
		await this.#generateAndStore(node.uuid, markdown);
	}

	async #indexNodeMetadata(metadata: NodeMetadata): Promise<void> {
		const markdown = toEmbeddingMarkdown(metadata);
		await this.#generateAndStore(metadata.uuid, markdown);
	}

	async #generateAndStore(uuid: string, text: string): Promise<void> {
		const embeddingsOrErr = await this.#embeddingsProvider.embed([text]);
		if (embeddingsOrErr.isLeft()) {
			Logger.error(`RAGService: embedding failed for ${uuid}: ${embeddingsOrErr.value.message}`);
			return;
		}

		const storeOrErr = await this.#repository.upsertEmbedding(
			uuid,
			embeddingsOrErr.value[0],
			text,
		);
		if (storeOrErr.isLeft()) {
			Logger.error(
				`RAGService: store embedding failed for ${uuid}: ${storeOrErr.value.message}`,
			);
		}
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
