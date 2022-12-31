import { left, right } from "/shared/either.ts";
import { NodeNotFoundError } from "/domain/nodes/node_not_found_error.ts";
import { Node } from "/domain/nodes/node.ts";

import { NodeService } from "./node_service.ts";
import { Either } from "../shared/either.ts";
import { FolderNotFoundError } from "../domain/nodes/folder_not_found_error.ts";
import { ValidationError } from "../domain/nodes/validation_error.ts";
import { NodeFactory } from "../domain/nodes/node_factory.ts";

export type ExtFn = (
  request: Request,
  service: NodeService
) => Promise<Response>;

export class ExtService {
  static EXT_FOLDER_UUID = "--ext--";

  static isExtensionsFolder(uuid: string): boolean {
    return uuid === ExtService.EXT_FOLDER_UUID;
  }

  constructor(private readonly nodeService: NodeService) {}

  async createOrReplace(
    file: File,
    metadata: Partial<Node>
  ): Promise<Either<FolderNotFoundError | ValidationError[], void>> {
    if (!ExtService.isExtensionsFolder(metadata.parent!)) {
      return left([
        new ValidationError(
          "Extension must be created in the extensions folder"
        ),
      ]);
    }

    if (!Node.isJavascript(file)) {
      return left([new ValidationError("File must be a javascript file")]);
    }

    const fileNode = NodeFactory.createFileMetadata(
      this.nodeService.uuidGenerator,
      this.nodeService.fidGenerator,
      {
        title: file.name?.split(".")[0] ?? metadata.uuid,
        parent: ExtService.EXT_FOLDER_UUID,
      },
      file.type,
      file.size
    );

    fileNode.uuid = file.name?.split(".")[0] ?? metadata.uuid;
    fileNode.fid = fileNode.uuid;

    await this.nodeService.storage.write(fileNode.uuid, file);
    await this.nodeService.repository.add(fileNode);

    return right(undefined);
  }

  private async get(uuid: string): Promise<Either<NodeNotFoundError, ExtFn>> {
    const [nodeError, fileOrError] = await Promise.all([
      this.nodeService.get(uuid),
      this.nodeService.export(uuid),
    ]);

    if (fileOrError.isLeft()) {
      return left(fileOrError.value);
    }

    if (nodeError.isLeft()) {
      return left(nodeError.value);
    }

    if (nodeError.value.parent !== ExtService.EXT_FOLDER_UUID) {
      return left(new NodeNotFoundError(uuid));
    }

    const file = fileOrError.value;

    const module = await import(URL.createObjectURL(file));

    return right(module.default);
  }

  async run(
    uuid: string,
    request: Request
  ): Promise<Either<NodeNotFoundError | Error, Response>> {
    const extOrErr = await this.get(uuid);

    if (extOrErr.isLeft()) {
      return left(extOrErr.value);
    }

    const resp = await extOrErr.value(request, this.nodeService);

    return right(resp);
  }
}
