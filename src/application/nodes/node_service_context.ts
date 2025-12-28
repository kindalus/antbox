import { type NodeRepository } from "domain/nodes/node_repository.ts";
import type { StorageProvider } from "./storage_provider.ts";
import type { EventBus } from "shared/event_bus.ts";
import type { ConfigurationRepository } from "domain/configuration/configuration_repository.ts";
import type { AIModel } from "../ai/ai_model.ts";

export interface NodeServiceContext {
	readonly storage: StorageProvider;
	readonly repository: NodeRepository;
	readonly bus: EventBus;
	readonly configRepo: ConfigurationRepository;
	readonly embeddingModel?: AIModel;
}
