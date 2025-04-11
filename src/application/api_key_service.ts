import { ApiKeyNode } from "domain/api_keys/api_key_node.ts";
import { ApiKeyNodeFoundError } from "domain/api_keys/api_key_node_found_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { type AuthenticationContext } from "./authentication_context.ts";
import { builtinGroups } from "./builtin_groups/index.ts";
import { NodeService } from "./node_service.ts";
import { UsersGroupsService } from "./users_groups_service.ts";

export interface ApiKeyDTO {
  group: string;
  owner?: string;
  description: string;
  secret: string;  
}

export class ApiKeyService {
  readonly #nodeService: NodeService;

  constructor(
    readonly nodeRepository: NodeRepository,
    nodeService: NodeService,
  ) { this.#nodeService = nodeService; }

  async create(
    ctx: AuthenticationContext,
    metadata: ApiKeyDTO,
  ): Promise<Either<AntboxError, ApiKeyDTO>> {
    const builtinGroup = builtinGroups.find((g) => g.uuid === metadata.group);

    const groupsOrErr = await this.#nodeService.get(ctx, metadata.group);
    if (groupsOrErr.isLeft() && !builtinGroup) {
      return left(groupsOrErr.value);
    }

    const apiKeyOrErr = ApiKeyNode.create({
      ...metadata,
      owner: metadata.owner ?? ctx.principal.email,
    });
    if (apiKeyOrErr.isLeft()) {
      return left(apiKeyOrErr.value);
    }

    const apiKey = apiKeyOrErr.value;

    const voidOrErr = await this.nodeRepository.add(apiKey);  
    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return right({
      group: apiKey.group,
      owner: apiKey.owner,
      description: apiKey.description,
      secret: apiKey.secret,
    } as ApiKeyDTO);
  }

  async get(uuid: string): Promise<Either<AntboxError, ApiKeyNode>> {
    const nodeOrErr = await this.#nodeService.get(
      UsersGroupsService.elevatedContext(),
      uuid,
    );

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (!Nodes.isApikey(nodeOrErr.value)) {
      return left(new ApiKeyNodeFoundError(uuid));
    }

    return right(nodeOrErr.value.cloneWithSecret());
  }

  async getBySecret(secret: string): Promise<Either<AntboxError, ApiKeyNode>> {
    const nodeOrErr = await this.#nodeService.find(
      UsersGroupsService.elevatedContext(),
      [
        ["secret", "==", secret],
        ["mimetype", "==", Nodes.API_KEY_MIMETYPE],
      ],
      1,
    );

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (nodeOrErr.value.nodes.length === 0) {
      return left(new ApiKeyNodeFoundError(secret));
    }

    return this.get(nodeOrErr.value.nodes[0].uuid);
  }

  async list(ctx: AuthenticationContext): Promise<ApiKeyNode[]> {
    const nodesOrErrs = await this.#nodeService.find(
      ctx,
      [
        ["mimetype", "==", Nodes.API_KEY_MIMETYPE],
        ["parent", "==", Folders.API_KEYS_FOLDER_UUID],
      ],
      Number.MAX_SAFE_INTEGER,
    );

    if (nodesOrErrs.isLeft()) {
      console.error(nodesOrErrs.value);
      return [];
    }

    return nodesOrErrs.value.nodes
      .map((n) => (n as ApiKeyNode).cloneWithSecret())
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  async delete(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<AntboxError, void>> {
    const existingOrErr = await this.get(uuid);
    if (existingOrErr.isLeft()) {
      return left(existingOrErr.value);
    }

    return this.#nodeService.delete(ctx, uuid);
  }
}
