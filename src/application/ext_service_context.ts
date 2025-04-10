import type { NodeRepository } from "domain/nodes/node_repository";
import type { EventBus } from "shared/event_bus";
import type { StorageProvider } from "./storage_provider";


export interface ExtServiceContext {
  readonly repository: NodeRepository;
  readonly storage: StorageProvider;
  readonly bus: EventBus;
}
