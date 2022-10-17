import { UserPrincipal } from "../../domain/auth/user_principal.ts";

import { NodeNotFoundError } from "../../domain/nodes/node_not_found_error.ts";
import { Either } from "../../shared/either.ts";
import { NodeService } from "../node_service.ts";
import { Action, RunContext } from "/domain/actions/action.ts";

export default {
  uuid: "move_to_folder",
  title: "Mover para pasta",
  description: "Move os nós para uma pasta",
  builtIn: true,
  multiple: true,
  filters: [],
  params: ["destination"],
  runManually: true,
  runOnCreates: false,
  runOnUpdates: false,

  async run(
    ctx: RunContext,
    uuids: string[],
    params: Record<string, string>
  ): Promise<void | Error> {
    const parent = params["destination"];

    if (!parent) {
      return new Error("Error parameter not given");
    }

    const toUpdateTask = updateTaskPredicate(
      ctx.nodeService,
      ctx.principal,
      parent
    );

    const taskPromises = uuids.map(toUpdateTask);

    const results = await Promise.all(taskPromises);

    const errors = results.filter(errorResultsOnly);

    if (errors.length > 0) {
      return errors[0].value;
    }

    return;
  },
} as Action;

function updateTaskPredicate(
  nodeService: NodeService,
  principal: UserPrincipal,
  parent: string
) {
  return (uuid: string) =>
    nodeService.update(principal, uuid, { parent }, true);
}

function errorResultsOnly(voidOrErr: Either<NodeNotFoundError, void>): boolean {
  return voidOrErr.isLeft();
}
