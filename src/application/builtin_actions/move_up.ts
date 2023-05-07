import { INodeService, RunContext } from "../../domain/actions/run_context.ts";

import { Node } from "../../domain/nodes/node.ts";
import { NodeNotFoundError } from "../../domain/nodes/node_not_found_error.ts";
import { AntboxError } from "../../shared/antbox_error.ts";
import { Either, left, right } from "../../shared/either.ts";

export default {
  uuid: "move_up",
  title: "Mover para cima",
  description: "Move o nó para uma pasta acima",
  builtIn: true,
  multiple: false,
  runManually: true,
  runOnCreates: false,
  runOnUpdates: false,
  filters: [],
  params: [],

  async run(
    ctx: RunContext,
    uuids: string[],
    _params?: Record<string, unknown>
  ): Promise<void | Error> {
    const newParentOrErr = await getNewParent(ctx.nodeService, uuids[0]);

    if (newParentOrErr.isLeft()) {
      return newParentOrErr.value;
    }

    const toUpdateTask = updateTaskPredicate(
      ctx.nodeService,
      newParentOrErr.value
    );

    const taskPromises = uuids.map(toUpdateTask);

    const results = await Promise.all(taskPromises);

    const errors = results.filter(errorResultsOnly);

    if (errors.length > 0) {
      return errors[0].value as AntboxError;
    }

    return;
  },
};

function updateTaskPredicate(nodeService: INodeService, parent: string) {
  return (uuid: string) => nodeService.update(uuid, { parent }, true);
}

function errorResultsOnly(voidOrErr: Either<AntboxError, unknown>): boolean {
  return voidOrErr.isLeft();
}

async function getNewParent(
  nodeService: INodeService,
  uuid: string
): Promise<Either<NodeNotFoundError, string>> {
  const nodeOrErr = await nodeService.get(uuid);

  if (nodeOrErr.isLeft()) {
    return left(nodeOrErr.value);
  }

  if (Node.isRootFolder(nodeOrErr.value.parent)) {
    return left(new NodeNotFoundError("Already at root folder"));
  }

  const firstParentOrErr = await nodeService.get(nodeOrErr.value.parent);

  if (firstParentOrErr.isLeft()) {
    return left(firstParentOrErr.value);
  }

  return right(firstParentOrErr.value.parent);
}
