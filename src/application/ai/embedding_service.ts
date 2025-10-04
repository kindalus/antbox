import { NodeCreatedEvent } from "../../domain/nodes/node_created_event.ts";
import { NodeUpdatedEvent } from "../../domain/nodes/node_updated_event.ts";
import { NodeDeletedEvent } from "../../domain/nodes/node_deleted_event.ts";
import type { FileNode } from "../../domain/nodes/file_node.ts";
import type { VectorDatabase } from "./vector_database.ts";
import type { VectorEntry } from "./vector_database.ts";
import type { AIModel } from "./ai_model.ts";
import { isEmbeddingsSupportedMimetype } from "./embeddings_supported_mimetypes.ts";
import { AntboxError } from "../../shared/antbox_error.ts";
import { Nodes } from "../../domain/nodes/nodes.ts";
import type { NodeService } from "../node_service.ts";
import { UsersGroupsService } from "../users_groups_service.ts";
import type { EventBus } from "../../shared/event_bus.ts";

export interface EmbeddingServiceContext {
	embeddingModel: AIModel;
	ocrModel: AIModel;
	nodeService: NodeService;
	vectorDatabase: VectorDatabase;
	bus: EventBus;
}

export class EmbeddingGenerationError extends AntboxError {
	constructor(nodeUuid: string, cause: unknown) {
		super(
			"EmbeddingGenerationError",
			`Failed to generate embedding for node ${nodeUuid}: ${cause}`,
		);
	}
}

export class EmbeddingService {
	constructor(private readonly context: EmbeddingServiceContext) {
		// Subscribe to events similar to FeatureService
		this.context.bus.subscribe(NodeCreatedEvent.EVENT_ID, {
			handle: (evt: NodeCreatedEvent) => this.handleNodeCreated(evt),
		});

		this.context.bus.subscribe(NodeUpdatedEvent.EVENT_ID, {
			handle: (evt: NodeUpdatedEvent) => this.handleNodeUpdated(evt),
		});

		this.context.bus.subscribe(NodeDeletedEvent.EVENT_ID, {
			handle: (evt: NodeDeletedEvent) => this.handleNodeDeleted(evt),
		});
	}

	async handleNodeCreated(event: NodeCreatedEvent): Promise<void> {
		const node = event.payload;

		// Check if node is a FileNode using Nodes utility
		if (!Nodes.isFile(node)) {
			return;
		}

		// Check if mimetype is supported
		if (!node.mimetype || !isEmbeddingsSupportedMimetype(node.mimetype)) {
			return;
		}

		// Generate and store embedding
		try {
			await this.#generateAndStoreEmbedding(node, event.tenant);
		} catch (error) {
			// Log error but don't throw - embedding generation should not break node creation
			console.error(`Failed to generate embedding for node ${node.uuid}:`, error);
		}
	}

	async handleNodeUpdated(event: NodeUpdatedEvent): Promise<void> {
		// Get the full node using elevated context
		const nodeOrErr = await this.context.nodeService.get(
			UsersGroupsService.elevatedContext,
			event.payload.uuid,
		);

		if (nodeOrErr.isLeft()) {
			console.error(`Failed to get node ${event.payload.uuid} for embedding update`);
			return;
		}

		const node = nodeOrErr.value;

		// Check if node is a FileNode using Nodes utility
		if (!Nodes.isFile(node)) {
			// Node is no longer a file, delete any existing embedding
			await this.#deleteEmbedding(event.payload.uuid);
			return;
		}

		// Check if mimetype is supported
		if (!node.mimetype || !isEmbeddingsSupportedMimetype(node.mimetype)) {
			// Mimetype is not supported, delete any existing embedding
			await this.#deleteEmbedding(node.uuid);
			return;
		}

		// Generate and store embedding (upsert will update existing)
		try {
			await this.#generateAndStoreEmbedding(node, event.tenant);
		} catch (error) {
			// Log error but don't throw - embedding generation should not break node update
			console.error(`Failed to update embedding for node ${node.uuid}:`, error);
		}
	}

	async handleNodeDeleted(event: NodeDeletedEvent): Promise<void> {
		const node = event.payload;

		// Only attempt to delete embedding if it was a FileNode with supported mimetype
		if (!Nodes.isFile(node)) {
			return;
		}

		if (!node.mimetype || !isEmbeddingsSupportedMimetype(node.mimetype)) {
			return;
		}

		// Delete embedding from vector database
		await this.#deleteEmbedding(node.uuid);
	}

	async #generateAndStoreEmbedding(node: FileNode, tenant: string): Promise<void> {
		// Read file content using NodeService export method
		const fileOrErr = await this.context.nodeService.export(
			UsersGroupsService.elevatedContext,
			node.uuid,
		);

		if (fileOrErr.isLeft()) {
			throw new EmbeddingGenerationError(node.uuid, "File not found in storage");
		}

		const file = fileOrErr.value;

		// Extract text content using OCR model
		const textOrErr = await this.context.ocrModel.ocr(file);
		if (textOrErr.isLeft()) {
			throw new EmbeddingGenerationError(node.uuid, textOrErr.value);
		}

		const text = textOrErr.value;

		// Generate embedding using embedding model
		const embeddingsOrErr = await this.context.embeddingModel.embed([text]);
		if (embeddingsOrErr.isLeft()) {
			throw new EmbeddingGenerationError(node.uuid, embeddingsOrErr.value);
		}

		const embedding = embeddingsOrErr.value[0];

		// Create vector entry
		const vectorEntry: VectorEntry = {
			id: node.uuid,
			vector: embedding,
			metadata: {
				nodeUuid: node.uuid,
				tenant: tenant,
				mimetype: node.mimetype!,
				title: node.title,
				model: this.context.embeddingModel.name,
			},
		};

		// Store in vector database
		const storeOrErr = await this.context.vectorDatabase.upsert(vectorEntry);
		if (storeOrErr.isLeft()) {
			throw new EmbeddingGenerationError(node.uuid, storeOrErr.value);
		}
	}

	async #deleteEmbedding(nodeUuid: string): Promise<void> {
		try {
			const deleteOrErr = await this.context.vectorDatabase.deleteByNodeUuid(nodeUuid);
			if (deleteOrErr.isLeft()) {
				// Log error but don't throw - deletion failures shouldn't break operations
				console.error(`Failed to delete embedding for node ${nodeUuid}:`, deleteOrErr.value);
			}
		} catch (error) {
			// Log error but don't throw - deletion failures shouldn't break operations
			console.error(`Failed to delete embedding for node ${nodeUuid}:`, error);
		}
	}
}
