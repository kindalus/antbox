import { NodeRepository } from "domain/nodes/node_repository.ts";
import { EventBus } from "shared/event_bus.ts";
import { NodeService } from "application/node_service.ts";
import { StorageProvider } from "application/storage_provider.ts";

export interface ExtServiceContext {
  readonly repository: NodeRepository;
  readonly storage: StorageProvider;
  readonly bus: EventBus;
  nodeService: NodeService;
}
