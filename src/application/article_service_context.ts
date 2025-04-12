import type { NodeRepository } from "domain/nodes/node_repository.ts";
import type { StorageProvider } from "./storage_provider.ts";
import type { EventBus } from "shared/event_bus.ts";

export interface ArticleServiceContext {
  readonly storage: StorageProvider;
  readonly repository: NodeRepository;
  readonly bus: EventBus;
}
