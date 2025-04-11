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
import { nodeToApiKey, type ApiKeyDTO } from "./api_key_dto.ts";
import bcrypt from "bcryptjs";

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

    return right(nodeToApiKey(apiKey));
  }

  async get(uuid: string): Promise<Either<AntboxError, ApiKeyDTO>> {
    const nodeOrErr = await this.nodeRepository.getById(uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (!Nodes.isApikey(nodeOrErr.value)) {
      return left(new ApiKeyNodeFoundError(uuid));
    }

    const apiKey = nodeOrErr.value;

    return right(nodeToApiKey(apiKey));
  }

  async getBySecret(secret: string): Promise<Either<AntboxError, ApiKeyDTO>> {
    const nodesOrErr = await this.nodeRepository.filter(
      [["mimetype", "==", Nodes.API_KEY_MIMETYPE]],
      Number.MAX_SAFE_INTEGER,
    );

    if (nodesOrErr.nodes.length === 0) {
      return left(new ApiKeyNodeFoundError(secret));
    }

    const matchingNode = nodesOrErr.nodes.find(async (node) => {
      if (!node.secret) return false;
      return ApiKeyNode.isSecureKey(secret);
    });

    if (!matchingNode) {
      return left(new ApiKeyNodeFoundError(secret));
    }

    return this.get(matchingNode.uuid);
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
