import { ExtNode } from "domain/exts/ext_node";
import { Folders } from "domain/nodes/folders";
import type { NodeMetadata } from "domain/nodes/node_metadata";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error";
import { Nodes } from "domain/nodes/nodes";
import { AntboxError, BadRequestError } from "shared/antbox_error";
import { type Either, left, right } from "shared/either";
import { AuthService } from "./auth_service";
import type { AuthenticationContext } from "./authentication_context";
import type { NodeService } from "./node_service";

export type ExtFn = (request: Request, service: NodeService) => Promise<Response>;

export class ExtService {
  constructor(private readonly nodeService: NodeService) {}

  async createOrReplace(
    ctx: AuthenticationContext,
    file: File,
    metadata: Partial<NodeMetadata>,
  ): Promise<Either<AntboxError, Node>> {
    if (metadata.mimetype !== Nodes.EXT_MIMETYPE) {
      return left(new BadRequestError(`Invalid mimetype: ${file.type}`));
    }

    const uuid = metadata.uuid ?? file.name?.split(".")[0].trim();
    const fid = metadata.fid ?? uuid;

    const extOrErr = ExtNode.create({ ...metadata, uuid, fid });
    if (extOrErr.isLeft()) {
      return left(extOrErr.value);
    }

    const nodeOrErr = await this.nodeService.get(ctx, uuid);
    if (nodeOrErr.isLeft()) {
      return this.nodeService.createFile(ctx, file, extOrErr.value);
    }

    const voidOrErr = await this.nodeService.updateFile(ctx, uuid, file);

    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return right(nodeOrErr.value);
  }

  async get(uuid: string): Promise<Either<NodeNotFoundError, Node>> {
    const nodeOrErr = await this.nodeService.get(AuthService.elevatedContext(), uuid);

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
    metadata: Partial<Node>,
  ): Promise<Either<NodeNotFoundError, void>> {
    const nodeOrErr = await this.get(uuid);

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
      AuthService.elevatedContext(),
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

    return this.nodeService.export(AuthService.elevatedContext(), uuid);
  }

  async #getAsModule(uuid: string): Promise<Either<NodeNotFoundError, ExtFn>> {
    const [nodeError, fileOrError] = await Promise.all([
      this.get(uuid),
      this.nodeService.export(AuthService.elevatedContext(), uuid),
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
