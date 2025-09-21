import type { RunContext } from "domain/features/feature_run_context.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either } from "shared/either.ts";
import { Feature } from "domain/features/feature.ts";

export default {
  uuid: "delete_all",
  title: "Eliminar",
  description: "Elimina todos os nós seleccionados",
  builtIn: true,
  multiple: false,
  filters: [["mimetype", "not-in", Nodes.SYSTEM_MIMETYPES]],
  groupsAllowed: [],
  parameters: [],
  runManually: true,
  runOnCreates: false,
  runOnUpdates: false,

  async run(
    ctx: RunContext,
    uuids: string[],
    _params?: Record<string, unknown>,
  ): Promise<void | Error> {
    const tasks = uuids.map((uuid) =>
      ctx.nodeService.delete(ctx.authenticationContext, uuid)
    );

    const results = await Promise.all(tasks);

    const errors = results.filter(errorResultsOnly);

    if (errors.length > 0) {
      errors.forEach((e) => console.error((e.value as AntboxError).message));
      return errors[0].value;
    }

    return;
  },
} as unknown as Feature;

function errorResultsOnly(voidOrErr: Either<NodeNotFoundError, void>): boolean {
  return voidOrErr.isLeft();
}
