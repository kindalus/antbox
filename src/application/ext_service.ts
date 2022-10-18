import { left, right } from "/shared/either.ts";
import { NodeNotFoundError } from "/domain/nodes/node_not_found_error.ts";
import { Node } from "/domain/nodes/node.ts";
import { UserPrincipal } from "/domain/auth/user_principal.ts";

import { NodeService } from "./node_service.ts";
import { Either } from "../shared/either.ts";

export interface ExtServiceContext {
  readonly nodeService: NodeService;
}

export type ExtFn = (
  request: Request,
  service: NodeService
) => Promise<Response>;

export class ExtService {
  constructor(private readonly context: ExtServiceContext) {}

  private async get(
    principal: UserPrincipal,
    uuid: string
  ): Promise<Either<NodeNotFoundError, ExtFn>> {
    const [nodeError, fileOrError] = await Promise.all([
      this.context.nodeService.get(principal, uuid),
      this.context.nodeService.export(principal, uuid),
    ]);

    if (fileOrError.isLeft()) {
      return left(fileOrError.value);
    }

    if (nodeError.isLeft()) {
      return left(nodeError.value);
    }

    if (nodeError.value.parent !== Node.EXT_FOLDER_UUID) {
      return left(new NodeNotFoundError(uuid));
    }

    const file = fileOrError.value;

    const module = await import(URL.createObjectURL(file));

    return right(module.default);
  }

  async run(
    principal: UserPrincipal,
    uuid: string,
    request: Request
  ): Promise<Either<NodeNotFoundError | Error, Response>> {
    const extOrErr = await this.get(principal, uuid);

    if (extOrErr.isLeft()) {
      return left(extOrErr.value);
    }

    const resp = await extOrErr.value(request, this.context.nodeService);

    return right(resp);
  }
}
