import { type NodeRepository } from "domain/nodes/node_repository.ts";
import type { StorageProvider } from "./storage_provider.ts";
import type { EventBus } from "shared/event_bus.ts";
import type { VectorDatabase } from "./ai/vector_database.ts";
import type { AIModel } from "./ai/ai_model.ts";

export interface NodeServiceContext {
	readonly storage: StorageProvider;
	readonly repository: NodeRepository;
	readonly bus: EventBus;
	readonly vectorDatabase?: VectorDatabase;
	readonly embeddingModel?: AIModel;
}
