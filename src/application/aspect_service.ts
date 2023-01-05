import { NodeNotFoundError } from "/domain/nodes/node_not_found_error.ts";
import { NodeService } from "./node_service.ts";
import { Either, left, right } from "/shared/either.ts";
import { Aspect } from "/domain/aspects/aspect.ts";

import { Node } from "/domain/nodes/node.ts";
import { ValidationError } from "../domain/nodes/validation_error.ts";
import { AntboxError } from "../shared/antbox_error.ts";

export class AspectService {
  static ASPECTS_FOLDER_UUID = "--aspects--";

  static isAspectsFolder(uuid: string): boolean {
    return uuid === AspectService.ASPECTS_FOLDER_UUID;
  }

  constructor(private readonly nodeService: NodeService) {}

  async createOrReplace(
    file: File,
    metadata: Partial<Node>
  ): Promise<Either<AntboxError, Node>> {
    if (!AspectService.isAspectsFolder(metadata.parent!)) {
      return left(
        ValidationError.fromMsgs("Aspect must be created in the aspects folder")
      );
    }

    if (file.type !== "application/json") {
      return left(ValidationError.fromMsgs("File must be a json file"));
    }

    const aspect = (await file.text().then((t) => JSON.parse(t))) as Aspect;

    return this.nodeService.createFile(file, {
      uuid: aspect.uuid,
      fid: aspect.uuid,
      title: aspect.title,
      ...metadata,
    });
  }

  async get(uuid: string): Promise<Either<NodeNotFoundError, Aspect>> {
    const nodePromise = this.nodeService.get(uuid);
    const aspectPromise = this.nodeService.export(uuid);

    const [nodeOrErr, aspectOrErr] = await Promise.all([
      nodePromise,
      aspectPromise,
    ]);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (aspectOrErr.isLeft()) {
      return left(aspectOrErr.value);
    }

    if (nodeOrErr.value.parent !== AspectService.ASPECTS_FOLDER_UUID) {
      return left(new NodeNotFoundError(uuid));
    }

    const aspect = await this.fileToAspect(aspectOrErr.value);

    return right(aspect);
  }

  fileToAspect(file: File): Promise<Aspect> {
    return file
      .text()
      .then((text) => JSON.parse(text))
      .then((raw) => ({
        uuid: raw.uuid ?? file.name.split(".")[0],
        title: raw.title ?? file.name.split(".")[0],
        description: raw.description ?? "",
        builtIn: false,
        multiple: raw.multiple ?? false,
        filters: raw.filters ?? [],
        aspects: raw.aspects ?? [],
        properties: raw.properties ?? [],
      }));
  }

  static aspectToFile(aspect: Aspect): Promise<File> {
    const raw = JSON.stringify(
      {
        uuid: aspect.uuid,
        title: aspect.title ?? aspect.uuid,
        description: aspect.description,
        builtIn: aspect.builtIn ?? false,
        filters: aspect.filters ?? [],
        properties: aspect.properties ?? [],
      },
      null,
      4
    );

    const f = new File([raw], aspect.uuid + ".json", {
      type: "application/json",
    });

    return Promise.resolve(f);
  }

  list(): Promise<Aspect[]> {
    return this.nodeService
      .list(AspectService.ASPECTS_FOLDER_UUID)
      .then((nodesOrErrs) => nodesOrErrs.value as Node[])
      .then((nodes) => nodes.map((n) => this.get(n.uuid)))
      .then((aspectsPromises) => Promise.all(aspectsPromises))
      .then((aspectsOrErrs) => aspectsOrErrs.map((a) => a.value as Aspect));
  }
}
