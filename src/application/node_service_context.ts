import { FidGenerator } from "/domain/nodes/fid_generator.ts";
import { NodeRepository } from "/domain/nodes/node_repository.ts";
import { StorageProvider } from "/domain/providers/storage_provider.ts";
import { UuidGenerator } from "/domain/providers/uuid_generator.ts";

export interface NodeServiceContext {
  readonly fidGenerator?: FidGenerator;
  readonly uuidGenerator?: UuidGenerator;
  readonly storage: StorageProvider;
  readonly repository: NodeRepository;
}
