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

export type ExtFn = (request: Request, service: NodeService) => Promise<Response>;

export class ExtService {
  constructor(private readonly nodeService: NodeService) {}

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
    metadata: Partial<Node>,
  ): Promise<Either<NodeNotFoundError, void>> {
    const nodeOrErr = await this.get(ctx, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    const safe: Partial<Node> = {};
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

  async list(): Promise<Either<AntboxError, Node[]>> {
    const nodesOrErrs = await this.nodeService.find(
      UsersGroupsService.elevatedContext(),
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

  async delete(ctx: AuthenticationContext, uuid: string): Promise<Either<NodeNotFoundError, void>> {
    const nodeOrErr = await this.get(uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    return this.nodeService.delete(ctx, uuid);
  }

  async export(uuid: string): Promise<Either<NodeNotFoundError, File>> {
    const nodeOrErr = await this.get(uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    return this.nodeService.export(UsersGroupsService.elevatedContext(), uuid);
  }

  async #getAsModule(uuid: string): Promise<Either<NodeNotFoundError, ExtFn>> {
    const [nodeError, fileOrError] = await Promise.all([
      this.get(uuid),
      this.nodeService.export(UsersGroupsService.elevatedContext(), uuid),
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

  async run(uuid: string, request: Request): Promise<Either<NodeNotFoundError | Error, Response>> {
    const extOrErr = await this.#getAsModule(uuid);

    if (extOrErr.isLeft()) {
      return left(extOrErr.value);
    }

    const resp = await extOrErr.value(request, this.nodeService);

    return right(resp);
  }
}
