import { Folders } from "domain/nodes/folders.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { UsersGroupsService } from "./users_groups_service.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import type { NodeService } from "./node_service.ts";
import { NodeLike } from "domain/node_like.ts";
import { ExtServiceContext } from "application/ext_service_context.ts";
import { ExtNode } from "domain/exts/ext_node.ts";

export type ExtFn = (
  request: Request,
  service: NodeService,
) => Promise<Response>;

export class ExtService {
  constructor(
    private readonly context: ExtServiceContext,
  ) {}

  async createOrReplace(
    ctx: AuthenticationContext,
    file: File,
    metadata: Partial<NodeMetadata>,
  ): Promise<Either<AntboxError, NodeLike>> {
    if (metadata.mimetype !== Nodes.EXT_MIMETYPE) {
      return left(new BadRequestError(`Invalid mimetype: ${file.type}`));
    }

    const uuid = metadata.uuid ?? file.name?.split(".")[0].trim();
    const fid = metadata.fid ?? uuid;

    const extOrErr = ExtNode.create({ ...metadata, uuid, fid });
    if (extOrErr.isLeft()) {
      return left(extOrErr.value);
    }

    const nodeOrErr = await this.context.nodeService.get(ctx, uuid);
    if (nodeOrErr.isLeft()) {
      return this.context.nodeService.createFile(ctx, file, extOrErr.value);
    }

    const voidOrErr = await this.context.nodeService.updateFile(
      ctx,
      uuid,
      file,
    );

    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return right(nodeOrErr.value);
  }

  async get(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
    const nodeOrErr = await this.context.nodeService.get(
      UsersGroupsService.elevatedContext,
      uuid,
    );
    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (!Nodes.isExt(nodeOrErr.value)) {
      return left(new NodeNotFoundError(uuid));
    }

    return right(nodeOrErr.value);
  }

  async update(
    ctx: AuthenticationContext,
    uuid: string,
    metadata: Partial<NodeLike>,
  ): Promise<Either<NodeNotFoundError, void>> {
    const nodeOrErr = await this.get(uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    const safe: Partial<NodeLike> = {};
    for (const key of ["title", "description", "aspects", "properties"]) {
      if (Object.hasOwnProperty.call(metadata, key)) {
        // deno-lint-ignore no-explicit-any
        (safe as any)[key] = (metadata as any)[key];
      }
    }

    const voidOrErr = await this.context.nodeService.update(ctx, uuid, safe);

    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return right(undefined);
  }

  async delete(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<NodeNotFoundError, void>> {
    const nodeOrErr = await this.get(uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    return this.context.nodeService.delete(ctx, uuid);
  }

  async list(): Promise<Either<AntboxError, NodeLike[]>> {
    const nodesOrErrs = await this.context.nodeService.find(
      UsersGroupsService.elevatedContext,
      [
        ["mimetype", "==", Nodes.EXT_MIMETYPE],
        ["parent", "==", Folders.EXT_FOLDER_UUID],
      ],
      Number.MAX_SAFE_INTEGER,
    );

    if (nodesOrErrs.isLeft()) {
      return left(nodesOrErrs.value);
    }

    return right(nodesOrErrs.value.nodes);
  }

  async export(
    uuid: string,
  ): Promise<Either<AntboxError, File>> {
    const nodeOrErr = await this.get(uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    return this.context.nodeService.export(
      UsersGroupsService.elevatedContext,
      uuid,
    );
  }

  async #getAsModule(
    uuid: string,
  ): Promise<Either<AntboxError, ExtFn>> {
    const [nodeError, fileOrError] = await Promise.all([
      this.get(uuid),
      this.context.nodeService.export(UsersGroupsService.elevatedContext, uuid),
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
    uuid: string,
    request: Request,
  ): Promise<Either<NodeNotFoundError | Error, Response>> {
    const extOrErr = await this.#getAsModule(uuid);

    if (extOrErr.isLeft()) {
      return left(extOrErr.value);
    }

    const resp = await extOrErr.value(request, this.context.nodeService);

    return right(resp);
  }
}
