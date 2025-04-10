import { Folders } from "domain/nodes/folders";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error";
import { Nodes } from "domain/nodes/nodes";
import { AntboxError, BadRequestError } from "shared/antbox_error";
import { type Either, left, right } from "shared/either";
import type { AuthenticationContext } from "./authentication_context";
import { type ExtDTO, extToNode, nodeToExt } from "./ext_dto";
import { ExtNotFoundError } from "./ext_not_found_error";
import type { NodeService } from "./node_service";
import { UsersGroupsService } from "./users_groups_service";
import type { NodeMetadata } from "domain/nodes/node_metadata";
import type { NodeRepository } from "domain/nodes/node_repository";
import type { StorageProvider } from "./storage_provider";
import type { EventBus } from "shared/event_bus";

export type ExtFn = (request: Request, service: NodeService) => Promise<Response>;

export interface ExtServiceContext {
  readonly repository: NodeRepository;
  readonly storage: StorageProvider;
  readonly bus: EventBus;
}

export class ExtService {
  constructor(
    private readonly context: ExtServiceContext, 
    private readonly nodeService: NodeService,
  ) {}

  async createOrReplace(
    ctx: AuthenticationContext,
    file: File,
    metadata: Partial<ExtDTO>,
  ): Promise<Either<AntboxError, ExtDTO>> {
    if (!Nodes.isExt(metadata)) {
      return left(new BadRequestError(`Invalid mimetype: ${file.type}`));
    }

    const extOrErr = nodeToExt(ctx, file, metadata);
    if (extOrErr.isLeft()) {
      return left(extOrErr.value);
    }

    const ext = extOrErr.value;

    const nodeOrErr = await this.get(ctx, ext.uuid);
    if (nodeOrErr.isLeft()) {
      const result = await this.nodeService.createFile(ctx, file, { 
        uuid: ext.uuid,
        fid: ext.fid,
        title: ext.title,
        description: ext.description,
        mimetype: ext.mimetype,
        size: file.size,
        owner: ext.owner,
      });
      return right(extToNode(result.value));
    }

    const updateFileOrErr = await this.nodeService.updateFile(ctx, ext.uuid, file);
    if (updateFileOrErr.isLeft()) {
      return left(updateFileOrErr.value);
    }

    const updatedNodeOrErr = await this.nodeService.update(ctx, ext.uuid, {
      title: ext.title,
      description: ext.description,
      mimetype: ext.mimetype,
      size: file.size,
    });
    if (updatedNodeOrErr.isLeft()) {
      return left(updatedNodeOrErr.value);
    }

    return right((await this.get(ctx, ext.uuid)).right);
  }

  async get(
    ctx: AuthenticationContext,
    uuid: string
  ): Promise<Either<NodeNotFoundError, ExtDTO>> {
    const nodeOrErr = await this.nodeService.get(ctx, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (!Nodes.isExt(nodeOrErr.value)) {
      return left(new ExtNotFoundError(uuid));
    }

    return right(extToNode(nodeOrErr.value));
  }

  async update(
    ctx: AuthenticationContext,
    uuid: string,
    metadata: Partial<ExtDTO>,
  ): Promise<Either<AntboxError, void>> {
    const nodeOrErr = await this.get(ctx, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    const safe: Partial<NodeMetadata> = {};
    for (const key of ["title", "description", "aspects", "properties"]) {
      if (Object.hasOwnProperty.call(metadata, key)) {
        // deno-lint-ignore no-explicit-any
        (safe as any)[key] = (metadata as any)[key];
      }
    }

    const voidOrErr = await this.nodeService.update(ctx, uuid, safe);

    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return right(undefined);
  }

  async delete(ctx: AuthenticationContext, uuid: string): Promise<Either<NodeNotFoundError, void>> {
    const nodeOrErr = await this.get(ctx, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    return this.nodeService.delete(ctx, uuid);
  }

  async list(): Promise<ExtDTO[]> {
    const nodesOrErrs = await this.context.repository.filter(
      [
        ["mimetype", "==", Nodes.EXT_MIMETYPE],
        ["parent", "==", Folders.EXT_FOLDER_UUID],
      ],
      Number.MAX_SAFE_INTEGER,
    );

    if (nodesOrErrs.nodes.length === 0) {
      return [];
    }

    return nodesOrErrs.nodes.map((node) => extToNode(node));
  }

  async export(ctx: AuthenticationContext, uuid: string): Promise<Either<NodeNotFoundError, File>> {
    const nodeOrErr = await this.get(ctx, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    return this.nodeService.export(ctx, uuid);
  }

  async #getAsModule(ctx: AuthenticationContext, uuid: string): Promise<Either<NodeNotFoundError, ExtFn>> {
    const [nodeError, fileOrError] = await Promise.all([
      this.get(ctx, uuid),
      this.nodeService.export(ctx, uuid),
    ]);

    if (fileOrError.isLeft()) {
      return left(fileOrError.value);
    }

    if (nodeError.isLeft()) {
      return left(nodeError.value);
    }

    const file = fileOrError.value;

    const module = await import(URL.createObjectURL(file));

    return right(module.default);
  }

  async run(
    ctx: AuthenticationContext,
    uuid: string, 
    request: Request
  ): Promise<Either<AntboxError, Response>> {
    const extOrErr = await this.#getAsModule(ctx, uuid);

    if (extOrErr.isLeft()) {
      return left(extOrErr.value);
    }

    const resp = await extOrErr.value(request, this.nodeService);

    return right(resp);
  }
}
