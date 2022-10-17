import { NodeNotFoundError } from "/domain/nodes/node_not_found_error.ts";
import { NodeService } from "./node_service.ts";
import { Either, left, right } from "/shared/either.ts";
import { Aspect } from "/domain/aspects/aspect.ts";

import { AuthService } from "/application/auth_service.ts";
import { UserPrincipal } from "/domain/auth/user_principal.ts";
import { Node } from "/domain/nodes/node.ts";

export interface AspectServiceContext {
  readonly auth: AuthService;
  readonly nodeService: NodeService;
}

export class AspectService {
  private readonly context: AspectServiceContext;

  constructor(context: AspectServiceContext) {
    this.context = context;
  }

  async get(
    principal: UserPrincipal,
    uuid: string
  ): Promise<Either<NodeNotFoundError, Aspect>> {
    const nodePromise = this.context.nodeService.get(principal, uuid);
    const aspectPromise = this.context.nodeService.export(principal, uuid);

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

    if (nodeOrErr.value.parent !== Node.ASPECTS_FOLDER_UUID) {
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

  list(principal: UserPrincipal): Promise<Aspect[]> {
    return this.context.nodeService
      .list(principal, Node.ASPECTS_FOLDER_UUID)
      .then((nodesOrErrs) => nodesOrErrs.value as Node[])
      .then((nodes) => nodes.map((n) => this.get(principal, n.uuid)))
      .then((aspectsPromises) => Promise.all(aspectsPromises))
      .then((aspectsOrErrs) => aspectsOrErrs.map((a) => a.value as Aspect));
  }
}
