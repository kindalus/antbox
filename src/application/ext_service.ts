import { Node } from "../domain/nodes/node.ts";
import { NodeFactory } from "../domain/nodes/node_factory.ts";
import { NodeNotFoundError } from "../domain/nodes/node_not_found_error.ts";
import { AntboxError, BadRequestError } from "../shared/antbox_error.ts";
import { Either, left, right } from "../shared/either.ts";
import { NodeService } from "./node_service.ts";

export type ExtFn = (
  request: Request,
  service: NodeService,
) => Promise<Response>;

export class ExtService {
  constructor(private readonly nodeService: NodeService) {}

  async createOrReplace(
    file: File,
    metadata: Partial<Node>,
  ): Promise<Either<AntboxError, Node>> {
    if (metadata.mimetype !== Node.EXT_MIMETYPE) {
      return left(new BadRequestError(`Invalid mimetype: ${file.type}`));
    }

    const uuid = metadata.uuid ?? file.name?.split(".")[0].trim();
    const fid = metadata.fid ?? uuid;

    const m = NodeFactory.createMetadata(
      uuid,
      fid,
      Node.EXT_MIMETYPE,
      file.size,
      {
        title: metadata.title ?? uuid,
        parent: Folders.EXT_FOLDER_UUID,
        description: metadata.description ?? "",
        aspects: metadata.aspects ?? [],
        properties: metadata.properties ?? {},
      },
    );

    const nodeOrErr = await this.nodeService.get(uuid);
    if (nodeOrErr.isLeft()) {
      return this.nodeService.createFile(file, m);
    }

    const voidOrErr = await this.nodeService.updateFile(uuid, file);

    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return right(nodeOrErr.value);
  }

  async get(uuid: string): Promise<Either<NodeNotFoundError, Node>> {
    const nodeOrErr = await this.nodeService.get(uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (!nodeOrErr.value.isExt()) {
      return left(new NodeNotFoundError(uuid));
    }

    return right(nodeOrErr.value);
  }

  async update(
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

    const voidOrErr = await this.nodeService.update(uuid, safe);

    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    return right(undefined);
  }

  async list(): Promise<Either<AntboxError, Node[]>> {
    const nodesOrErrs = await this.nodeService.find(
      [
        ["mimetype", "==", Node.EXT_MIMETYPE],
        ["parent", "==", Folders.EXT_FOLDER_UUID],
      ],
      Number.MAX_SAFE_INTEGER,
    );

    if (nodesOrErrs.isLeft()) {
      return left(nodesOrErrs.value);
    }

    return right(nodesOrErrs.value.nodes);
  }

  async delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
    const nodeOrErr = await this.get(uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    return this.nodeService.delete(uuid);
  }

  async export(uuid: string): Promise<Either<NodeNotFoundError, File>> {
    const nodeOrErr = await this.get(uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    return this.nodeService.export(uuid);
  }

  async #getAsModule(uuid: string): Promise<Either<NodeNotFoundError, ExtFn>> {
    const [nodeError, fileOrError] = await Promise.all([
      this.get(uuid),
      this.nodeService.export(uuid),
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

    const resp = await extOrErr.value(request, this.nodeService);

    return right(resp);
  }
}
