import type { AuthenticationContext } from "application/authentication_context.ts";
import type { NodeService } from "application/node_service.ts";
import type { Action } from "domain/actions/action.ts";
import type { RunContext } from "domain/actions/run_context.ts";
import { Folders } from "domain/nodes/folders.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";

export default {
  uuid: "move_up",
  title: "Mover para cima",
  description: "Move o nó para uma pasta acima",
  builtIn: true,
  multiple: false,
  runManually: true,
  runOnCreates: false,
  runOnUpdates: false,
  filters: [
    [
      "parent",
      "not-in",
      [
        Folders.ACTIONS_FOLDER_UUID,
        Folders.ASPECTS_FOLDER_UUID,
        Folders.EXT_FOLDER_UUID,
        Folders.GROUPS_FOLDER_UUID,
        Folders.ROOT_FOLDER_UUID,
        Folders.SYSTEM_FOLDER_UUID,
        Folders.USERS_FOLDER_UUID,
      ],
    ],
  ],
  groupsAllowed: [],
  params: [],

  async run(
    ctx: RunContext,
    uuids: string[],
    _params?: Record<string, unknown>,
  ): Promise<void | Error> {
    const newParentOrErr = await getNewParent(
      ctx.authenticationContext,
      ctx.nodeService,
      uuids[0],
    );

    if (newParentOrErr.isLeft()) {
      return newParentOrErr.value;
    }

    const toUpdateTask = updateTaskPredicate(
      ctx.authenticationContext,
      ctx.nodeService,
      newParentOrErr.value,
    );

    const taskPromises = uuids.map(toUpdateTask);

    const results = await Promise.all(taskPromises);

    const errors = results.filter(errorResultsOnly);

    if (errors.length > 0) {
      return errors[0].value as AntboxError;
    }

    return;
  },
} as Action;

function updateTaskPredicate(
  ctx: AuthenticationContext,
  nodeService: NodeService,
  parent: string,
) {
  return (uuid: string) => nodeService.update(ctx, uuid, { parent });
}

function errorResultsOnly(voidOrErr: Either<AntboxError, unknown>): boolean {
  return voidOrErr.isLeft();
}

async function getNewParent(
  ctx: AuthenticationContext,
  nodeService: NodeService,
  uuid: string,
): Promise<Either<NodeNotFoundError, string>> {
  const nodeOrErr = await nodeService.get(ctx, uuid);

  if (nodeOrErr.isLeft()) {
    return left(nodeOrErr.value);
  }

  if (Folders.ROOT_FOLDER_UUID === nodeOrErr.value.parent) {
    return left(new NodeNotFoundError("Already at root folder"));
  }

  const firstParentOrErr = await nodeService.get(ctx, nodeOrErr.value.parent);

  if (firstParentOrErr.isLeft()) {
    return left(firstParentOrErr.value);
  }

  return right(firstParentOrErr.value.parent);
}
