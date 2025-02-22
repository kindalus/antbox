import { type NodeRepository } from "domain/nodes/node_repository.ts";
import type { StorageProvider } from "./storage_provider.ts";

export interface NodeServiceContext {
  readonly storage: StorageProvider;
  readonly repository: NodeRepository;
}
