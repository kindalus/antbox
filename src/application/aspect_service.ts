import { AspectNode } from "domain/aspects/aspect_node.ts";
import { AspectNotFoundError } from "domain/aspects/aspect_not_found_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { type AspectDTO, toAspectDTO } from "./aspect_dto.ts";
import type { AuthenticationContext } from "./authentication_context.ts";

import { NodeService } from "./node_service.ts";

export class AspectService {
  constructor(private readonly nodeService: NodeService) {}

  async createOrReplace(
    ctx: AuthenticationContext,
    metadata: AspectDTO,
  ): Promise<Either<AntboxError, AspectDTO>> {
    if (!metadata.uuid) {
      return left(new BadRequestError("Aspect UUID is required"));
    }

    const nodeOrErr = await this.get(ctx, metadata.uuid);
    if (nodeOrErr.isLeft()) {
      return this.#create(ctx, metadata);
    }

    return this.#update(ctx, metadata.uuid, metadata);
  }

  async #create(
    ctx: AuthenticationContext,
    metadata: AspectDTO,
  ): Promise<Either<AntboxError, AspectDTO>> {
    const nodeOrErr = await this.nodeService.create(ctx, {
      ...metadata,
      mimetype: Nodes.ASPECT_MIMETYPE,
    });

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    return right(toAspectDTO(nodeOrErr.value as AspectNode));
  }

  async #update(
    ctx: AuthenticationContext,
    uuid: string,
    metadata: AspectDTO,
  ): Promise<Either<AntboxError, AspectDTO>> {
    const nodeOrErr = await this.nodeService.update(ctx, uuid, metadata);
    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    const aspectOrErr = await this.get(ctx, uuid);
    if (aspectOrErr.isLeft()) {
      return left(aspectOrErr.value);
    }

    return right(aspectOrErr.value);
  }

  async get(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<NodeNotFoundError, AspectDTO>> {
    // const builtin = builtinAspects.find((aspect) => aspect.uuid === uuid);
    // if (builtin) {
    //   return right(builtin);
    // }

    const nodeOrErr = await this.nodeService.get(ctx, uuid);

    if (nodeOrErr.isLeft() && nodeOrErr.value instanceof NodeNotFoundError) {
      return left(new AspectNotFoundError(uuid));
    }

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (!Nodes.isAspect(nodeOrErr.value)) {
      return left(new AspectNotFoundError(uuid));
    }

    return right(toAspectDTO(nodeOrErr.value));
  }

  async list(ctx: AuthenticationContext): Promise<AspectDTO[]> {
    const nodesOrErrs = await this.nodeService.find(
      ctx,
      [
        ["mimetype", "==", Nodes.ASPECT_MIMETYPE],
        ["parent", "==", Folders.ASPECTS_FOLDER_UUID],
      ],
      Number.MAX_SAFE_INTEGER,
    );
    if (nodesOrErrs.isLeft()) {
      console.error(nodesOrErrs.value);
      return [];
    }

    const usersAspects = nodesOrErrs.value.nodes.map((n) =>
      toAspectDTO(n as AspectNode)
    )
      .sort((a, b) => a.title.localeCompare(b.title));

    // return [...usersAspects, ...builtinAspects].sort((a, b) =>
    //   a.title.localeCompare(b.title)
    // );

    return usersAspects;
  }

  async delete(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<AntboxError, void>> {
    const nodeOrErr = await this.get(ctx, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    return this.nodeService.delete(ctx, uuid);
  }

  async export(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<NodeNotFoundError, File>> {
    const aspectOrErr = await this.get(ctx, uuid);
    if (aspectOrErr.isLeft()) {
      return left(aspectOrErr.value);
    }

    const file = new File(
      [JSON.stringify(aspectOrErr.value, null, 2)],
      `${aspectOrErr.value?.uuid}.json`,
      {
        type: "application/json",
      },
    );

    return right(file);
  }
}
