import { Either } from "/shared/either.ts";
import { NodeService } from "/application/node_service.ts";
import { UserPrincipal } from "/domain/auth/user_principal.ts";
import { Action, RunContext } from "/domain/actions/action.ts";
import { NodeNotFoundError } from "../../domain/nodes/node_not_found_error.ts";

export default {
  uuid: "delete_all",
  title: "Eliminar",
  description: "Elimina todos os nós selecionados",
  builtIn: true,
  multiple: false,
  filters: [],
  params: [],
  runManually: true,
  runOnCreates: false,
  runOnUpdates: false,

  async run(
    ctx: RunContext,
    uuids: string[],
    _params?: Record<string, unknown>
  ): Promise<void | Error> {
    const toDeleteTask = deleteTaskPredicate(ctx.principal, ctx.nodeService);
    const tasks = uuids.map(toDeleteTask);

    const results = await Promise.all(tasks);

    const errors = results.filter(errorResultsOnly);

    if (errors.length > 0) {
      return errors[0].value;
    }

    return;
  },
} as Action;

function errorResultsOnly(voidOrErr: Either<NodeNotFoundError, void>): boolean {
  return voidOrErr.isLeft();
}

function deleteTaskPredicate(
  principal: UserPrincipal,
  nodeService: NodeService
) {
  return (uuid: string) => nodeService.delete(principal, uuid);
}
