import type { Action } from "domain/actions/action";
import type { RunContext } from "domain/actions/run_context";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { Nodes } from "domain/nodes/nodes";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either } from "shared/either.ts";

export default {
  uuid: "delete_all",
  title: "Eliminar",
  description: "Elimina todos os nós selecionados",
  builtIn: true,
  multiple: false,
  filters: [["mimetype", "not-in", Nodes.SYSTEM_MIMETYPES]],
  groupsAllowed: [],
  params: [],
  runManually: true,
  runOnCreates: false,
  runOnUpdates: false,

  async run(
    ctx: RunContext,
    uuids: string[],
    _params?: Record<string, unknown>,
  ): Promise<void | Error> {
    const tasks = uuids.map((uuid) => ctx.nodeService.delete(ctx.authenticationContext, uuid));

    const results = await Promise.all(tasks);

    const errors = results.filter(errorResultsOnly);

    if (errors.length > 0) {
      errors.forEach((e) => console.error((e.value as AntboxError).message));
      return errors[0].value;
    }

    return;
  },
} as Action;

function errorResultsOnly(voidOrErr: Either<NodeNotFoundError, void>): boolean {
  return voidOrErr.isLeft();
}
