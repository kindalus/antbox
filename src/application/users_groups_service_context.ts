import type { NodeRepository } from "domain/nodes/node_repository";
import type { StorageProvider } from "./storage_provider";
import type { EventBus } from "shared/event_bus";

export interface UsersGroupsContext {
    readonly storage: StorageProvider;
    readonly repository: NodeRepository;
    readonly bus: EventBus;
  }
  