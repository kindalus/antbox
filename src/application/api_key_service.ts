import { ApiKeyNode } from "domain/api_keys/api_key_node.ts";
import { ApiKeyNodeFoundError } from "domain/api_keys/api_key_node_found_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { UuidGenerator } from "shared/uuid_generator.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { AuthService } from "./auth_service.ts";
import { type AuthenticationContext } from "./authentication_context.ts";
import { builtinGroups } from "./builtin_groups/mod.ts";
import { NodeService } from "./node_service.ts";

export class ApiKeyService {
  readonly #nodeService: NodeService;
  readonly #uuidGenerator: UuidGenerator;

  constructor(nodeService: NodeService, uuidGenerator: UuidGenerator) {
    this.#nodeService = nodeService;
    this.#uuidGenerator = uuidGenerator;
  }

  async create(
    ctx: AuthenticationContext,
    group: string,
    owner: string,
    description: string,
  ): Promise<Either<AntboxError, ApiKeyNode>> {
    const builtinGroup = builtinGroups.find((g) => g.uuid === group);

    const groupsOrErr = await this.#nodeService.get(ctx, group);
    if (groupsOrErr.isLeft() && !builtinGroup) {
      return left(groupsOrErr.value);
    }

    const apiKey = ApiKeyNode.create({
      group,
      secret: this.#uuidGenerator.generate(10),
      description,
      owner,
    });

    const nodeOrErr = await this.#nodeService.create(ctx, apiKey.right);
    return nodeOrErr as Either<AntboxError, ApiKeyNode>;
  }

  async get(uuid: string): Promise<Either<AntboxError, ApiKeyNode>> {
    const nodeOrErr = await this.#nodeService.get(
      AuthService.elevatedContext(),
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
      AuthService.elevatedContext(),
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
