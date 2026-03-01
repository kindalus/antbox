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
import { isEmbeddingsSupportedMimetype } from "domain/nodes/embedding.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import type { FileNode } from "domain/nodes/file_node.ts";
import type { FolderNode } from "domain/nodes/folder_node.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { stringify as yamlStringify } from "@std/yaml";
import { createElevatedContext } from "application/security/elevated_context.ts";

/** Default number of top results to retrieve */
export const RAG_TOP_K = 5;

/** Default minimum cosine similarity threshold */
export const RAG_THRESHOLD = 0.5;

/**
 * RAGService - Handles both embedding indexing and semantic query.
 *
 * Indexing: Subscribes to node events → OCR + metadata → embed → store vector.
 * Query: Embed query → vectorSearch → fetch content → return RagDocument[].
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
		threshold = RAG_THRESHOLD,
	): Promise<Either<AntboxError, RagDocument[]>> {
		const embeddingOrErr = await this.#embeddingsProvider.embed([text]);
		if (embeddingOrErr.isLeft()) {
			return left(embeddingOrErr.value);
		}

		const queryVector = embeddingOrErr.value[0];

		const searchOrErr = await this.#repository.vectorSearch(queryVector, topK);
		if (searchOrErr.isLeft()) {
			return left(searchOrErr.value);
		}

		const candidates = searchOrErr.value.nodes.filter((r) => r.score >= threshold);

		const docs: RagDocument[] = [];

		for (const { node, score } of candidates) {
			try {
				let content = "";

				if (Nodes.isFile(node) && node.mimetype && isEmbeddingsSupportedMimetype(node.mimetype)) {
					const fileOrErr = await this.#nodeService.export(
						createElevatedContext(),
						node.uuid,
					);

					if (fileOrErr.isRight()) {
						const ocrOrErr = await this.#ocrProvider.ocr(fileOrErr.value);
						if (ocrOrErr.isRight()) {
							content = ocrOrErr.value;
						}
					}
				}

				docs.push({
					uuid: node.uuid,
					title: node.title,
					content,
					score,
				});
			} catch (error) {
				Logger.warn(`Failed to retrieve content for node ${node.uuid}: ${error}`);
			}
		}

		return right(docs);
	}

	// ========================================================================
	// PRIVATE — INDEXING
	// ========================================================================

	async #handleNodeCreated(event: NodeCreatedEvent): Promise<void> {
		const node = event.payload;

		if (Nodes.isFolder(node)) {
			await this.#indexFolder(node as FolderNode);
			return;
		}

		if (!Nodes.isFile(node)) return;
		if (node.size === 0) return;
		if (!node.mimetype || !isEmbeddingsSupportedMimetype(node.mimetype)) return;

		await this.#indexFile(node as FileNode);
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

		if (Nodes.isFolder(node)) {
			await this.#indexFolder(node as FolderNode);
			return;
		}

		if (!Nodes.isFile(node)) {
			await this.#deleteEmbedding(event.payload.uuid);
			return;
		}

		if (node.size === 0 || !node.mimetype || !isEmbeddingsSupportedMimetype(node.mimetype)) {
			await this.#deleteEmbedding(node.uuid);
			return;
		}

		await this.#indexFile(node as FileNode);
	}

	async #handleNodeDeleted(event: NodeDeletedEvent): Promise<void> {
		await this.#deleteEmbedding(event.payload.uuid);
	}

	async #indexFile(node: FileNode): Promise<void> {
		const fileOrErr = await this.#nodeService.export(createElevatedContext(), node.uuid);
		if (fileOrErr.isLeft()) {
			Logger.error(`RAGService: failed to export file ${node.uuid}`);
			return;
		}

		const textOrErr = await this.#ocrProvider.ocr(fileOrErr.value);
		if (textOrErr.isLeft()) {
			Logger.warn(`RAGService: OCR failed for ${node.uuid}: ${textOrErr.value.message}`);
			return;
		}

		const combinedText = `---\n**Metadata**:\n\n${toYamlMetadata(node)}\n---\n**Content**:\n\n${textOrErr.value}`;

		await this.#generateAndStore(node.uuid, combinedText);
	}

	async #indexFolder(node: FolderNode): Promise<void> {
		const metadataText = `---\n**Metadata**:\n\n${toYamlMetadata(node)}\n---`;
		await this.#generateAndStore(node.uuid, metadataText);
	}

	async #generateAndStore(uuid: string, text: string): Promise<void> {
		const embeddingsOrErr = await this.#embeddingsProvider.embed([text]);
		if (embeddingsOrErr.isLeft()) {
			Logger.error(`RAGService: embedding failed for ${uuid}: ${embeddingsOrErr.value.message}`);
			return;
		}

		const storeOrErr = await this.#repository.upsertEmbedding(uuid, embeddingsOrErr.value[0]);
		if (storeOrErr.isLeft()) {
			Logger.error(`RAGService: store embedding failed for ${uuid}: ${storeOrErr.value.message}`);
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

function toYamlMetadata(node: NodeMetadata): string {
	const filtered: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(node)) {
		if (v !== undefined && v !== null) {
			filtered[k] = v;
		}
	}
	return yamlStringify(filtered);
}
